import { useEffect, useRef, useState } from 'react';
import type { SolveInput, SolveResult } from './model.ts';

export type SolverStatus = { state: 'idle' | 'solving' | 'done' | 'error'; result: SolveResult | null; error?: string };

/**
 * Runs the solver in a Web Worker, debounced. If inputs change while a solve is still running,
 * the busy worker is killed and replaced so the UI always reflects the latest filters quickly.
 */
export function useSolver(input: SolveInput | null, debounceMs = 180): SolverStatus {
  const workerRef = useRef<Worker | null>(null);
  const busy = useRef(false);
  const seq = useRef(0);
  const [status, setStatus] = useState<SolverStatus>({ state: 'idle', result: null });

  const spawn = () => {
    workerRef.current?.terminate();
    const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<{ id: number; result?: SolveResult; error?: string }>) => {
      busy.current = false;
      if (e.data.id !== seq.current) return;
      if (e.data.error) setStatus((s) => ({ state: 'error', result: s.result, error: e.data.error }));
      else setStatus({ state: 'done', result: e.data.result! });
    };
    workerRef.current = w;
    busy.current = false;
  };

  useEffect(() => {
    spawn();
    return () => workerRef.current?.terminate();
  }, []);

  useEffect(() => {
    const id = ++seq.current;
    if (!input) {
      setStatus({ state: 'idle', result: null });
      return;
    }
    setStatus((s) => ({ ...s, state: 'solving' }));
    const t = setTimeout(() => {
      if (busy.current) spawn();
      busy.current = true;
      workerRef.current?.postMessage({ id, input });
    }, debounceMs);
    return () => clearTimeout(t);
  }, [input, debounceMs]);

  return status;
}
