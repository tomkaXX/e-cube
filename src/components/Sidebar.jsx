import React, { useState } from 'react';
import { PARAMS, PARAM_GROUPS, PRESETS } from '../model/scenarios.js';
import { fmt } from '../theme.js';

function decimals(step) {
  const s = String(step);
  return s.includes('.') ? s.split('.')[1].length : 0;
}

export default function Sidebar({ params, setParam, preset, applyPreset, seed, setSeed, onDownload, onToggleTheme, themeMode }) {
  const [collapsed, setCollapsed] = useState(true);
  const presetParams = PRESETS.find((p) => p.id === preset)?.params;
  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="brand">
        <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
          <rect width="32" height="32" rx="7" fill="var(--accent)" />
          <path d="M5 21 L10 14 L14 18 L19 8 L23 15 L27 11" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <h1>Swiss PFC 2035</h1>
      </div>
      <p className="brand-sub">Hourly Price Forward Curve model · E-Cube challenge</p>
      <div className="row">
        <button className="btn mobile-toggle" onClick={() => setCollapsed((c) => !c)}>
          {collapsed ? 'Show scenario settings' : 'Hide scenario settings'}
        </button>
      </div>

      <div className="collapsible">
        <div className="section-label">Scenario</div>
        <div className="presets">
          {PRESETS.map((p) => (
            <button key={p.id} className={`chip ${preset === p.id ? 'active' : ''}`} onClick={() => applyPreset(p.id)} title={p.desc}>
              {p.label}
            </button>
          ))}
        </div>
        <p className="note" style={{ marginTop: 8 }}>{PRESETS.find((p) => p.id === preset)?.desc ?? 'Custom scenario'}</p>

        <div className="section-label">Weather year</div>
        <div className="row">
          <select className="btn" value={seed} onChange={(e) => setSeed(Number(e.target.value))} aria-label="Weather year">
            {[1, 2, 3, 4, 5, 6, 7].map((s) => <option key={s} value={s}>Weather year #{s}</option>)}
          </select>
          <span className="note">PV, wind, temperature, hydrology</span>
        </div>

        <div className="section-label">Parameters</div>
        {PARAM_GROUPS.map((g, gi) => (
          <details className="group" key={g.id} open={gi < 2}>
            <summary>{g.label}</summary>
            {PARAMS.filter((p) => p.group === g.id).map((p) => {
              const v = params[p.key];
              const changed = presetParams && Math.abs(presetParams[p.key] - v) > 1e-9;
              return (
                <div className="param" key={p.key}>
                  <label className="param-head" htmlFor={`p-${p.key}`}>
                    <span className="lbl">{p.label}</span>
                    <span className={`val ${changed ? 'changed' : ''}`}>{fmt(v, decimals(p.step))} {p.unit}</span>
                  </label>
                  <input
                    id={`p-${p.key}`} type="range" min={p.min} max={p.max} step={p.step} value={v}
                    onChange={(e) => setParam(p.key, Number(e.target.value))}
                  />
                  {p.help && <div className="help">{p.help}</div>}
                </div>
              );
            })}
          </details>
        ))}

        <div className="section-label">Export</div>
        <div className="row">
          <button className="btn primary" onClick={onDownload}>Download hourly PFC (CSV)</button>
          <button className="btn" onClick={onToggleTheme}>{themeMode === 'dark' ? 'Light mode' : 'Dark mode'}</button>
        </div>
      </div>
    </aside>
  );
}
