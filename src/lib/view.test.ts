import { describe, expect, it } from 'vitest';
import type { Section } from '../data/types.ts';
import { buildIndex } from '../data/load.ts';
import { creditMismatch, findTrade } from './view.ts';

const M = 1, W = 4, F = 16, T = 2;
let crn = 50000;
const sec = (subj: string, num: string, d: number, s: number, e: number, extra: Partial<Section> = {}): Section => ({
  crn: String(crn++), subj, num, sec: String(crn % 100), title: `${subj} ${num}`, type: 'Lecture', campus: 'Beirut', cr: 3, ins: [], m: [{ d, s, e }], ...extra,
});
const index = (sections: Section[]) => buildIndex({ term: '1', name: 'Test', updatedAt: '', sections });
const opts = { profs: {} };

describe('findTrade', () => {
  // A at 9:00, B at 13:00; each also has a section at the other's time
  const a9 = sec('MTH', '201', M | W | F, 540, 590);
  const a13 = sec('MTH', '201', M | W | F, 780, 830);
  const b13 = sec('CSC', '245', M | W | F, 780, 830);
  const b9 = sec('CSC', '245', M | W | F, 540, 590);
  const b11 = sec('CSC', '245', M | W | F, 660, 710);
  const idx = index([a9, a13, b13, b9, b11]);

  it('swaps two classes into each other’s time slots', () => {
    const t = findTrade(a9, a13, [a9, b13], idx, opts);
    expect(t?.from.crn).toBe(b13.crn);
    expect(t?.to.crn).toBe(b9.crn); // B goes to A's old 9:00 slot, not 11:00
    expect(t?.exact).toBe(true);
  });

  it('falls back to another free slot when the exact time is taken', () => {
    // no CSC 245 section at 9:00 this time, only 11:00
    const t = findTrade(a9, a13, [a9, b13], index([a9, a13, b13, b11]), opts);
    expect(t?.to.crn).toBe(b11.crn);
    expect(t?.exact).toBe(false);
  });

  it('gives up when two classes are in the way', () => {
    const wide = sec('MTH', '201', M | W | F, 750, 900); // 12:30–15:00 hits B (13:00) and D (14:00)
    const d14 = sec('BIO', '201', M | W | F, 840, 890);
    const i2 = index([a9, wide, b13, b9, d14]);
    expect(findTrade(a9, wide, [a9, b13, d14], i2, opts)).toBeNull();
  });

  it('gives up when the other class has nowhere to go', () => {
    const i2 = index([a9, a13, b13]);
    expect(findTrade(a9, a13, [a9, b13], i2, opts)).toBeNull();
  });
});

describe('credit pairing in swaps (COE 211: 4+0 or 3+1)', () => {
  const lab = (d: number, s: number, cr: number) => sec('COE', '211', d, s, s + 110, { type: 'Lab', cr });
  const lec4 = sec('COE', '211', M | W | F, 780, 830, { cr: 4 });
  const lec3 = sec('COE', '211', T | 8, 570, 645, { cr: 3 });
  const lab0 = lab(M, 540, 0);
  const lab1 = lab(W, 960, 1);
  // the usual split is 4 + 0 (most sections), as in the real data
  const idx = index([lec4, lec3, lab0, lab1, sec('COE', '211', T | 8, 480, 555, { cr: 4 }), lab(W, 720, 0)]);

  it('flags a lecture whose credits no longer pair with the lab', () => {
    expect(creditMismatch(lec3, [lec4, lab0], idx)?.crn).toBe(lab0.crn);
    expect(creditMismatch(lec4, [lec3, lab0], idx)).toBeUndefined();
  });

  it('moves the lab along when switching to the other credit split', () => {
    const t = findTrade(lec4, lec3, [lec4, lab0], idx, opts);
    expect(t?.from.crn).toBe(lab0.crn);
    expect(t?.to.crn).toBe(lab1.crn);
  });
});
