// Shared data model: produced by the scraper, consumed by the web app.
// Kept compact because a whole term ships to the browser as one JSON file.

/** Day bits: Mon=1, Tue=2, Wed=4, Thu=8, Fri=16, Sat=32, Sun=64 */
export const DAY_BITS = { M: 1, T: 2, W: 4, R: 8, F: 16, S: 32, U: 64 } as const;
export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export const DAY_LETTERS = ['M', 'T', 'W', 'R', 'F', 'S', 'U'] as const;

export interface Meeting {
  /** day bitmask */
  d: number;
  /** start minute from midnight */
  s: number;
  /** end minute from midnight */
  e: number;
  /** room / building */
  r?: string;
  /** date label, only set when the meeting does not span the regular term (e.g. "Feb 01" or "Feb 01 – Mar 15") */
  dt?: string;
}

export interface Section {
  crn: string;
  subj: string;
  /** course number, may carry a suffix: "201", "201B", "498H" */
  num: string;
  sec: string;
  title: string;
  /** schedule type: Lecture, Lab, Recitation, Studio, ... */
  type: string;
  /** Beirut | Byblos | Online | other campus name */
  campus: string;
  cr: number;
  /** instructor names, primary first; empty = TBA */
  ins: string[];
  /** recurring weekly meetings; empty = time TBA / unscheduled */
  m: Meeting[];
  /** one-off meetings (a single date) — shown, but never used for conflicts */
  x?: Meeting[];
  lvl?: string;
}

export interface TermData {
  term: string;
  name: string;
  updatedAt: string;
  sections: Section[];
}

export interface TermInfo {
  code: string;
  name: string;
  updatedAt: string;
  sections: number;
  courses: number;
}

export const courseKey = (s: Pick<Section, 'subj' | 'num'>) => `${s.subj} ${s.num}`;

export function fmtTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${m.toString().padStart(2, '0')}${h < 12 ? 'am' : 'pm'}`;
}

export function fmtDays(mask: number): string {
  let out = '';
  for (let i = 0; i < 7; i++) if (mask & (1 << i)) out += DAY_LETTERS[i];
  return out;
}
