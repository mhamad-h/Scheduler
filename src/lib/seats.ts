import type { Section } from '../data/types.ts';

/** closed = Banner lists a capacity of 0 (thesis/project placeholders, sections not opened yet) */
export type SeatState = 'open' | 'low' | 'full' | 'closed' | 'unknown';

/** remaining seats, or null when Banner gave no numbers for this section */
export const remaining = (s: Section): number | null => (s.seats ? s.seats[2] : null);

export function seatState(s: Section): SeatState {
  if (!s.seats) return 'unknown';
  const [cap, , rem] = s.seats;
  if (cap <= 0) return 'closed';
  if (rem <= 0) return 'full';
  if (rem <= Math.max(3, Math.round(cap * 0.1))) return 'low';
  return 'open';
}

/** no seat can be taken right now (full or closed) */
export const noSeats = (s: Section) => {
  const st = seatState(s);
  return st === 'full' || st === 'closed';
};

/** Sort key: most remaining seats first, unknown in the middle, full/closed last. */
export const seatRank = (s: Section) => {
  const r = remaining(s);
  return r === null ? 0.5 : r > 0 ? r + 1 : 0;
};

export function seatLabel(s: Section): string {
  if (!s.seats) return 'No seat numbers from Banner for this section';
  const [cap, act, rem] = s.seats;
  if (cap <= 0) return 'Closed: Banner lists 0 seats (not open for registration, or by permission only)';
  const wl = s.wl ? ` · waitlist ${s.wl[1]}/${s.wl[0]}` : '';
  return rem <= 0 ? `Full: ${act} registered of ${cap}${wl}` : `${rem} of ${cap} seats left (${act} registered)${wl}`;
}

export const seatShort = (s: Section) => {
  const st = seatState(s);
  return st === 'closed' ? 'Closed' : st === 'full' ? 'Full' : s.seats ? `${s.seats[2]} left` : '';
};
