// Swiss hourly Price Forward Curve model (fundamental, merit-order based).
//
//   1. Build hourly Swiss fundamentals (demand, PV, wind, nuclear, hydro...).
//   2. Build the residual load of the coupled neighbour region (DE/FR/IT/AT) and
//      translate it into a regional price through a calibrated merit-order curve
//      driven by gas & CO2 short-run marginal costs.
//   3. Couple Switzerland to the region: the Swiss net import need shifts the
//      regional residual load; beyond the net transfer capacities (minus transit
//      flows) Swiss prices decouple (scarcity premium or surplus discount).
//   4. Dispatch Swiss flexibility against the resulting prices: storage hydro
//      (weekly water-value dispatch), pumped storage, batteries and demand-side
//      management (daily arbitrage). Iterate until prices and dispatch agree.

import { buildCalendar } from './calendar.js';
import { weatherYear } from './weather.js';
import defaultCalibration from './calibration.json' with { type: 'json' };

const W_DAY = [0.80, 0.77, 0.76, 0.76, 0.78, 0.84, 0.95, 1.06, 1.12, 1.14, 1.15, 1.15, 1.12, 1.12, 1.12, 1.10, 1.09, 1.10, 1.11, 1.08, 1.03, 0.97, 0.90, 0.84];
const SAT = [0.80, 0.77, 0.75, 0.74, 0.74, 0.76, 0.80, 0.86, 0.93, 0.98, 1.00, 1.00, 0.98, 0.95, 0.93, 0.92, 0.93, 0.97, 1.00, 0.99, 0.95, 0.91, 0.86, 0.82];
const SUN = [0.78, 0.75, 0.73, 0.72, 0.72, 0.72, 0.74, 0.77, 0.82, 0.87, 0.90, 0.91, 0.89, 0.86, 0.84, 0.84, 0.86, 0.92, 0.97, 0.98, 0.95, 0.90, 0.85, 0.80];
const SHAPES = [W_DAY, SAT, SUN];
const DAY_LEVEL = [1.0, 0.86, 0.79];
const EV_SHAPE = [0.9, 0.7, 0.5, 0.4, 0.35, 0.35, 0.45, 0.6, 0.7, 0.75, 0.75, 0.75, 0.75, 0.8, 0.85, 0.95, 1.15, 1.6, 2.0, 2.1, 1.9, 1.6, 1.3, 1.1];
const HP_SHAPE = [0.85, 0.85, 0.85, 0.9, 1.0, 1.2, 1.35, 1.35, 1.2, 1.05, 0.95, 0.9, 0.85, 0.85, 0.85, 0.9, 0.95, 1.05, 1.15, 1.15, 1.1, 1.0, 0.95, 0.9];

const TWH_TO_GW = 1000 / 8760; // TWh/yr -> average GW

function normalise(arr) {
  let s = 0;
  for (let i = 0; i < arr.length; i++) s += arr[i];
  const m = s / arr.length;
  if (m > 0) for (let i = 0; i < arr.length; i++) arr[i] /= m;
  return arr;
}

/** Build the merit-order price function for given fuel prices. */
export function meritOrder(params, calib = defaultCalibration) {
  const mo = calib.meritOrder;
  const ccgt = (params.gas + params.co2 * mo.emissionFactor) / mo.ccgtEfficiency + mo.ccgtVom;
  const ocgt = (params.gas + params.co2 * mo.emissionFactor) / mo.ocgtEfficiency + mo.ocgtVom;
  const xs = [], ps = [];
  for (const [x, kind, m] of mo.points) {
    xs.push(x);
    ps.push(kind === 'floor' ? params.negFloor * m : kind === 'abs' ? m : kind === 'ccgt' ? ccgt * m : ocgt * m);
  }
  // enforce monotonicity (a very shallow floor could otherwise invert the curve)
  for (let k = 1; k < ps.length; k++) if (ps[k] < ps[k - 1]) ps[k] = ps[k - 1];
  const n = xs.length;
  const slopeHi = (ps[n - 1] - ps[n - 2]) / (xs[n - 1] - xs[n - 2]);
  const cap = mo.priceCap;
  const fn = (x) => {
    if (x <= xs[0]) return ps[0];
    if (x >= xs[n - 1]) return Math.min(cap, ps[n - 1] + 1.6 * slopeHi * (x - xs[n - 1]));
    let k = 1;
    while (x > xs[k]) k++;
    const t = (x - xs[k - 1]) / (xs[k] - xs[k - 1]);
    return ps[k - 1] + t * (ps[k] - ps[k - 1]);
  };
  return { fn, ccgt, ocgt, xs, ps };
}

/**
 * Run the model for one scenario and one weather year.
 * @param {object} params scenario parameters (see scenarios.js)
 * @param {object} [opts] { seed, calibration, iterations }
 */
export function runModel(params, opts = {}) {
  const seed = opts.seed ?? 1;
  const calib = opts.calibration ?? defaultCalibration;
  const iterations = opts.iterations ?? 4;
  const cal = buildCalendar(2035);
  const wx = weatherYear(seed, 2035);
  const { H, days } = cal;
  const cp = calib.coupling;
  const hy = calib.hydro;

  // ---------------------------------------------------------------- demand
  const baseShape = new Float64Array(H), hpShape = new Float64Array(H), evShape = new Float64Array(H);
  const regDemand = new Float64Array(H);
  for (let i = 0; i < H; i++) {
    const d = cal.doy[i], h = cal.hour[i], t = cal.dayType[i];
    const winter = Math.cos(2 * Math.PI * (d - 15) / 365);
    const tempEff = 1 + 0.0035 * (12 - wx.temp[i]);
    baseShape[i] = (1 + 0.1 * winter) * SHAPES[t][h] * DAY_LEVEL[t] * tempEff;
    hpShape[i] = Math.max(0, 15 - wx.temp[i]) * HP_SHAPE[h];
    evShape[i] = EV_SHAPE[h] * (t === 0 ? 1 : 0.85);
    regDemand[i] = (1 + 0.09 * winter) * SHAPES[t][h] * DAY_LEVEL[t] * (1 + 0.002 * (12 - wx.temp[i]));
  }
  normalise(baseShape); normalise(hpShape); normalise(evShape); normalise(regDemand);

  const demand = new Float64Array(H);
  for (let i = 0; i < H; i++) {
    demand[i] = TWH_TO_GW * (params.demandBase * baseShape[i] + params.heatPumps * hpShape[i] + params.eMobility * evShape[i]);
  }

  // ---------------------------------------------------------------- Swiss supply
  const pv = new Float64Array(H), pvClipped = new Float64Array(H), wind = new Float64Array(H), other = new Float64Array(H);
  const nuclear = new Float64Array(H), ror = new Float64Array(H);
  const pvCapGW = params.pv / 1.0; // ~1000 kWh/kWp specific yield
  const pvLimit = pvCapGW * params.pvFeedInCap / 100;
  const monthHours = new Array(12).fill(0);
  for (let i = 0; i < H; i++) monthHours[cal.month[i]]++;
  let rorSum = 0;
  for (const v of hy.rorMonthly) rorSum += v;
  for (let i = 0; i < H; i++) {
    const d = cal.doy[i], m = cal.month[i];
    const winter = Math.cos(2 * Math.PI * (d - 15) / 365);
    const raw = params.pv * TWH_TO_GW * wx.pvCH[i];
    pv[i] = Math.min(raw, pvLimit);
    pvClipped[i] = raw - pv[i];
    wind[i] = params.wind * TWH_TO_GW * wx.windCH[i];
    other[i] = params.otherRes * TWH_TO_GW * (1 + 0.15 * winter);
    const avail = 0.95 - (d >= 140 && d < 196 ? 0.4 : 0);
    nuclear[i] = params.nuclear * avail;
    ror[i] = params.hydroRoR * 1000 * (hy.rorMonthly[m] / rorSum) / monthHours[m] * wx.hydrology * (1 + 0.03 * Math.sin(2 * Math.PI * (cal.hour[i] - 6) / 24));
  }

  // Storage hydro energy budget per day (GWh)
  let stoSum = 0;
  for (const v of hy.storageMonthly) stoSum += v;
  const monthDays = new Array(12).fill(0);
  for (const di of cal.dayInfo) monthDays[di.month]++;
  const monthlyBudget = hy.storageMonthly.map((v, m) => {
    let e = params.hydroStorage * 1000 * (v / stoSum) * wx.hydrology;
    if (m >= 4 && m <= 7) e -= params.winterShift * 1000 / 4;
    if (m === 10 || m === 11 || m === 0 || m === 1) e += params.winterShift * 1000 / 4;
    return Math.max(0, e);
  });
  // group days into ~weekly blocks (52 blocks, last one 8 days)
  const blocks = [];
  for (let w = 0; w < 52; w++) {
    const d0 = w * 7, d1 = w === 51 ? days : d0 + 7;
    let budget = 0;
    for (let d = d0; d < d1; d++) budget += monthlyBudget[cal.dayInfo[d].month] / monthDays[cal.dayInfo[d].month];
    blocks.push({ h0: d0 * 24, h1: d1 * 24, budget });
  }

  // ---------------------------------------------------------------- neighbours
  const xReg = new Float64Array(H);
  const pvEUs = params.euPvShare / 100, windEUs = params.euWindShare / 100, baseEUs = params.euBaseShare / 100;
  for (let i = 0; i < H; i++) {
    const winter = Math.cos(2 * Math.PI * (cal.doy[i] - 15) / 365);
    xReg[i] = regDemand[i] - pvEUs * wx.pvEU[i] - windEUs * wx.windEU[i] - baseEUs * (1 + 0.07 * winter);
  }
  // regional flexibility (batteries/DSM in DE-FR-IT) flattens intra-day residual load
  const alpha = params.euFlex / 100;
  if (alpha > 0) {
    const phi = 0.03 + 0.45 * alpha;
    const adj = new Float64Array(24);
    for (let d = 0; d < days; d++) {
      const o = d * 24;
      let mean = 0;
      for (let h = 0; h < 24; h++) mean += xReg[o + h];
      mean /= 24;
      let am = 0;
      for (let h = 0; h < 24; h++) { adj[h] = Math.max(-phi, Math.min(phi, 1.5 * alpha * (mean - xReg[o + h]))); am += adj[h]; }
      am /= 24;
      for (let h = 0; h < 24; h++) xReg[o + h] += adj[h] - am;
    }
  }

  // ---------------------------------------------------------------- price function
  const mo = meritOrder(params, calib);
  const Dreg = cp.regionalDemandGW;
  const transit = new Float64Array(H);
  for (let i = 0; i < H; i++) {
    const winter = 0.5 + 0.5 * Math.cos(2 * Math.PI * (cal.doy[i] - 15) / 365);
    const night = cal.hour[i] < 6 || cal.hour[i] >= 22 ? 1.25 : 1; // IT imports more at night
    transit[i] = (cp.transitSummerGW + (cp.transitWinterGW - cp.transitSummerGW) * winter) * night;
  }
  const floor = Math.min(params.negFloor, -1);
  const priceAt = (i, N) => {
    let p = mo.fn(xReg[i] + N / Dreg) + cp.swissPremium;
    const imp = params.importCap - transit[i];
    if (N > imp) p += cp.importSlope * (N - imp);
    // Swiss surplus beyond export capacity: price decouples downwards, but Swiss
    // PV/run-of-river curtail rather than pay to produce -> bounded at 0 (or the
    // regional price if that is already negative).
    if (-N > params.exportCap) p = Math.max(Math.min(p, 0), p - cp.exportSlope * (-N - params.exportCap));
    return Math.max(floor, Math.min(calib.meritOrder.priceCap, p));
  };

  // ---------------------------------------------------------------- dispatch
  const nFixed = new Float64Array(H);
  for (let i = 0; i < H; i++) nFixed[i] = demand[i] - pv[i] - wind[i] - other[i] - nuclear[i] - ror[i];

  const storage = new Float64Array(H);
  for (const b of blocks) {
    const avg = b.budget / (b.h1 - b.h0);
    for (let i = b.h0; i < b.h1; i++) storage[i] = Math.min(params.hydroStorageGW, avg);
  }
  const devices = [
    { id: 'pumped', P: params.pumpedGW, E: params.pumpedGW * 8, eta: 0.78, cost: 1.5 },
    { id: 'battery', P: params.batteryGW, E: params.batteryGW * params.batteryHours, eta: 0.88, cost: 4 },
    { id: 'dsm', P: 0, E: 0, eta: 0.97, cost: 2, dsm: params.dsmShare / 100 },
  ].map((dv) => ({ ...dv, f: new Float64Array(H) }));
  const flexNet = new Float64Array(H);
  const price = new Float64Array(H);
  const N = new Float64Array(H);
  const sigS = hy.dispatchSoftness;
  const capS = params.hydroStorageGW, minS = capS * hy.minRelease;

  const updatePrices = (h0, h1) => {
    for (let i = h0; i < h1; i++) {
      N[i] = nFixed[i] - storage[i] + flexNet[i];
      price[i] = priceAt(i, N[i]);
    }
  };

  for (let it = 0; it < iterations; it++) {
    updatePrices(0, H);
    // --- storage hydro: water-value dispatch per week (smooth "bid above lambda")
    const damp = it === 0 ? 1 : 0.5;
    for (const b of blocks) {
      const n = b.h1 - b.h0;
      const target = Math.min(b.budget, capS * n);
      const dispatch = (lam) => {
        let s = 0;
        for (let i = b.h0; i < b.h1; i++) s += minS + (capS - minS) / (1 + Math.exp(-(price[i] - lam) / sigS));
        return s;
      };
      let lo = -500, hi = 2000;
      if (target <= minS * n) {
        for (let i = b.h0; i < b.h1; i++) storage[i] = (1 - damp) * storage[i] + damp * (target / n);
        continue;
      }
      for (let k = 0; k < 40; k++) {
        const mid = 0.5 * (lo + hi);
        if (dispatch(mid) > target) lo = mid; else hi = mid;
      }
      const lam = 0.5 * (lo + hi);
      for (let i = b.h0; i < b.h1; i++) {
        const s = minS + (capS - minS) / (1 + Math.exp(-(price[i] - lam) / sigS));
        storage[i] = (1 - damp) * storage[i] + damp * s;
      }
    }
    // --- daily arbitrage of pumped storage, batteries and DSM
    for (const dv of devices) dv.f.fill(0);
    flexNet.fill(0);
    updatePrices(0, H);
    for (let d = 0; d < days; d++) {
      const o = d * 24;
      for (const dv of devices) {
        let P = dv.P, E = dv.E;
        if (dv.dsm !== undefined) {
          let dayE = 0;
          for (let h = 0; h < 24; h++) dayE += demand[o + h];
          E = dayE * dv.dsm; P = E / 4;
        }
        if (P <= 0.001 || E <= 0.001) continue;
        const chunk = Math.min(E / 12, P / 2);
        let charged = 0;
        for (let step = 0; step < 48 && charged + 1e-9 < E; step++) {
          let lo = -1, hi = -1, pLo = Infinity, pHi = -Infinity;
          for (let h = 0; h < 24; h++) {
            const i = o + h, p = price[i];
            if (dv.f[i] + chunk <= P + 1e-9 && p < pLo) { pLo = p; lo = i; }
            if (dv.f[i] - chunk * dv.eta >= -P - 1e-9 && p > pHi) { pHi = p; hi = i; }
          }
          if (lo < 0 || hi < 0 || lo === hi) break;
          if (pHi * dv.eta - pLo - dv.cost <= 0) break;
          dv.f[lo] += chunk; dv.f[hi] -= chunk * dv.eta;
          flexNet[lo] += chunk; flexNet[hi] -= chunk * dv.eta;
          charged += chunk;
          updatePrices(lo, lo + 1); updatePrices(hi, hi + 1);
        }
      }
    }
  }
  updatePrices(0, H);

  const regionalPrice = new Float64Array(H);
  for (let i = 0; i < H; i++) regionalPrice[i] = mo.fn(xReg[i]);

  return {
    params, seed, cal, mo,
    price, regionalPrice, demand, pv, pvClipped, wind, other, nuclear, ror, storage,
    pumped: devices[0].f, battery: devices[1].f, dsm: devices[2].f,
    netImport: N, xReg, transit,
  };
}

// ---------------------------------------------------------------- KPIs
export function computeKpis(r) {
  const { price, pv, cal } = r;
  const H = price.length;
  let s = 0, s2 = 0, neg = 0, pk = 0, nPk = 0, op = 0, nOp = 0, pvRev = 0, pvE = 0;
  let sm = 0, nSm = 0, we = 0, nWe = 0, win = 0, nWin = 0, sum = 0, nSum = 0, imp = 0, exp = 0, dem = 0;
  for (let i = 0; i < H; i++) {
    const p = price[i], h = cal.hour[i], m = cal.month[i];
    s += p; s2 += p * p;
    if (p < 0) neg++;
    if (cal.dayType[i] === 0 && h >= 8 && h < 20) { pk += p; nPk++; } else { op += p; nOp++; }
    pvRev += p * pv[i]; pvE += pv[i];
    const summerHalf = m >= 3 && m <= 8;
    if (summerHalf && h >= 11 && h < 15) { sm += p; nSm++; }
    if (!summerHalf && h >= 17 && h < 21) { we += p; nWe++; }
    if (summerHalf) { sum += p; nSum++; } else { win += p; nWin++; }
    if (r.netImport[i] > 0) imp += r.netImport[i]; else exp -= r.netImport[i];
    dem += r.demand[i];
  }
  const base = s / H;
  const capture = pvE > 0 ? pvRev / pvE : base;
  return {
    base,
    peak: pk / nPk,
    offpeak: op / nOp,
    std: Math.sqrt(Math.max(0, s2 / H - base * base)),
    negHours: neg,
    pvCapture: capture,
    pvCaptureRate: capture / base,
    summerMidday: sm / nSm,
    winterEvening: we / nWe,
    winterAvg: win / nWin,
    summerAvg: sum / nSum,
    netImportTWh: (imp - exp) / 1000,
    importTWh: imp / 1000,
    exportTWh: exp / 1000,
    demandTWh: dem / 1000,
    pvTWh: pvE / 1000,
  };
}

export const KPI_DEFS = [
  { key: 'base', label: 'Baseload', unit: '€/MWh' },
  { key: 'peak', label: 'Peak (Mon–Fri 8–20h)', unit: '€/MWh' },
  { key: 'summerMidday', label: 'Summer midday (Apr–Sep 11–15h)', unit: '€/MWh' },
  { key: 'winterEvening', label: 'Winter evening (Oct–Mar 17–21h)', unit: '€/MWh' },
  { key: 'pvCaptureRate', label: 'PV capture rate', unit: '%', pct: true },
  { key: 'negHours', label: 'Negative hours', unit: 'h' },
  { key: 'std', label: 'Hourly volatility (σ)', unit: '€/MWh' },
];

// ---------------------------------------------------------------- aggregations
export function hourMonthMatrix(price, cal) {
  const sum = Array.from({ length: 12 }, () => new Float64Array(24));
  const cnt = Array.from({ length: 12 }, () => new Float64Array(24));
  for (let i = 0; i < price.length; i++) { sum[cal.month[i]][cal.hour[i]] += price[i]; cnt[cal.month[i]][cal.hour[i]]++; }
  return sum.map((row, m) => Array.from(row, (v, h) => v / cnt[m][h]));
}

export const SEASONS = [
  { id: 'winter', label: 'Winter (DJF)', months: [11, 0, 1] },
  { id: 'spring', label: 'Spring (MAM)', months: [2, 3, 4] },
  { id: 'summer', label: 'Summer (JJA)', months: [5, 6, 7] },
  { id: 'autumn', label: 'Autumn (SON)', months: [8, 9, 10] },
];

export function seasonalProfile(series, cal, months) {
  const s = new Float64Array(24), c = new Float64Array(24);
  const set = new Set(months);
  for (let i = 0; i < series.length; i++) if (set.has(cal.month[i])) { s[cal.hour[i]] += series[i]; c[cal.hour[i]]++; }
  return Array.from(s, (v, h) => v / c[h]);
}

export function monthlyStats(r) {
  const { price, cal } = r;
  const out = Array.from({ length: 12 }, () => ({ s: 0, n: 0, pk: 0, npk: 0, op: 0, nop: 0 }));
  for (let i = 0; i < price.length; i++) {
    const o = out[cal.month[i]];
    o.s += price[i]; o.n++;
    if (cal.dayType[i] === 0 && cal.hour[i] >= 8 && cal.hour[i] < 20) { o.pk += price[i]; o.npk++; } else { o.op += price[i]; o.nop++; }
  }
  return out.map((o) => ({ base: o.s / o.n, peak: o.pk / o.npk, offpeak: o.op / o.nop }));
}

export function durationCurve(price, points = 200) {
  const sorted = Float64Array.from(price).sort().reverse();
  const out = [];
  for (let k = 0; k < points; k++) {
    const idx = Math.min(sorted.length - 1, Math.round((k / (points - 1)) * (sorted.length - 1)));
    out.push({ h: idx + 1, p: sorted[idx] });
  }
  return out;
}

/** Standardised OLS of hourly price on fundamental drivers (attribution on model output). */
export function driverAttribution(r) {
  const H = r.price.length;
  const H0 = r.price.length;
  const swissRes = new Float64Array(H0);
  for (let i = 0; i < H0; i++) swissRes[i] = r.demand[i] - r.pv[i] - r.wind[i] - r.nuclear[i] - r.ror[i] - r.other[i];
  const feats = [
    { key: 'Neighbour residual load', v: r.xReg },
    { key: 'Swiss residual load', v: swissRes },
    { key: 'Transit flows to Italy', v: r.transit },
  ];
  const y = r.price;
  const k = feats.length;
  const X = feats.map((f) => {
    let m = 0; for (let i = 0; i < H; i++) m += f.v[i]; m /= H;
    let s = 0; for (let i = 0; i < H; i++) s += (f.v[i] - m) ** 2; s = Math.sqrt(s / H) || 1;
    return Float64Array.from(f.v, (v) => (v - m) / s);
  });
  let ym = 0; for (let i = 0; i < H; i++) ym += y[i]; ym /= H;
  let ys = 0; for (let i = 0; i < H; i++) ys += (y[i] - ym) ** 2; ys = Math.sqrt(ys / H) || 1;
  const Y = Float64Array.from(y, (v) => (v - ym) / ys);
  // normal equations
  const A = Array.from({ length: k }, () => new Float64Array(k)), b = new Float64Array(k);
  for (let a = 0; a < k; a++) {
    for (let c = a; c < k; c++) { let s = 0; for (let i = 0; i < H; i++) s += X[a][i] * X[c][i]; A[a][c] = A[c][a] = s / H; }
    let s = 0; for (let i = 0; i < H; i++) s += X[a][i] * Y[i]; b[a] = s / H;
  }
  for (let a = 0; a < k; a++) A[a][a] += 1e-6;
  // Gaussian elimination
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < k; c++) {
    let piv = c; for (let r2 = c + 1; r2 < k; r2++) if (Math.abs(M[r2][c]) > Math.abs(M[piv][c])) piv = r2;
    [M[c], M[piv]] = [M[piv], M[c]];
    for (let r2 = 0; r2 < k; r2++) if (r2 !== c) { const f = M[r2][c] / M[c][c]; for (let j = c; j <= k; j++) M[r2][j] -= f * M[c][j]; }
  }
  const beta = M.map((row, i) => row[k] / row[i]);
  let r2n = 0; for (let i = 0; i < H; i++) { let yh = 0; for (let a = 0; a < k; a++) yh += beta[a] * X[a][i]; r2n += (Y[i] - yh) ** 2; }
  const corr = X.map((x) => { let s = 0; for (let i = 0; i < H; i++) s += x[i] * Y[i]; return s / H; });
  return {
    r2: 1 - r2n / H,
    items: feats.map((f, a) => ({ key: f.key, beta: beta[a], corr: corr[a], effect: beta[a] * ys })),
  };
}
