// Scenario parameters. `ref` reproduces the 2024 system (used as calibration
// reference), `base` is the 2035 central scenario.

export const PARAM_GROUPS = [
  { id: 'demand', label: 'Swiss demand' },
  { id: 'supply', label: 'Swiss supply' },
  { id: 'flex', label: 'Flexibility' },
  { id: 'grid', label: 'Cross-border (transit)' },
  { id: 'europe', label: 'Neighbouring markets' },
  { id: 'fuel', label: 'Fuel & CO₂' },
];

export const PARAMS = [
  { key: 'demandBase', group: 'demand', label: 'Base demand', unit: 'TWh', min: 50, max: 72, step: 0.5, ref: 61, base: 59,
    help: 'Swiss national load excluding new electrification (efficiency gains reduce it).' },
  { key: 'heatPumps', group: 'demand', label: 'Additional heat pumps', unit: 'TWh', min: 0, max: 10, step: 0.5, ref: 0, base: 3.5,
    help: 'Extra heating demand vs. 2024, temperature-driven, winter-heavy.' },
  { key: 'eMobility', group: 'demand', label: 'Additional e-mobility', unit: 'TWh', min: 0, max: 10, step: 0.5, ref: 0, base: 4.5,
    help: 'Extra EV charging vs. 2024 (unmanaged charging peaks in the evening; smart charging is in DSM).' },

  { key: 'pv', group: 'supply', label: 'PV production', unit: 'TWh', min: 3, max: 50, step: 0.5, ref: 6, base: 29,
    help: 'EnG Art. 2: 35 TWh new renewables (excl. hydro) by 2035, of which PV is the bulk. 2030 PV target 18.7 TWh.' },
  { key: 'pvFeedInCap', group: 'supply', label: 'PV feed-in limit', unit: '% of kWp', min: 50, max: 100, step: 5, ref: 100, base: 85,
    help: 'PV injection management: peak injection capped at this share of installed capacity.' },
  { key: 'wind', group: 'supply', label: 'Wind production', unit: 'TWh', min: 0, max: 5, step: 0.1, ref: 0.15, base: 1.0 },
  { key: 'otherRes', group: 'supply', label: 'Biomass, waste & other thermal', unit: 'TWh', min: 0, max: 8, step: 0.1, ref: 3.6, base: 4.3 },
  { key: 'nuclear', group: 'supply', label: 'Nuclear capacity', unit: 'GW', min: 0, max: 3.3, step: 0.05, ref: 2.97, base: 2.24,
    help: 'Beznau 1+2 (0.73 GW) planned to retire 2032/2033; Gösgen and Leibstadt (2.24 GW) remain.' },
  { key: 'hydroRoR', group: 'supply', label: 'Run-of-river hydro', unit: 'TWh', min: 12, max: 22, step: 0.5, ref: 17.5, base: 18 },
  { key: 'hydroStorage', group: 'supply', label: 'Storage hydro (natural inflow)', unit: 'TWh', min: 14, max: 26, step: 0.5, ref: 20.5, base: 21.5 },
  { key: 'hydroStorageGW', group: 'supply', label: 'Storage hydro turbine capacity', unit: 'GW', min: 6, max: 12, step: 0.1, ref: 8.5, base: 9 },
  { key: 'winterShift', group: 'supply', label: 'Summer → winter shift', unit: 'TWh', min: 0, max: 4, step: 0.1, ref: 0, base: 1.5,
    help: 'Additional seasonal storage (Mantelerlass winter projects, dam heightening).' },

  { key: 'pumpedGW', group: 'flex', label: 'Pumped storage', unit: 'GW', min: 1, max: 6, step: 0.1, ref: 3.6, base: 3.9 },
  { key: 'batteryGW', group: 'flex', label: 'Batteries (utility + home)', unit: 'GW', min: 0, max: 8, step: 0.1, ref: 0.15, base: 1.5 },
  { key: 'batteryHours', group: 'flex', label: 'Battery duration', unit: 'h', min: 1, max: 6, step: 0.5, ref: 1.5, base: 2 },
  { key: 'dsmShare', group: 'flex', label: 'Demand-side flexibility', unit: '% of daily load', min: 0, max: 12, step: 0.5, ref: 0.5, base: 4,
    help: 'Share of daily demand (smart EV charging, heat pumps, industry) that can be shifted within the day.' },

  { key: 'importCap', group: 'grid', label: 'Net import capacity', unit: 'GW', min: 2, max: 12, step: 0.1, ref: 6.5, base: 7.5,
    help: 'Effective NTC from FR/DE/AT/IT; a CH-EU electricity agreement would raise it.' },
  { key: 'exportCap', group: 'grid', label: 'Net export capacity', unit: 'GW', min: 2, max: 12, step: 0.1, ref: 6, base: 7 },

  { key: 'euPvShare', group: 'europe', label: 'PV share in neighbours', unit: '% of demand', min: 5, max: 40, step: 1, ref: 11, base: 24 },
  { key: 'euWindShare', group: 'europe', label: 'Wind share in neighbours', unit: '% of demand', min: 10, max: 50, step: 1, ref: 19, base: 30 },
  { key: 'euBaseShare', group: 'europe', label: 'Nuclear + hydro in neighbours', unit: '% of demand', min: 15, max: 45, step: 1, ref: 34, base: 31 },
  { key: 'euFlex', group: 'europe', label: 'Flexibility in neighbours', unit: '% smoothing', min: 0, max: 50, step: 1, ref: 6, base: 25,
    help: 'Batteries / DSM in DE-FR-IT that flatten the intra-day residual load.' },

  { key: 'gas', group: 'fuel', label: 'Gas price (TTF)', unit: '€/MWh', min: 10, max: 100, step: 1, ref: 34, base: 30 },
  { key: 'co2', group: 'fuel', label: 'CO₂ price (EU ETS)', unit: '€/t', min: 20, max: 250, step: 5, ref: 65, base: 130 },
  { key: 'negFloor', group: 'fuel', label: 'Negative price floor', unit: '€/MWh', min: -150, max: 0, step: 5, ref: -60, base: -15,
    help: 'Depth of negative prices; shrinks as subsidy schemes stop paying during negative hours.' },
];

export const PARAM_BY_KEY = Object.fromEntries(PARAMS.map((p) => [p.key, p]));

export const defaults = (which = 'base') => Object.fromEntries(PARAMS.map((p) => [p.key, p[which]]));

export const PRESETS = [
  { id: 'base', label: '2035 central', desc: 'EnG targets met, Beznau retired, CH-EU agreement', params: defaults('base') },
  { id: 'lowPv', label: '2035 slow PV', desc: 'PV only reaches the 2030 path (18.7 TWh)', params: { ...defaults('base'), pv: 18.7 } },
  { id: 'highPv', label: '2035 high PV', desc: 'PV 40 TWh, more batteries', params: { ...defaults('base'), pv: 40, batteryGW: 3, batteryHours: 2.5 } },
  { id: 'isolated', label: '2035 no EU agreement', desc: 'Reduced import/export capacity', params: { ...defaults('base'), importCap: 5, exportCap: 4.5 } },
  { id: 'highGas', label: '2035 gas crisis', desc: 'Gas 70 €/MWh, CO₂ 150 €/t', params: { ...defaults('base'), gas: 70, co2: 150 } },
  { id: 'ref', label: '2024 reference', desc: 'Calibration year fundamentals', params: defaults('ref') },
];

// Parameters swept in the sensitivity (tornado) analysis: low / high around the scenario value.
export const SENSITIVITY = [
  { key: 'pv', delta: 10, label: 'PV ±10 TWh' },
  { key: 'gas', rel: 0.4, label: 'Gas ±40 %' },
  { key: 'co2', rel: 0.4, label: 'CO₂ ±40 %' },
  { key: 'nuclear', abs: [0, 2.97], label: 'Nuclear 0 / 2.97 GW' },
  { key: 'euPvShare', delta: 8, label: 'EU PV share ±8 pp' },
  { key: 'euWindShare', delta: 8, label: 'EU wind share ±8 pp' },
  { key: 'importCap', delta: 2.5, label: 'Import NTC ±2.5 GW', also: 'exportCap' },
  { key: 'batteryGW', delta: 1.5, label: 'Batteries ±1.5 GW' },
  { key: 'dsmShare', delta: 3, label: 'DSM ±3 pp' },
  { key: 'euFlex', delta: 15, label: 'EU flexibility ±15 pp' },
  { key: 'heatPumps', delta: 3, label: 'Heat pumps ±3 TWh', also: 'eMobility' },
  { key: 'hydroStorage', delta: 2.5, label: 'Hydro inflow ±2.5 TWh' },
];
