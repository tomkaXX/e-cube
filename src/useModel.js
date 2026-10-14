import { useEffect, useRef, useState } from 'react';

// One worker per job lane (run / band / sensitivity / sweep). A new request on a
// lane that is still busy terminates the stale computation instead of queueing.
const lanes = new Map();

function makeWorker() {
  return new Worker(new URL('./model/worker.js', import.meta.url), { type: 'module' });
}

export function callWorker(msg, lane = msg.type) {
  let L = lanes.get(lane);
  if (L && L.busy) {
    L.worker.terminate();
    L.reject?.(new Error('superseded'));
    L = null;
  }
  if (!L) { L = { worker: makeWorker(), busy: false }; lanes.set(lane, L); }
  const cur = L;
  return new Promise((resolve, reject) => {
    cur.busy = true;
    cur.reject = reject;
    cur.worker.onmessage = (e) => {
      cur.busy = false; cur.reject = null;
      if (e.data.error) reject(new Error(e.data.error)); else resolve(e.data.result);
    };
    cur.worker.onerror = (e) => { cur.busy = false; reject(new Error(e.message)); };
    cur.worker.postMessage({ ...msg, id: 0 });
  });
}

/**
 * Runs a worker job whenever `deps` change (debounced); keeps the previous
 * result on screen while the new one is computing.
 */
export function useWorkerJob(makeMsg, deps, { debounce = 120, enabled = true } = {}) {
  const [state, setState] = useState({ data: null, loading: false, error: null });
  const seq = useRef(0);
  useEffect(() => {
    if (!enabled) return undefined;
    const my = ++seq.current;
    setState((s) => ({ ...s, loading: true }));
    const t = setTimeout(() => {
      callWorker(makeMsg())
        .then((data) => { if (my === seq.current) setState({ data, loading: false, error: null }); })
        .catch((error) => {
          if (error.message === 'superseded') return;
          if (my === seq.current) setState((s) => ({ ...s, loading: false, error }));
        });
    }, debounce);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled]);
  return state;
}
