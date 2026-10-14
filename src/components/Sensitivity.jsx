import React, { useCallback, useRef, useState } from 'react';

function useWidth(fallback = 720) {
  // callback ref so it attaches whenever the measured element mounts
  const [w, setW] = useState(fallback);
  const ro = useRef(null);
  const ref = useCallback((el) => {
    if (ro.current) { ro.current.disconnect(); ro.current = null; }
    if (el) {
      ro.current = new ResizeObserver((e) => setW(Math.max(320, Math.round(e[0].contentRect.width))));
      ro.current.observe(el);
    }
  }, []);
  return [ref, w];
}
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, BarChart, Bar, Cell } from 'recharts';
import { KPI_DEFS } from '../model/pfc.js';
import { fmt } from '../theme.js';
import { axisProps, gridProps, ChartTooltip, Legend, Card } from './common.jsx';

export function Tornado({ data, loading, theme }) {
  const [kpi, setKpi] = useState('base');
  const [tip, setTip] = useState(null);
  const [wrapRef, width] = useWidth();
  const def = KPI_DEFS.find((d) => d.key === kpi);
  const scale = def.pct ? 100 : 1;
  if (!data) return <Card title="Sensitivity (tornado)"><p className="note">Computing {loading ? '…' : ''}</p></Card>;
  const base = data.base[kpi] * scale;
  const rows = data.rows.map((r) => ({
    label: r.label, low: r.low.kpis[kpi] * scale - base, high: r.high.kpis[kpi] * scale - base, lowV: r.low.value, highV: r.high.value,
  })).sort((a, b) => Math.max(Math.abs(b.low), Math.abs(b.high)) - Math.max(Math.abs(a.low), Math.abs(a.high)));
  const ext = Math.max(1e-6, ...rows.flatMap((r) => [Math.abs(r.low), Math.abs(r.high)]));
  const W = width, labelW = Math.min(170, W * 0.36), rowH = 26, top = 6, plotW = W - labelW - 70, H = top + rows.length * rowH + 22;
  const x = (v) => labelW + plotW / 2 + (v / ext) * (plotW / 2);
  return (
    <Card
      title="Sensitivity of the PFC to its drivers"
      sub={`Change in ${def.label.toLowerCase()} when each parameter is moved down / up around the current scenario (all else equal). Scenario value: ${fmt(base, def.pct ? 0 : 1)} ${def.unit}.`}
      right={(
        <select className="btn" value={kpi} onChange={(e) => setKpi(e.target.value)} aria-label="Indicator">
          {KPI_DEFS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
        </select>
      )}
    >
      <Legend items={[
        { label: 'Parameter decreased', color: theme.series[0], type: 'box' },
        { label: 'Parameter increased', color: theme.series[1], type: 'box' },
      ]} />
      <div ref={wrapRef} style={{ position: 'relative', opacity: loading ? 0.55 : 1, transition: 'opacity .2s' }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label="Tornado chart" onMouseLeave={() => setTip(null)}>
          <line x1={x(0)} x2={x(0)} y1={top - 4} y2={H - 18} stroke={theme.axis} />
          {rows.map((r, i) => {
            const y = top + i * rowH;
            const bar = (v, color, key) => {
              const x0 = Math.min(x(0), x(v)), w = Math.max(1, Math.abs(x(v) - x(0)));
              return <rect key={key} x={x0} y={y + 4} width={w} height={rowH - 10} rx={4} fill={color} opacity={0.92} />;
            };
            return (
              <g key={r.label} onMouseMove={(e) => setTip({ x: e.clientX, y: e.clientY, r })}>
                <rect x={0} y={y} width={W} height={rowH} fill="transparent" />
                <text x={labelW - 8} y={y + rowH / 2 + 4} textAnchor="end" style={{ fontSize: 11.5, fill: theme.ink2 }}>{r.label}</text>
                {Math.abs(r.low) >= Math.abs(r.high) ? [bar(r.low, theme.series[0], 'l'), bar(r.high, theme.series[1], 'h')] : [bar(r.high, theme.series[1], 'h'), bar(r.low, theme.series[0], 'l')]}
                <text x={W - 4} y={y + rowH / 2 + 4} textAnchor="end" style={{ fontSize: 11, fill: theme.muted, fontVariantNumeric: 'tabular-nums' }}>
                  {fmt(Math.max(Math.abs(r.low), Math.abs(r.high)), 1)}
                </text>
              </g>
            );
          })}
          {[-1, -0.5, 0, 0.5, 1].map((t) => (
            <text key={t} x={x(t * ext)} y={H - 4} textAnchor="middle" style={{ fontSize: 10, fill: theme.muted }}>{t > 0 ? '+' : ''}{fmt(t * ext, ext < 5 ? 1 : 0)}</text>
          ))}
        </svg>
        {tip && (
          <div className="heat-tip" style={{ left: tip.x + 12, top: tip.y + 12 }}>
            <div className="tooltip">
              <div className="t-title">{tip.r.label}</div>
              <div className="t-row"><span className="n"><i style={{ background: theme.series[0] }} />Low ({fmt(tip.r.lowV, 2)})</span><span>{tip.r.low >= 0 ? '+' : ''}{fmt(tip.r.low, 1)} {def.unit === '%' ? 'pp' : def.unit}</span></div>
              <div className="t-row"><span className="n"><i style={{ background: theme.series[1] }} />High ({fmt(tip.r.highV, 2)})</span><span>{tip.r.high >= 0 ? '+' : ''}{fmt(tip.r.high, 1)} {def.unit === '%' ? 'pp' : def.unit}</span></div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

export function Attribution({ attribution, historical, theme }) {
  const data = attribution.items.map((d) => ({ name: d.key, beta: d.beta })).sort((a, b) => Math.abs(b.beta) - Math.abs(a.beta));
  return (
    <Card
      title="Which fundamentals explain the hourly shape?"
      sub={`Standardised regression of the modelled 2035 hourly Swiss price on its drivers (R² = ${fmt(attribution.r2, 2)}). Bar = price change in standard deviations per +1 σ of the driver, holding the others fixed.`}
    >
      <ResponsiveContainer width="100%" height={150}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 20, left: 10, bottom: 0 }}>
          <CartesianGrid {...gridProps(theme)} horizontal={false} vertical />
          <XAxis type="number" {...axisProps(theme)} domain={[-1, 1]} tickFormatter={(v) => fmt(v, 1)} />
          <YAxis type="category" dataKey="name" {...axisProps(theme)} width={160} />
          <Tooltip content={<ChartTooltip unit="σ" digits={2} />} cursor={{ fill: theme.grid, opacity: 0.4 }} />
          <ReferenceLine x={0} stroke={theme.axis} />
          <Bar dataKey="beta" name="Standardised effect" radius={4} isAnimationActive={false}>
            {data.map((d) => <Cell key={d.name} fill={d.beta >= 0 ? theme.series[7] : theme.series[0]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="note">
        Residual load = demand minus PV, wind, nuclear, run-of-river and biomass (dispatchable hydro and storage are the response, not a driver).
        The neighbour residual load dominates: Switzerland is a price-taker in most hours, and its own residual load matters mainly when cross-border capacity binds.
        Simple correlations with price: {attribution.items.map((it) => `${it.key} ${fmt(it.corr, 2)}`).join(' · ')}.
      </p>
      {historical && (
        <>
          <div style={{ fontWeight: 600, fontSize: 13, margin: '12px 0 4px' }}>Feature importance on historical data ({historical.period})</div>
          <table className="data">
            <thead><tr><th>Feature</th><th>Importance</th></tr></thead>
            <tbody>{historical.items.map((it) => <tr key={it.feature}><td>{it.feature}</td><td>{fmt(it.importance * 100, 1)} %</td></tr>)}</tbody>
          </table>
          <p className="note">Gradient-boosting permutation importance fitted by <code>model/calibrate.py</code> on ENTSO-E data (out-of-sample R² {fmt(historical.r2, 2)}).</p>
        </>
      )}
    </Card>
  );
}

export function PvSweep({ data, loading, theme, current }) {
  if (!data) return <Card title="PV target stability"><p className="note">Computing{loading ? '…' : ''}</p></Card>;
  const rows = data.map((d) => ({
    pv: d.value, base: d.kpis.base, capture: d.kpis.pvCapture, midday: d.kpis.summerMidday, evening: d.kpis.winterEvening,
    rate: d.kpis.pvCaptureRate * 100, neg: d.kpis.negHours, exp: -d.kpis.netImportTWh,
  }));
  const marks = (
    <>
      <ReferenceLine x={18.7} stroke={theme.muted} strokeDasharray="4 4" label={{ value: '2030 target 18.7', fill: theme.muted, fontSize: 10, position: 'insideTopLeft' }} />
      <ReferenceLine x={current} stroke={theme.ink2} label={{ value: `scenario ${fmt(current, 1)}`, fill: theme.ink2, fontSize: 10, position: 'insideBottomRight' }} />
    </>
  );
  return (
    <Card
      title="How stable is the PFC if the PV target changes?"
      sub="Each point re-runs the full hourly model with a different Swiss PV volume (all other scenario parameters unchanged)."
    >
      <div style={{ opacity: loading ? 0.55 : 1, transition: 'opacity .2s' }}>
        <div className="grid-2">
          <div>
            <div style={{ fontWeight: 600, fontSize: 13 }}>Price levels (€/MWh)</div>
            <Legend items={[
              { label: 'Baseload', color: theme.series[0] },
              { label: 'PV capture price', color: theme.series[1] },
              { label: 'Summer midday', color: theme.series[2] },
              { label: 'Winter evening', color: theme.series[3] },
            ]} />
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid {...gridProps(theme)} />
                <XAxis dataKey="pv" type="number" domain={['dataMin', 'dataMax']} {...axisProps(theme)} unit=" TWh" />
                <YAxis {...axisProps(theme)} width={44} />
                <Tooltip content={<ChartTooltip digits={1} title={(l) => `PV ${fmt(l, 1)} TWh`} />} />
                {marks}
                <Line dataKey="base" name="Baseload" stroke={theme.series[0]} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
                <Line dataKey="capture" name="PV capture price" stroke={theme.series[1]} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
                <Line dataKey="midday" name="Summer midday" stroke={theme.series[2]} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
                <Line dataKey="evening" name="Winter evening" stroke={theme.series[3]} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 13 }}>PV capture rate (% of baseload)</div>
            <Legend items={[{ label: 'Capture rate', color: theme.series[1] }]} />
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid {...gridProps(theme)} />
                <XAxis dataKey="pv" type="number" domain={['dataMin', 'dataMax']} {...axisProps(theme)} unit=" TWh" />
                <YAxis {...axisProps(theme)} width={44} unit="%" domain={[0, 100]} />
                <Tooltip content={<ChartTooltip unit="%" digits={0} title={(l) => `PV ${fmt(l, 1)} TWh`} />} />
                {marks}
                <Line dataKey="rate" name="Capture rate" stroke={theme.series[1]} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <table className="data" style={{ marginTop: 10 }}>
          <thead><tr><th>PV (TWh)</th><th>Baseload</th><th>Capture price</th><th>Capture rate</th><th>Summer midday</th><th>Winter evening</th><th>Neg. hours</th><th>Net export (TWh)</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.pv}><td>{fmt(r.pv, 1)}</td><td>{fmt(r.base, 1)}</td><td>{fmt(r.capture, 1)}</td><td>{fmt(r.rate, 0)} %</td><td>{fmt(r.midday, 1)}</td><td>{fmt(r.evening, 1)}</td><td>{fmt(r.neg)}</td><td>{fmt(r.exp, 1)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
