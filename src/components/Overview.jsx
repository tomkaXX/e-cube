import React, { useMemo } from 'react';
import {
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, Brush, BarChart, Bar, ErrorBar, ReferenceLine,
} from 'recharts';
import { KPI_DEFS } from '../model/pfc.js';
import { MONTHS } from '../model/calendar.js';
import { fmt } from '../theme.js';
import { axisProps, gridProps, ChartTooltip, Legend, Card } from './common.jsx';

export function KpiTiles({ kpis, refKpis, band }) {
  return (
    <div className="kpis">
      {KPI_DEFS.map((d) => {
        const v = kpis[d.key], r = refKpis?.[d.key];
        const scale = d.pct ? 100 : 1;
        const delta = r != null ? (v - r) * scale : null;
        const b = band?.[d.key];
        return (
          <div className="kpi" key={d.key}>
            <div className="k-label">{d.label}</div>
            <div className="k-value">{fmt(v * scale, 0)}<span className="k-unit">{d.unit}</span></div>
            {r != null && (
              <div className="k-sub">
                2024 ref {fmt(r * scale, 0)} · {delta >= 0 ? '+' : '−'}{fmt(Math.abs(delta), 0)}{d.pct ? ' pp' : ''}
              </div>
            )}
            {b && <div className="k-sub">weather P10–P90: {fmt(b[0] * scale, 0)}–{fmt(b[1] * scale, 0)}</div>}
          </div>
        );
      })}
    </div>
  );
}

function dateLabel(d) {
  const dt = new Date(Date.UTC(2035, 0, 1 + d));
  return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export function YearChart({ series, theme, baseload }) {
  const data = useMemo(() => {
    const p = series.price, rp = series.regionalPrice;
    const out = [];
    for (let d = 0; d < 365; d++) {
      let s = 0, mn = Infinity, mx = -Infinity, rs = 0;
      for (let h = 0; h < 24; h++) { const v = p[d * 24 + h]; s += v; rs += rp[d * 24 + h]; if (v < mn) mn = v; if (v > mx) mx = v; }
      out.push({ d, label: dateLabel(d), avg: s / 24, range: [mn, mx], reg: rs / 24 });
    }
    return out;
  }, [series]);
  return (
    <Card
      title="Hourly PFC 2035 — daily view"
      sub="Daily average Swiss price with the intra-day min–max range; neighbour-region price for comparison. Drag the handles below to zoom."
    >
      <Legend items={[
        { label: 'CH daily average', color: theme.series[0] },
        { label: 'CH intra-day min–max', color: theme.series[0], type: 'box', opacity: 0.22 },
        { label: 'Neighbour region (DE/FR/IT/AT) daily average', color: theme.series[1] },
      ]} />
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid {...gridProps(theme)} />
          <XAxis dataKey="label" {...axisProps(theme)} interval="preserveStartEnd" minTickGap={40} />
          <YAxis {...axisProps(theme)} width={44} tickFormatter={(v) => fmt(v)} />
          <Tooltip content={<ChartTooltip digits={0} />} />
          <ReferenceLine y={baseload} stroke={theme.muted} strokeDasharray="4 4" label={{ value: `baseload ${fmt(baseload)}`, fill: theme.muted, fontSize: 11, position: 'insideTopRight' }} />
          <ReferenceLine y={0} stroke={theme.axis} />
          <Area dataKey="range" name="CH min–max" stroke="none" fill={theme.series[0]} fillOpacity={0.2} isAnimationActive={false} />
          <Line dataKey="reg" name="Neighbour region" stroke={theme.series[1]} strokeWidth={1.5} dot={false} isAnimationActive={false} />
          <Line dataKey="avg" name="CH average" stroke={theme.series[0]} strokeWidth={2} dot={false} isAnimationActive={false} />
          <Brush dataKey="label" height={24} stroke={theme.axis} fill={theme.surface} travellerWidth={8} tickFormatter={() => ''} />
        </ComposedChart>
      </ResponsiveContainer>
    </Card>
  );
}

export function MonthlyChart({ monthly, refMonthly, band, theme }) {
  const data = monthly.map((m, i) => ({
    month: MONTHS[i],
    base: m.base, peak: m.peak, offpeak: m.offpeak,
    ref: refMonthly[i].base,
    err: band ? [m.base - band[i][0], band[i][1] - m.base].map((v) => Math.max(0, v)) : undefined,
  }));
  return (
    <Card title="Monthly baseload" sub="2035 scenario vs. 2024 reference; whiskers show the weather-year P10–P90 range.">
      <Legend items={[
        { label: '2035 scenario', color: theme.series[0], type: 'box' },
        { label: '2024 reference', color: theme.series[1], type: 'box' },
      ]} />
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
          <CartesianGrid {...gridProps(theme)} />
          <XAxis dataKey="month" {...axisProps(theme)} />
          <YAxis {...axisProps(theme)} width={44} />
          <Tooltip content={<ChartTooltip digits={1} />} cursor={{ fill: theme.grid, opacity: 0.5 }} />
          <Bar dataKey="base" name="2035 baseload" fill={theme.series[0]} radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {band && <ErrorBar dataKey="err" width={4} stroke={theme.ink2 || theme.muted} strokeWidth={1.2} />}
          </Bar>
          <Bar dataKey="ref" name="2024 baseload" fill={theme.series[1]} radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
      <details style={{ marginTop: 6 }}>
        <summary className="note" style={{ cursor: 'pointer' }}>Show table (base / peak / off-peak)</summary>
        <table className="data" style={{ marginTop: 8 }}>
          <thead><tr><th>Month</th><th>Base</th><th>Peak</th><th>Off-peak</th><th>2024 base</th></tr></thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.month}><td>{r.month}</td><td>{fmt(r.base, 1)}</td><td>{fmt(r.peak, 1)}</td><td>{fmt(r.offpeak, 1)}</td><td>{fmt(r.ref, 1)}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </Card>
  );
}
