import React from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from 'recharts';
import calibration from '../model/calibration.json';
import { PARAMS, PARAM_GROUPS } from '../model/scenarios.js';
import { fmt } from '../theme.js';
import { axisProps, gridProps, ChartTooltip, Card } from './common.jsx';

export function MeritOrderChart({ mo, theme }) {
  const data = [];
  for (let x = -0.6; x <= 0.9001; x += 0.02) {
    let k = 1;
    const xs = mo.xs, ps = mo.ps;
    let p;
    if (x <= xs[0]) p = ps[0];
    else if (x >= xs[xs.length - 1]) p = ps[ps.length - 1];
    else { while (x > xs[k]) k++; p = ps[k - 1] + ((x - xs[k - 1]) / (xs[k] - xs[k - 1])) * (ps[k] - ps[k - 1]); }
    data.push({ x: Math.round(x * 100), p });
  }
  return (
    <Card title="Calibrated regional merit-order curve" sub={`Price as a function of the residual load share served by dispatchable plants. CCGT SRMC ${fmt(mo.ccgt, 1)} €/MWh, OCGT SRMC ${fmt(mo.ocgt, 1)} €/MWh in the current scenario.`}>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid {...gridProps(theme)} />
          <XAxis dataKey="x" type="number" domain={[-60, 90]} {...axisProps(theme)} unit="%" />
          <YAxis {...axisProps(theme)} width={44} />
          <Tooltip content={<ChartTooltip digits={1} title={(l) => `Residual load share ${l} %`} />} />
          <ReferenceLine y={0} stroke={theme.axis} />
          <ReferenceLine y={mo.ccgt} stroke={theme.muted} strokeDasharray="4 4" label={{ value: 'CCGT', fill: theme.muted, fontSize: 10, position: 'insideLeft' }} />
          <Line dataKey="p" name="Price" stroke={theme.series[0]} strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}

export function Method({ mo, theme }) {
  return (
    <div className="method">
      <h3>Research questions — short answers from the model</h3>
      <ol>
        <li><b>What shapes the Swiss spot curve?</b> In most hours Switzerland is a price-taker of the coupled DE/FR/IT/AT market:
          the neighbours' residual load (demand minus PV, wind, nuclear and hydro) and the gas &amp; CO₂ prices that set the marginal plant explain most of the level and the hourly shape.
          Swiss fundamentals — PV, nuclear availability, hydro storage dispatch and demand — matter when the cross-border capacities (minus Italian transit) bind: in winter evenings (import scarcity) and on sunny summer middays (export surplus).</li>
        <li><b>What could the 2035 PFC look like?</b> A pronounced "duck" shape: deep summer midday troughs around zero (negative in high-RES weeks), steep morning and evening ramps,
          and a winter/summer spread that widens because PV adds summer energy while Beznau retires. Baseload falls modestly, but the PV capture rate drops sharply.</li>
        <li><b>How sensitive is it?</b> Gas and CO₂ move the level almost one-to-one in non-solar hours; neighbour PV/wind shares and flexibility (batteries, DSM, pumped storage) drive the shape.
          Swiss PV volume mostly affects summer middays and the PV capture price; see the Sensitivity and PV-target tabs for the numbers in your scenario.</li>
        <li><b>How stable under a revised PV target?</b> The PV-target sweep shows baseload changes only a few €/MWh between 18.7 and 40 TWh, but capture rates and summer-midday prices
          fall steeply — the curve <i>shape</i> is far less stable than its <i>level</i>. More flexibility (batteries, DSM, injection limits) partly restores it.</li>
      </ol>

      <h3>Approach</h3>
      <p>
        A <b>fundamental, merit-order based hourly model</b> was chosen over a pure machine-learning regression, because 2035 lies outside the historical
        feature space (PV volumes 4–5× today, no Beznau, very different neighbour mix): a model trained on 2015–2024 cannot extrapolate those structural breaks reliably.
        Machine learning is used where it is strong — on historical data — to rank the drivers and calibrate the curve (<code>model/calibrate.py</code>).
      </p>
      <ol>
        <li><b>Weather year.</b> Seeded synthetic years produce hourly PV (solar geometry at 46.8° N × daily clearness with Plateau winter fog), wind (synoptic AR(1) process),
          temperature and a hydrology factor. Seven weather years give the P10–P90 bands.</li>
        <li><b>Swiss fundamentals.</b> Demand = base profile (seasonal, weekday/weekend, temperature) + heat pumps (heating degree hours) + e-mobility (evening charging).
          Supply: PV (with feed-in limit), wind, biomass/other, nuclear (with summer revision), run-of-river (monthly hydrology), storage hydro (monthly energy budget, optional summer→winter shift).</li>
        <li><b>Neighbour region.</b> Residual load share <code>x = D − PV − Wind − Nuclear/Hydro</code> of DE/FR/IT/AT, partially flattened by regional flexibility, mapped to price
          through a piecewise-linear merit-order curve anchored on CCGT and OCGT short-run marginal costs: <code>SRMC = (gas + CO₂·0.202) / η + VOM</code>.</li>
        <li><b>Market coupling.</b> The Swiss net import need shifts the regional residual load (<code>x + N / 150 GW</code>). Beyond the net import capacity (minus Italian transit)
          a scarcity premium applies; beyond the export capacity the Swiss price decouples downwards (bounded at zero by curtailment).</li>
        <li><b>Flexibility dispatch.</b> Storage hydro is dispatched weekly with a water-value rule (release when price &gt; λ, λ solved for the weekly budget);
          pumped storage, batteries and DSM do daily price arbitrage with efficiency losses, re-evaluating prices after each move. Prices and dispatch are iterated four times.</li>
      </ol>

      <h3>Main assumptions (2035 central)</h3>
      {PARAM_GROUPS.map((g) => (
        <div key={g.id}>
          <p style={{ margin: '10px 0 4px', fontWeight: 600, color: 'var(--ink)' }}>{g.label}</p>
          <table className="data">
            <thead><tr><th>Parameter</th><th>2024 ref</th><th>2035 central</th><th>Unit</th></tr></thead>
            <tbody>
              {PARAMS.filter((p) => p.group === g.id).map((p) => (
                <tr key={p.key}><td>{p.label}</td><td>{fmt(p.ref, 2)}</td><td>{fmt(p.base, 2)}</td><td>{p.unit}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {mo && <div style={{ marginTop: 16 }}><MeritOrderChart mo={mo} theme={theme} /></div>}

      <h3>Calibration status</h3>
      <p>
        {calibration.fitted
          ? <>Calibration fitted on ENTSO-E data ({calibration.fittedOn}).</>
          : <><span className="pill">Default calibration</span> The merit-order and coupling parameters are hand-set to reproduce typical 2023–2024 Swiss patterns
            (2024 reference ≈ 80 €/MWh baseload, summer-midday dip, winter evening peak). Re-fit them on real data with the Python pipeline below.</>}
      </p>

      <h3>Data sources</h3>
      <ul>
        <li>ENTSO-E Transparency Platform — day-ahead prices CH/DE/FR/IT, load, generation per type, cross-border flows and NTCs (<a href="https://transparency.entsoe.eu/" target="_blank" rel="noreferrer">transparency.entsoe.eu</a>).</li>
        <li>EPEX SPOT market results (<a href="https://www.epexspot.com/en/market-results" target="_blank" rel="noreferrer">epexspot.com</a>), RTE eco2mix market data.</li>
        <li>Swiss PV target 2030: 18.7 TWh/y; renewable target 2035 (excl. hydro) per Art. 2 Abs. 1 EnG (<a href="https://www.fedlex.admin.ch/eli/cc/2017/762/de" target="_blank" rel="noreferrer">fedlex</a>).</li>
      </ul>

      <h3>Re-calibrate with real data</h3>
      <pre>{`cd model
pip install -r requirements.txt
export ENTSOE_API_KEY=<your token>   # free, request via transparency.entsoe.eu
python calibrate.py --start 2019-01-01 --end 2025-01-01
# writes ../src/model/calibration.json  ->  npm run deploy`}</pre>

      <h3>Limitations</h3>
      <ul>
        <li>Neighbour markets are aggregated into one region; FR/DE/IT spreads and flow-based coupling are not modelled explicitly.</li>
        <li>Daily arbitrage ignores intra-day state-of-charge ordering; storage hydro uses a weekly (not seasonal-stochastic) water value.</li>
        <li>Weather years are synthetic; replace them with historical reanalysis (e.g. ERA5 / renewables.ninja) for production use.</li>
        <li>Hourly resolution; a 15-minute product would need intra-hour PV ramps and balancing effects.</li>
      </ul>
    </div>
  );
}
