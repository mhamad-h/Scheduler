import type { Features, Weights } from './model.ts';

export interface Preset {
  id: string;
  label: string;
  hint: string;
  weights: Weights;
}

// Every preset first maximises the number of courses that fit (missing has a huge weight),
// then trades off the rest. Units are minutes or counts, so weights read as "minutes per unit".
const BASE: Weights = { missing: 100000 };

export const PRESETS: Preset[] = [
  {
    id: 'balanced',
    label: 'Balanced',
    hint: 'A sensible mix of fewer days, short gaps, steady times and a lunch break',
    weights: { ...BASE, days: 90, gaps: 0.6, spread: 0.5, earliness: 0.35, lateness: 0.25, noLunch: 25, b2b: 4, preferred: -60 },
  },
  {
    id: 'fewest-days',
    label: 'Fewest days',
    hint: 'Come to campus as few days as possible',
    weights: { ...BASE, days: 2000, gaps: 0.5, spread: 0.2, onCampus: 0.1, preferred: -20 },
  },
  {
    id: 'compact',
    label: 'Least idle time',
    hint: 'Minimise gaps between classes',
    weights: { ...BASE, gaps: 3, days: 30, onCampus: 0.2, preferred: -20 },
  },
  {
    id: 'consistent',
    label: 'Consistent times',
    hint: 'Start and finish at about the same time every day',
    weights: { ...BASE, spread: 4, days: 30, gaps: 0.4, preferred: -20 },
  },
  {
    id: 'late-start',
    label: 'Late starts',
    hint: 'Sleep in — classes start as late as possible',
    weights: { ...BASE, earliness: 3, start: -0.5, days: 20, gaps: 0.3, preferred: -20 },
  },
  {
    id: 'early-finish',
    label: 'Early finish',
    hint: 'Be done early in the day',
    weights: { ...BASE, lateness: 3, end: 0.5, days: 20, gaps: 0.3, preferred: -20 },
  },
  {
    id: 'professors',
    label: 'Preferred profs',
    hint: 'As many sections with your preferred professors as possible',
    weights: { ...BASE, preferred: -5000, days: 60, gaps: 0.5, spread: 0.3, earliness: 0.2 },
  },
];

export const CUSTOM_ID = 'custom';

/** Slider definitions for the custom preset. Values are 0..10 importance; mapped to weights below. */
export const CUSTOM_FACTORS: { key: keyof Features; label: string; scale: number; sign?: -1 }[] = [
  { key: 'days', label: 'Fewer days', scale: 40 },
  { key: 'gaps', label: 'Less idle time', scale: 0.4 },
  { key: 'spread', label: 'Consistent times', scale: 0.4 },
  { key: 'earliness', label: 'Late starts', scale: 0.4 },
  { key: 'lateness', label: 'Early finish', scale: 0.4 },
  { key: 'noLunch', label: 'Lunch break', scale: 12 },
  { key: 'b2b', label: 'Avoid back-to-back', scale: 6 },
  { key: 'preferred', label: 'Preferred profs', scale: 30, sign: -1 },
];

export const DEFAULT_CUSTOM: Record<string, number> = {
  days: 6, gaps: 5, spread: 3, earliness: 3, lateness: 2, noLunch: 3, b2b: 1, preferred: 4,
};

export function customWeights(values: Record<string, number>): Weights {
  const w: Weights = { ...BASE };
  for (const f of CUSTOM_FACTORS) w[f.key] = (values[f.key] ?? 0) * f.scale * (f.sign ?? 1);
  return w;
}

export function cost(f: Features, w: Weights): number {
  let c = 0;
  for (const k in w) c += (w[k as keyof Features] ?? 0) * f[k as keyof Features];
  return c;
}
