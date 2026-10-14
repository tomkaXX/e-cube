import { runModel, computeKpis, hourMonthMatrix, driverAttribution } from '../src/model/pfc.js';
import { PRESETS } from '../src/model/scenarios.js';
const f = (x) => (typeof x === 'number' ? x.toFixed(1) : x);
for (const p of PRESETS) {
  const t = performance.now();
  const r = runModel(p.params, { seed: 1 });
  const ms = performance.now() - t;
  const k = computeKpis(r);
  console.log(p.id.padEnd(9), `${ms.toFixed(0)}ms`, Object.entries(k).map(([a, b]) => `${a}=${f(a==='pvCaptureRate'?b*100:b)}`).join(' '));
}
const r = runModel(PRESETS[0].params, { seed: 1 });
const M = hourMonthMatrix(r.price, r.cal);
for (const m of [0, 3, 6, 9]) console.log('m'+m, M[m].map((v) => v.toFixed(0)).join(' '));
const ref = runModel(PRESETS[5].params, { seed: 1 });
const M2 = hourMonthMatrix(ref.price, ref.cal);
for (const m of [0, 3, 6, 9]) console.log('ref m'+m, M2[m].map((v) => v.toFixed(0)).join(' '));
console.log(JSON.stringify(driverAttribution(r)));
