// Web worker: runs the PFC model off the main thread.
import {
  runModel, computeKpis, hourMonthMatrix, seasonalProfile, SEASONS, monthlyStats, durationCurve, driverAttribution,
} from './pfc.js';
import { defaults, SENSITIVITY, PARAM_BY_KEY } from './scenarios.js';

const WEATHER_SEEDS = [1, 2, 3, 4, 5, 6, 7];
const SERIES = ['price', 'regionalPrice', 'demand', 'pv', 'pvClipped', 'wind', 'other', 'nuclear', 'ror', 'storage', 'pumped', 'battery', 'dsm', 'netImport'];

let refCache = null;
function reference() {
  if (!refCache) {
    const r = runModel(defaults('ref'), { seed: 1 });
    refCache = summarise(r, true);
  }
  return refCache;
}

function summarise(r, light = false) {
  const out = {
    kpis: computeKpis(r),
    matrix: hourMonthMatrix(r.price, r.cal),
    seasonal: SEASONS.map((s) => seasonalProfile(r.price, r.cal, s.months)),
    monthly: monthlyStats(r),
    duration: durationCurve(r.price),
  };
  if (!light) {
    out.series = Object.fromEntries(SERIES.map((k) => [k, Float32Array.from(r[k])]));
    out.attribution = driverAttribution(r);
    out.mo = { ccgt: r.mo.ccgt, ocgt: r.mo.ocgt, xs: r.mo.xs, ps: r.mo.ps };
  }
  return out;
}

function quantile(sorted, q) {
  const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function weatherBand(params) {
  const runs = WEATHER_SEEDS.map((seed) => {
    const r = runModel(params, { seed });
    return { kpis: computeKpis(r), seasonal: SEASONS.map((s) => seasonalProfile(r.price, r.cal, s.months)), monthly: monthlyStats(r) };
  });
  const band = (get) => {
    const vals = runs.map(get).sort((a, b) => a - b);
    return [quantile(vals, 0.1), quantile(vals, 0.9)];
  };
  return {
    seasonal: SEASONS.map((_, si) => Array.from({ length: 24 }, (_, h) => band((r) => r.seasonal[si][h]))),
    monthly: Array.from({ length: 12 }, (_, m) => band((r) => r.monthly[m].base)),
    kpis: Object.fromEntries(Object.keys(runs[0].kpis).map((k) => [k, band((r) => r.kpis[k])])),
  };
}

function sensitivity(params) {
  const baseK = computeKpis(runModel(params, { seed: 1 }));
  const rows = SENSITIVITY.map((s) => {
    const def = PARAM_BY_KEY[s.key];
    const clamp = (v, d = def) => Math.min(d.max, Math.max(d.min, v));
    const variant = (dir) => {
      const p = { ...params };
      let v;
      if (s.abs) v = s.abs[dir < 0 ? 0 : 1];
      else if (s.rel) v = params[s.key] * (1 + dir * s.rel);
      else v = params[s.key] + dir * s.delta;
      p[s.key] = clamp(v);
      if (s.also) {
        const d2 = PARAM_BY_KEY[s.also];
        p[s.also] = clamp(s.rel ? params[s.also] * (1 + dir * s.rel) : params[s.also] + dir * s.delta, d2);
      }
      return { value: p[s.key], kpis: computeKpis(runModel(p, { seed: 1 })) };
    };
    return { key: s.key, label: s.label, low: variant(-1), high: variant(1) };
  });
  return { base: baseK, rows };
}

function sweep(params, key, values) {
  return values.map((v) => ({ value: v, kpis: computeKpis(runModel({ ...params, [key]: v }, { seed: 1 })) }));
}

self.onmessage = (e) => {
  const { id, type, params } = e.data;
  try {
    let result;
    if (type === 'run') {
      const r = runModel(params, { seed: e.data.seed ?? 1 });
      result = { main: summarise(r), ref: reference() };
    } else if (type === 'band') result = weatherBand(params);
    else if (type === 'sensitivity') result = sensitivity(params);
    else if (type === 'sweep') result = sweep(params, e.data.key, e.data.values);
    self.postMessage({ id, type, result });
  } catch (err) {
    self.postMessage({ id, type, error: String(err && err.stack || err) });
  }
};
