import React, { useState } from 'react';
import { ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, LineChart, ReferenceLine } from 'recharts';
import { MONTHS } from '../model/calendar.js';
import { SEASONS } from '../model/pfc.js';
import { fmt, divergingColor } from '../theme.js';
import { axisProps, gridProps, ChartTooltip, Legend, Card } from './common.jsx';

function inkFor(theme, t) {
  // readable label ink on top of a diverging cell
  const strong = Math.abs(t) > 0.55;
  return strong ? (theme.mode === 'dark' && Math.abs(t) > 0.8 ? '#0b0b0b' : '#ffffff') : theme.ink;
}

export function Heatmap({ matrix, base, theme, title, showValues }) {
  const [tip, setTip] = useState(null);
  const cw = 26, ch = 20, left = 34, top = 4, bottom = 18;
  const W = left + 24 * cw, Hh = top + 12 * ch + bottom;
  return (
    <div style={{ position: 'relative' }}>
      <div style={{ fontWeight: 600, fontSize: 13, margin: '4px 0 6px' }}>{title} <span className="note">· baseload {fmt(base, 1)} €/MWh</span></div>
      <svg className="heatmap" viewBox={`0 0 ${W} ${Hh}`} role="img" aria-label={`${title}: average price by month and hour`} onMouseLeave={() => setTip(null)}>
        {matrix.map((row, m) => row.map((v, h) => {
          const t = (v - base) / base;
          return (
            <g key={`${m}-${h}`} onMouseMove={(e) => setTip({ x: e.clientX, y: e.clientY, m, h, v })}>
              <rect x={left + h * cw + 1} y={top + m * ch + 1} width={cw - 2} height={ch - 2} rx={3} fill={divergingColor(theme, t)} />
              {showValues && (
                <text x={left + h * cw + cw / 2} y={top + m * ch + ch / 2 + 3} textAnchor="middle" style={{ fontSize: 8, fill: inkFor(theme, t) }}>{Math.round(v)}</text>
              )}
            </g>
          );
        }))}
        {MONTHS.map((mo, m) => <text key={mo} x={left - 6} y={top + m * ch + ch / 2 + 3.5} textAnchor="end">{mo}</text>)}
        {Array.from({ length: 24 }, (_, h) => h).filter((h) => h % 3 === 0).map((h) => (
          <text key={h} x={left + h * cw + cw / 2} y={Hh - 4} textAnchor="middle">{String(h).padStart(2, '0')}h</text>
        ))}
      </svg>
      {tip && (
        <div className="heat-tip" style={{ left: tip.x + 12, top: tip.y + 12 }}>
          <div className="tooltip">
            <div className="t-title">{MONTHS[tip.m]} · {String(tip.h).padStart(2, '0')}:00–{String(tip.h + 1).padStart(2, '0')}:00</div>
            <div className="t-row"><span className="n">Average price</span><span>{fmt(tip.v, 1)} €/MWh</span></div>
            <div className="t-row"><span className="n">Shape factor</span><span>{fmt(tip.v / base, 2)}</span></div>
          </div>
        </div>
      )}
    </div>
  );
}

export function HeatmapPair({ main, refData, theme }) {
  const [showValues, setShowValues] = useState(false);
  return (
    <Card
      title="Price shape: month × hour of day"
      sub="Average price per month and delivery hour. Colours diverge around each year's own baseload (blue = cheaper, red = more expensive), so the two maps compare shape, not level."
      right={(
        <div className="row">
          <button className={`chip ${showValues ? 'active' : ''}`} onClick={() => setShowValues((v) => !v)}>Show values (€/MWh)</button>
        </div>
      )}
    >
      <div className="grid-2">
        <Heatmap matrix={main.matrix} base={main.kpis.base} theme={theme} title="2035 scenario" showValues={showValues} />
        <Heatmap matrix={refData.matrix} base={refData.kpis.base} theme={theme} title="2024 reference" showValues={showValues} />
      </div>
      <div className="legend" style={{ marginTop: 8, alignItems: 'center' }}>
        <span>≤ 0×</span>
        {[-1, -0.66, -0.33, 0, 0.33, 0.66, 1].map((t) => <span key={t} className="sw box" style={{ background: divergingColor(theme, t), width: 22 }} />)}
        <span>≥ 2× baseload</span>
      </div>
    </Card>
  );
}

export function SeasonProfiles({ main, refData, band, theme }) {
  return (
    <Card title="Average daily profile by season" sub="2035 scenario (with weather-year P10–P90 band) vs. 2024 reference. The midday PV dip deepens and the evening ramp steepens.">
      <Legend items={[
        { label: '2035 scenario', color: theme.series[0] },
        { label: 'weather P10–P90', color: theme.series[0], type: 'box', opacity: 0.2 },
        { label: '2024 reference', color: theme.series[1] },
      ]} />
      <div className="grid-4">
        {SEASONS.map((s, si) => {
          const data = Array.from({ length: 24 }, (_, h) => ({
            h: `${String(h).padStart(2, '0')}h`,
            s: main.seasonal[si][h], r: refData.seasonal[si][h],
            band: band ? band.seasonal[si][h] : undefined,
          }));
          return (
            <div key={s.id}>
              <div style={{ fontWeight: 600, fontSize: 12.5, margin: '2px 0 4px' }}>{s.label}</div>
              <ResponsiveContainer width="100%" height={190}>
                <ComposedChart data={data} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
                  <CartesianGrid {...gridProps(theme)} />
                  <XAxis dataKey="h" {...axisProps(theme)} interval={5} />
                  <YAxis {...axisProps(theme)} width={40} domain={['auto', 'auto']} />
                  <Tooltip content={<ChartTooltip digits={0} />} />
                  <ReferenceLine y={0} stroke={theme.axis} />
                  {band && <Area dataKey="band" name="P10–P90" stroke="none" fill={theme.series[0]} fillOpacity={0.18} isAnimationActive={false} />}
                  <Line dataKey="r" name="2024 ref" stroke={theme.series[1]} strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Line dataKey="s" name="2035" stroke={theme.series[0]} strokeWidth={2} dot={false} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export function DurationChart({ main, refData, theme }) {
  const data = main.duration.map((p, i) => ({ h: p.h, s: p.p, r: refData.duration[i].p }));
  return (
    <Card title="Price duration curve" sub="Hours of the year sorted from most to least expensive. A steeper curve = more value for flexibility.">
      <Legend items={[{ label: '2035 scenario', color: theme.series[0] }, { label: '2024 reference', color: theme.series[1] }]} />
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid {...gridProps(theme)} />
          <XAxis dataKey="h" type="number" domain={[1, 8760]} {...axisProps(theme)} ticks={[1, 2000, 4000, 6000, 8760]} tickFormatter={(v) => `${fmt(v)} h`} />
          <YAxis {...axisProps(theme)} width={44} />
          <Tooltip content={<ChartTooltip digits={0} title={(l) => `Hour rank ${fmt(l)}`} />} />
          <ReferenceLine y={0} stroke={theme.axis} />
          <Line dataKey="r" name="2024 ref" stroke={theme.series[1]} strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line dataKey="s" name="2035" stroke={theme.series[0]} strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}
