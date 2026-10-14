import React from 'react';
import { fmt } from '../theme.js';

export function axisProps(theme) {
  return {
    stroke: theme.axis,
    tick: { fill: theme.muted, fontSize: 11 },
    tickLine: false,
    axisLine: { stroke: theme.axis },
  };
}

export function gridProps(theme) {
  return { stroke: theme.grid, strokeDasharray: '0', vertical: false };
}

export function ChartTooltip({ active, payload, label, title, unit = '€/MWh', digits = 1, formatter }) {
  if (!active || !payload || !payload.length) return null;
  const rows = payload.filter((p) => p.value != null && !Array.isArray(p.value) && !p.payload?.__hide?.[p.dataKey]);
  const ranges = payload.filter((p) => Array.isArray(p.value));
  return (
    <div className="tooltip">
      <div className="t-title">{title ? title(label, payload) : label}</div>
      {rows.map((p) => (
        <div className="t-row" key={p.dataKey}>
          <span className="n"><i style={{ background: p.color || p.stroke || p.fill }} />{p.name}</span>
          <span>{formatter ? formatter(p.value, p) : `${fmt(p.value, digits)} ${unit}`}</span>
        </div>
      ))}
      {ranges.map((p) => (
        <div className="t-row" key={p.dataKey}>
          <span className="n"><i style={{ background: p.color || p.fill, opacity: 0.5 }} />{p.name}</span>
          <span>{fmt(p.value[0], 0)} – {fmt(p.value[1], 0)} {unit}</span>
        </div>
      ))}
    </div>
  );
}

export function Legend({ items }) {
  return (
    <div className="legend">
      {items.map((it) => (
        <span key={it.label}>
          <span
            className={`sw ${it.type || ''}`}
            style={it.type === 'dash' ? { borderColor: it.color } : { background: it.color, opacity: it.opacity ?? 1 }}
          />
          {it.label}
        </span>
      ))}
    </div>
  );
}

export function Card({ title, sub, right, children }) {
  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h3>{title}</h3>
          {sub && <p className="sub">{sub}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}
