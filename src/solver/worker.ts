/// <reference lib="webworker" />
import type { SolveInput } from './model.ts';
import { solve } from './solve.ts';

self.onmessage = (e: MessageEvent<{ id: number; input: SolveInput }>) => {
  const { id, input } = e.data;
  try {
    const result = solve(input);
    (self as unknown as Worker).postMessage({ id, result });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: (err as Error).message ?? String(err) });
  }
};
