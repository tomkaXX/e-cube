import React, { useMemo, useState } from 'react';
import { ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, LineChart } from 'recharts';
import { fmt } from '../theme.js';
import { axisProps, gridProps, ChartTooltip, Legend, Card } from './common.jsx';

const STACK = [
  { key: 'nuclear', label: 'Nuclear' },
  { key: 'other', label: 'Biomass & other' },
  { key: 'ror', label: 'Run-of-river' },
  { key: 'pv', label: 'PV' },
  { key: 'wind', label: 'Wind' },
  { key: 'storage', label: 'Storage hydro' },
  { key: 'flexOut', label: 'Pumped/battery/DSM out' },
  { key: 'imports', label: 'Net imports' },
];

function weekLabel(w) {
  const a = new Date(Date.UTC(2035, 0, 1 + w * 7));
  return a.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export function WeekView({ series, theme }) {
  const [week, setWeek] = useState(2);
  const data = useMemo(() => {
    const out = [];
    const h0 = week * 168;
    const s = series;
    for (let i = h0; i < Math.min(8760, h0 + 168); i++) {
      const flex = s.pumped[i] + s.battery[i] + s.dsm[i];
      const n = s.netImport[i];
      const dt = new Date(Date.UTC(2035, 0, 1, i));
      out.push({
        t: dt.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' }) + ` ${String(i % 24).padStart(2, '0')}h`,
        nuclear: s.nuclear[i], other: s.other[i], ror: s.ror[i], pv: s.pv[i], wind: s.wind[i], storage: s.storage[i],
        flexOut: Math.max(0, -flex), imports: Math.max(0, n),
        demand: s.demand[i], total: s.demand[i] + Math.max(0, flex) + Math.max(0, -n),
        price: s.price[i], reg: s.regionalPrice[i],
      });
    }
    return out;
  }, [series, week]);
  const pick = (w) => setWeek(Math.max(0, Math.min(51, w)));
  return (
    <Card
      title={`Hourly fundamentals — week of ${weekLabel(week)} 2035`}
      sub="Swiss supply stack against demand. The dashed line adds storage charging and exports: the gap between it and the stack is balanced by the price."
      right={(
        <div className="row">
          <button className="btn" onClick={() => pick(week - 1)} aria-label="Previous week">←</button>
          <input type="range" min={0} max={51} value={week} onChange={(e) => pick(Number(e.target.value))} aria-label="Week" style={{ width: 160, accentColor: 'var(--accent)' }} />
          <button className="btn" onClick={() => pick(week + 1)} aria-label="Next week">→</button>
          <span className="pill">Week {week + 1}</span>
        </div>
      )}
    >
      <Legend items={[
        ...STACK.map((st, i) => ({ label: st.label, color: theme.series[i], type: 'box' })),
        { label: 'Demand', color: theme.ink },
        { label: 'Demand + charging + exports', color: theme.ink, type: 'dash' },
      ]} />
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={data} margin={{ top: 14, right: 12, left: 4, bottom: 0 }}>
          <CartesianGrid {...gridProps(theme)} />
          <XAxis dataKey="t" {...axisProps(theme)} interval={23} />
          <YAxis {...axisProps(theme)} width={44} unit=" GW" tickFormatter={(v) => fmt(v)} />
          <Tooltip content={<ChartTooltip unit="GW" digits={2} />} />
          {STACK.map((st, i) => (
            <Area key={st.key} dataKey={st.key} name={st.label} stackId="s" type="monotone"
              stroke={theme.surface} strokeWidth={0.5} fill={theme.series[i]} fillOpacity={0.9} isAnimationActive={false} />
          ))}
          <Line dataKey="total" name="Demand + charging + exports" stroke={theme.ink} strokeDasharray="4 3" strokeWidth={1.5} dot={false} isAnimationActive={false} />
          <Line dataKey="demand" name="Demand" stroke={theme.ink} strokeWidth={2} dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
      <div style={{ fontWeight: 600, fontSize: 13, margin: '10px 0 2px' }}>Hourly price, same week</div>
      <Legend items={[{ label: 'Switzerland', color: theme.series[0] }, { label: 'Neighbour region', color: theme.series[1] }]} />
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid {...gridProps(theme)} />
          <XAxis dataKey="t" {...axisProps(theme)} interval={23} />
          <YAxis {...axisProps(theme)} width={44} />
          <Tooltip content={<ChartTooltip digits={1} />} />
          <ReferenceLine y={0} stroke={theme.axis} />
          <Line dataKey="reg" name="Neighbour region" stroke={theme.series[1]} strokeWidth={1.5} dot={false} isAnimationActive={false} />
          <Line dataKey="price" name="Switzerland" stroke={theme.series[0]} strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}

export function EnergyBalance({ series, kpis }) {
  const sum = (a, f = (v) => v) => { let s = 0; for (let i = 0; i < a.length; i++) s += f(a[i]); return s / 1000; };
  const rows = [
    ['Demand', sum(series.demand)],
    ['PV (after feed-in limit)', sum(series.pv)],
    ['PV clipped by feed-in limit', sum(series.pvClipped)],
    ['Wind', sum(series.wind)],
    ['Nuclear', sum(series.nuclear)],
    ['Run-of-river', sum(series.ror)],
    ['Storage hydro', sum(series.storage)],
    ['Biomass & other', sum(series.other)],
    ['Storage losses (pumped, batteries, DSM)', sum(series.pumped) + sum(series.battery) + sum(series.dsm)],
    ['Imports', kpis.importTWh],
    ['Exports', kpis.exportTWh],
  ];
  return (
    <Card title="Annual energy balance" sub="TWh in the selected scenario and weather year.">
      <table className="data">
        <tbody>{rows.map(([k, v]) => <tr key={k}><td>{k}</td><td>{fmt(v, 1)} TWh</td></tr>)}</tbody>
      </table>
    </Card>
  );
}
