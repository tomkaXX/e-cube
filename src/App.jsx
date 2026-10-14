import React, { useCallback, useMemo, useState } from 'react';
import Sidebar from './components/Sidebar.jsx';
import { KpiTiles, YearChart, MonthlyChart } from './components/Overview.jsx';
import { HeatmapPair, SeasonProfiles, DurationChart } from './components/Shape.jsx';
import { WeekView, EnergyBalance } from './components/Fundamentals.jsx';
import { Tornado, Attribution, PvSweep } from './components/Sensitivity.jsx';
import { Method } from './components/Method.jsx';
import { PRESETS } from './model/scenarios.js';
import calibration from './model/calibration.json';
import { useTheme, fmt } from './theme.js';
import { useWorkerJob } from './useModel.js';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'shape', label: 'Curve shape' },
  { id: 'fundamentals', label: 'Fundamentals' },
  { id: 'sensitivity', label: 'Sensitivity' },
  { id: 'pv', label: 'PV target' },
  { id: 'method', label: 'Method & assumptions' },
];
const PV_VALUES = [8, 12, 15, 18.7, 22, 25, 29, 33, 37, 40, 45, 50];

function readHash() {
  try {
    const h = new URLSearchParams(window.location.hash.slice(1));
    return { tab: h.get('tab'), preset: h.get('s') };
  } catch { return {}; }
}

function downloadCsv(series, params, kpis) {
  const lines = [
    `# Swiss PFC 2035 - hourly model output (local market time, 365x24h)`,
    `# baseload ${kpis.base.toFixed(2)} EUR/MWh; parameters: ${JSON.stringify(params)}`,
    'date,hour,price_ch_eur_mwh,price_region_eur_mwh,demand_gw,pv_gw,wind_gw,nuclear_gw,run_of_river_gw,storage_hydro_gw,pumped_net_gw,battery_net_gw,dsm_net_gw,net_import_gw',
  ];
  for (let i = 0; i < series.price.length; i++) {
    const d = new Date(Date.UTC(2035, 0, 1 + Math.floor(i / 24))).toISOString().slice(0, 10);
    const f = (a) => a[i].toFixed(3);
    lines.push([d, i % 24, f(series.price), f(series.regionalPrice), f(series.demand), f(series.pv), f(series.wind), f(series.nuclear), f(series.ror), f(series.storage), f(series.pumped), f(series.battery), f(series.dsm), f(series.netImport)].join(','));
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'swiss_pfc_2035_hourly.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export default function App() {
  const theme = useTheme();
  const init = readHash();
  const [tab, setTab] = useState(TABS.some((t) => t.id === init.tab) ? init.tab : 'overview');
  const [preset, setPreset] = useState(PRESETS.some((p) => p.id === init.preset) ? init.preset : 'base');
  const [params, setParams] = useState(() => ({ ...PRESETS.find((p) => p.id === preset).params }));
  const [seed, setSeed] = useState(1);

  const setHash = (t, p) => {
    try { window.history.replaceState(null, '', `#tab=${t}&s=${p}`); } catch { /* ignore */ }
  };
  const selectTab = (t) => { setTab(t); setHash(t, preset); };
  const applyPreset = (id) => { setPreset(id); setParams({ ...PRESETS.find((p) => p.id === id).params }); setHash(tab, id); };
  const setParam = useCallback((k, v) => setParams((p) => ({ ...p, [k]: v })), []);
  const key = JSON.stringify(params);

  const run = useWorkerJob(() => ({ type: 'run', params, seed }), [key, seed], { debounce: 60 });
  const band = useWorkerJob(() => ({ type: 'band', params }), [key], { debounce: 400 });
  const sens = useWorkerJob(() => ({ type: 'sensitivity', params }), [key], { debounce: 500, enabled: tab === 'sensitivity' });
  const sweep = useWorkerJob(() => ({ type: 'sweep', params, key: 'pv', values: PV_VALUES }), [key], { debounce: 500, enabled: tab === 'pv' });

  const data = run.data;
  const toggleTheme = () => {
    document.documentElement.dataset.theme = theme.mode === 'dark' ? 'light' : 'dark';
  };
  const busy = run.loading || band.loading || sens.loading || sweep.loading;
  const presetLabel = useMemo(() => {
    const p = PRESETS.find((x) => x.id === preset);
    const custom = p && JSON.stringify(p.params) !== key;
    return `${p ? p.label : 'Custom'}${custom ? ' (modified)' : ''}`;
  }, [preset, key]);

  return (
    <div className="app">
      <Sidebar
        params={params} setParam={setParam} preset={preset} applyPreset={applyPreset}
        seed={seed} setSeed={setSeed} themeMode={theme.mode} onToggleTheme={toggleTheme}
        onDownload={() => data && downloadCsv(data.main.series, params, data.main.kpis)}
      />
      <main className="main">
        <div className="topbar">
          <div>
            <h2>Hourly Swiss Price Forward Curve 2035</h2>
            <p>Scenario: <b>{presetLabel}</b> · weather year #{seed}
              {!calibration.fitted && <> · <span className="pill" title="See Method tab">default calibration</span></>}
            </p>
          </div>
          <div className="status" aria-live="polite">{busy ? 'Computing…' : data ? `Baseload ${fmt(data.main.kpis.base, 1)} €/MWh` : ''}</div>
        </div>
        <nav className="tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => selectTab(t.id)}>{t.label}</button>
          ))}
        </nav>

        {run.error && <div className="card" style={{ color: 'var(--bad)' }}>Model error: {String(run.error.message || run.error)}</div>}
        {!data && !run.error && <div className="card"><p className="note">Running the hourly model…</p></div>}

        {data && (
          <div style={{ opacity: run.loading ? 0.7 : 1, transition: 'opacity .2s' }}>
            {tab === 'overview' && (
              <>
                <KpiTiles kpis={data.main.kpis} refKpis={data.ref.kpis} band={band.data?.kpis} />
                <YearChart series={data.main.series} theme={theme} baseload={data.main.kpis.base} />
                <div className="grid-2">
                  <MonthlyChart monthly={data.main.monthly} refMonthly={data.ref.monthly} band={band.data?.monthly} theme={theme} />
                  <DurationChart main={data.main} refData={data.ref} theme={theme} />
                </div>
              </>
            )}
            {tab === 'shape' && (
              <>
                <HeatmapPair main={data.main} refData={data.ref} theme={theme} />
                <SeasonProfiles main={data.main} refData={data.ref} band={band.data} theme={theme} />
              </>
            )}
            {tab === 'fundamentals' && (
              <>
                <WeekView series={data.main.series} theme={theme} />
                <div className="grid-2">
                  <EnergyBalance series={data.main.series} kpis={data.main.kpis} />
                  <Attribution attribution={data.main.attribution} historical={calibration.historicalImportance} theme={theme} />
                </div>
              </>
            )}
            {tab === 'sensitivity' && (
              <>
                <Tornado data={sens.data} loading={sens.loading} theme={theme} />
                <Attribution attribution={data.main.attribution} historical={calibration.historicalImportance} theme={theme} />
              </>
            )}
            {tab === 'pv' && <PvSweep data={sweep.data} loading={sweep.loading} theme={theme} current={params.pv} />}
            {tab === 'method' && <Method mo={data.main.mo} theme={theme} />}
          </div>
        )}
        <p className="note" style={{ marginTop: 24 }}>
          Model and visualisation for the E-Cube Strategy Consultants "Swiss PFC 2035" challenge. Results are scenario projections, not price forecasts or investment advice.
        </p>
      </main>
    </div>
  );
}
