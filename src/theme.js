import { useEffect, useState } from 'react';

// Reference data-viz palette (validated light/dark steps).
const LIGHT = {
  surface: '#fcfcfb', page: '#f9f9f7', ink: '#0b0b0b', ink2: '#52514e', muted: '#898781',
  grid: '#e1e0d9', axis: '#c3c2b7',
  series: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'],
  // diverging ramps ordered near-midpoint -> extreme
  div: { neg: ['#cde2fb', '#86b6ef', '#3987e5', '#1c5cab', '#0d366b'], mid: '#f0efec', pos: ['#fbd5d4', '#f19b9a', '#e34948', '#b02a29', '#741a1a'] },
};
const DARK = {
  surface: '#1a1a19', page: '#0d0d0d', ink: '#f0efec', ink2: '#c3c2b7', muted: '#898781',
  grid: '#2c2c2a', axis: '#383835',
  series: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
  div: { neg: ['#184f95', '#1c5cab', '#3987e5', '#86b6ef', '#cde2fb'], mid: '#383835', pos: ['#5e1d1d', '#b02a29', '#e34948', '#f19b9a', '#fbd5d4'] },
};

function currentMode() {
  const t = document.documentElement.dataset.theme;
  if (t === 'dark' || t === 'light') return t;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function useTheme() {
  const [mode, setMode] = useState(currentMode);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => setMode(currentMode());
    mq.addEventListener('change', on);
    const obs = new MutationObserver(on);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => { mq.removeEventListener('change', on); obs.disconnect(); };
  }, []);
  return { mode, ...(mode === 'dark' ? DARK : LIGHT) };
}

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => {
  const A = hex(a), B = hex(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
};

/** Diverging scale: t in [-1, 1] relative to the neutral midpoint. */
export function divergingColor(theme, t) {
  const c = Math.max(-1, Math.min(1, t));
  const a = Math.abs(c);
  if (a < 0.06) return theme.div.mid;
  const stops = [theme.div.mid, ...(c < 0 ? theme.div.neg : theme.div.pos)];
  const pos = a * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(pos));
  return mix(stops[i], stops[i + 1], pos - i);
}
export const fmt = (v, d = 0) => (v == null || Number.isNaN(v) ? '–' : Number(v).toLocaleString('en-CH', { minimumFractionDigits: d, maximumFractionDigits: d }));
