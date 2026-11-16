// Distinct hues for course blocks; assigned by the course's position in the user's list.
const HUES = [212, 152, 28, 280, 350, 190, 48, 255, 120, 5, 320, 170];

export const hueFor = (i: number) => HUES[((i % HUES.length) + HUES.length) % HUES.length];

export function courseHues(keys: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  keys.forEach((k, i) => (out[k] = hueFor(i)));
  return out;
}
