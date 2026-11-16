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

/**
 * What one extra day on campus "costs", in minutes of your week: the commute both ways plus the
 * day you lose. It has to be large in *every* preset — otherwise a 5-day schedule with slightly
 * shorter gaps beats a 3-day MWF schedule, which no student actually wants.
 */
const DAY = 180;

export const PRESETS: Preset[] = [
  {
    id: 'balanced',
    label: 'Balanced',
    hint: 'Fewest days first, then short gaps, steady times, sensible hours and a lunch break',
    weights: { ...BASE, days: DAY, gaps: 0.5, spread: 0.5, earliness: 0.4, lateness: 0.3, noLunch: 30, b2b: 5, preferred: -60 },
  },
  {
    id: 'fewest-days',
    label: 'Fewest days',
    hint: 'Come to campus as few days as possible — strictly',
    weights: { ...BASE, days: 5000, gaps: 0.6, spread: 0.3, earliness: 0.2, lateness: 0.15, noLunch: 15, preferred: -20 },
  },
  {
    id: 'compact',
    label: 'Least idle time',
    hint: 'Minimise gaps between classes (an extra campus day still counts as ~3 hours)',
    weights: { ...BASE, gaps: 2, days: DAY, onCampus: 0.1, preferred: -20 },
  },
  {
    id: 'consistent',
    label: 'Consistent times',
    hint: 'Start and finish at about the same time every day',
    weights: { ...BASE, spread: 3, days: DAY, gaps: 0.4, preferred: -20 },
  },
  {
    id: 'late-start',
    label: 'Late starts',
    hint: 'Sleep in — classes start as late as possible',
    weights: { ...BASE, earliness: 1.5, start: -0.5, days: DAY, gaps: 0.3, preferred: -20 },
  },
  {
    id: 'early-finish',
    label: 'Early finish',
    hint: 'Be done early in the day',
    weights: { ...BASE, lateness: 1.5, end: 0.5, days: DAY, gaps: 0.3, preferred: -20 },
  },
  {
    id: 'professors',
    label: 'Preferred profs',
    hint: 'As many sections with your preferred professors as possible',
    weights: { ...BASE, preferred: -5000, days: DAY, gaps: 0.5, spread: 0.3, earliness: 0.2 },
  },
];

export const CUSTOM_ID = 'custom';

/** Slider definitions for the custom preset. Values are 0..10 importance; mapped to weights below. */
export const CUSTOM_FACTORS: { key: keyof Features; label: string; scale: number; sign?: -1 }[] = [
  { key: 'days', label: 'Fewer days', scale: 36 }, // 5 -> 180 per day, same as the presets
  { key: 'gaps', label: 'Less idle time', scale: 0.12 }, // 5 -> 0.6 per idle minute
  { key: 'spread', label: 'Consistent times', scale: 0.12 },
  { key: 'earliness', label: 'Late starts', scale: 0.12 },
  { key: 'lateness', label: 'Early finish', scale: 0.12 },
  { key: 'noLunch', label: 'Lunch break', scale: 8 },
  { key: 'b2b', label: 'Avoid back-to-back', scale: 2 },
  { key: 'preferred', label: 'Preferred profs', scale: 20, sign: -1 },
];

export const DEFAULT_CUSTOM: Record<string, number> = {
  days: 5, gaps: 5, spread: 3, earliness: 3, lateness: 2, noLunch: 3, b2b: 2, preferred: 4,
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
