// Synthetic but physically-shaped weather years (seeded, reproducible).
// Every profile is returned normalised (mean = 1 over the year) so that scenario
// parameters (TWh, shares) set the energy and the weather year sets the shape.

import { buildCalendar } from './calendar.js';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(rng) {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
const normalise = (arr) => {
  let s = 0;
  for (let i = 0; i < arr.length; i++) s += arr[i];
  const m = s / arr.length;
  for (let i = 0; i < arr.length; i++) arr[i] /= m;
  return arr;
};

const LAT = 46.8 * Math.PI / 180; // Swiss Plateau
const LON = 8.2;                  // degrees east

// sin(solar elevation) for a given day-of-year and local clock hour (centre of hour)
export function sinElevation(doy, hourLocal, dst, latRad = LAT, lonDeg = LON) {
  const decl = 23.44 * Math.PI / 180 * Math.sin(2 * Math.PI * (284 + doy + 1) / 365);
  const B = 2 * Math.PI * (doy - 81) / 364;
  const eot = (9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B)) / 60; // hours
  const solarTime = hourLocal + 0.5 - (dst ? 2 : 1) + lonDeg / 15 + eot;
  const ha = (solarTime - 12) * 15 * Math.PI / 180;
  return Math.sin(latRad) * Math.sin(decl) + Math.cos(latRad) * Math.cos(decl) * Math.cos(ha);
}

const cache = new Map();

/**
 * @param {number} seed weather year id (1..n)
 * @returns normalised hourly profiles + scalar hydrology factor
 */
export function weatherYear(seed = 1, year = 2035) {
  const key = `${seed}-${year}`;
  if (cache.has(key)) return cache.get(key);
  const cal = buildCalendar(year);
  const rng = mulberry32(seed * 7919 + 13);
  const { H, days } = cal;

  // --- daily drivers -------------------------------------------------------
  const clearCH = new Float64Array(days), clearEU = new Float64Array(days), tAnom = new Float64Array(days);
  let eCH = 0, eEU = 0, eT = 0;
  for (let d = 0; d < days; d++) {
    const seas = Math.cos(2 * Math.PI * (d - 172) / 365); // +1 midsummer
    eCH = 0.6 * eCH + 0.8 * gauss(rng);
    eEU = 0.6 * eEU + 0.8 * (0.65 * gauss(rng) + 0.35 * eCH);
    eT = 0.75 * eT + 0.66 * gauss(rng);
    const mCH = 0.53 + 0.17 * seas;            // winter fog on the Plateau -> low clearness
    const mEU = 0.56 + 0.14 * seas;
    clearCH[d] = Math.min(0.95, Math.max(0.07, mCH + 0.17 * eCH));
    clearEU[d] = Math.min(0.92, Math.max(0.12, mEU + 0.11 * eEU));
    tAnom[d] = 3 * eT; // K
  }

  // --- hourly profiles -----------------------------------------------------
  const pvCH = new Float64Array(H), pvEU = new Float64Array(H);
  const windCH = new Float64Array(H), windEU = new Float64Array(H);
  const temp = new Float64Array(H);
  let zw = 0, zc = 0;
  for (let i = 0; i < H; i++) {
    const d = cal.doy[i], h = cal.hour[i];
    const se = sinElevation(d, h, cal.dst[i]);
    const seEU = sinElevation(d, h, cal.dst[i], 46 * Math.PI / 180, 10.5); // DE/IT/FR blend
    // intra-day cloud flicker
    const flick = 1 + 0.08 * gauss(rng);
    pvCH[i] = se > 0 ? Math.pow(se, 1.15) * clearCH[d] * flick : 0;
    pvEU[i] = seEU > 0 ? Math.pow(seEU, 1.1) * clearEU[d] : 0;

    // wind: hourly AR(1) latent (synoptic), winter-weighted capacity factor
    zw = 0.975 * zw + 0.222 * gauss(rng);
    zc = 0.95 * zc + 0.31 * (0.6 * zw + 0.4 * gauss(rng));
    const winter = Math.cos(2 * Math.PI * (d - 15) / 365); // +1 mid-Jan
    windEU[i] = 1 / (1 + Math.exp(-(-1.35 + 0.45 * winter + 1.15 * zw)));
    windCH[i] = 1 / (1 + Math.exp(-(-1.8 + 0.55 * winter + 1.1 * zc)));

    const tSeason = 9.8 - 10 * Math.cos(2 * Math.PI * (d - 18) / 365);
    const tDiurnal = 3.5 * Math.sin(2 * Math.PI * (h - 9) / 24);
    temp[i] = tSeason + tDiurnal + tAnom[d];
  }

  const hydrology = Math.min(1.18, Math.max(0.82, 1 + 0.08 * gauss(rng)));
  const out = {
    seed,
    pvCH: normalise(pvCH), pvEU: normalise(pvEU),
    windCH: normalise(windCH), windEU: normalise(windEU),
    temp, hydrology,
    pvCHPeak: 0, pvEUPeak: 0,
  };
  out.pvCHPeak = Math.max(...out.pvCH);
  cache.set(key, out);
  return out;
}
