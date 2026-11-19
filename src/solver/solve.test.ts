import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Section, TermData } from '../data/types.ts';
import type { CourseConfig, Filters } from './model.ts';
import { computeFeatures, solve } from './solve.ts';
import { customWeights, DEFAULT_CUSTOM } from './rank.ts';
import { courseCredits } from '../data/credits.ts';

const M = 1, T = 2, W = 4, R = 8, F = 16;
let crn = 10000;
const sec = (subj: string, num: string, type: string, d: number, s: number, e: number, ins: string[] = [], campus = 'Beirut'): Section => ({
  crn: String(crn++), subj, num, sec: String(crn % 100), title: `${subj} ${num}`, type, campus, cr: type === 'Lab' ? 0 : 3, ins, m: [{ d, s, e }],
});
const course = (key: string, extra: Partial<CourseConfig> = {}): CourseConfig => ({ key, skipTypes: [], excludedCrns: [], lockedCrns: [], optional: false, ...extra });
const noFilters = (extra: Partial<Filters> = {}): Filters => ({
  campuses: [], earliest: null, latest: null, daysOff: 0, maxDays: 0, blocked: [], profs: {}, hideUnscheduled: false, ...extra,
});
const run = (sections: Section[], courses: CourseConfig[], filters = noFilters()) =>
  solve({ sections, courses, filters, customWeights: customWeights(DEFAULT_CUSTOM) });
const crnsOf = (r: ReturnType<typeof run>, i: number) =>
  r.schedules[i].picks.filter((p) => p >= 0).map((p) => r.candidates[p].crns[0]);

describe('solve', () => {
  const a1 = sec('MTH', '201', 'Lecture', M | W | F, 540, 590, ['Prof A']);
  const a2 = sec('MTH', '201', 'Lecture', T | R, 540, 615, ['Prof B']);
  const b1 = sec('CSC', '245', 'Lecture', M | W | F, 540, 590);
  const b2 = sec('CSC', '245', 'Lecture', M | W | F, 600, 650);
  const pl = sec('PHY', '111', 'Lecture', T | R, 660, 735);
  const pb1 = sec('PHY', '111', 'Lab', R, 840, 1010);
  const pb2 = sec('PHY', '111', 'Lab', T, 540, 710); // conflicts with a2
  const all = [a1, a2, b1, b2, pl, pb1, pb2];

  it('enumerates all conflict-free combinations', () => {
    const r = run(all, [course('MTH 201'), course('CSC 245')]);
    // a1+b2, a2+b1, a2+b2  (a1+b1 clash)
    expect(r.total).toBe(3);
  });

  it('requires one section per schedule type (lecture + lab)', () => {
    const r = run(all, [course('PHY 111')]);
    expect(r.groups.map((g) => g.type).sort()).toEqual(['Lab', 'Lecture']);
    expect(r.total).toBe(1); // pb2 (Tue 9:00–11:50) clashes with the Tue/Thu 11:00 lecture
    for (let i = 0; i < r.schedules.length; i++) expect(crnsOf(r, i)).toHaveLength(2);
  });

  it('skipping a component type drops it', () => {
    const r = run(all, [course('PHY 111', { skipTypes: ['Lab'] })]);
    expect(r.total).toBe(1);
  });

  it('respects conflicts across courses', () => {
    const r = run(all, [course('MTH 201', { lockedCrns: [a2.crn] }), course('PHY 111')]);
    expect(r.total).toBe(1);
    expect(crnsOf(r, 0)).toContain(pb1.crn);
  });

  it('avoid professor removes their sections; prefer ranks them first', () => {
    const avoid = run(all, [course('MTH 201')], noFilters({ profs: { 'Prof A': 'avoid' } }));
    expect(avoid.total).toBe(1);
    const prefer = run(all, [course('MTH 201')], noFilters({ profs: { 'Prof A': 'prefer' } }));
    const top = prefer.rankings['professors'][0];
    expect(prefer.candidates[prefer.schedules[top].picks.find((p) => p >= 0)!].crns).toContain(a1.crn);
  });

  it('collapses equivalent sections into one candidate with alternates', () => {
    const x1 = sec('ENG', '202', 'Lecture', T | R, 800, 875, ['Z']);
    const x2 = sec('ENG', '202', 'Lecture', T | R, 800, 875, ['Z']);
    const r = run([x1, x2], [course('ENG 202')]);
    expect(r.candidates).toHaveLength(1);
    expect(r.candidates[0].crns).toEqual([x1.crn, x2.crn]);
  });

  it('filters: days off, max days, blocked times, time window', () => {
    expect(run(all, [course('MTH 201')], noFilters({ daysOff: F })).total).toBe(1);
    expect(run(all, [course('MTH 201'), course('CSC 245')], noFilters({ maxDays: 3 })).total).toBe(1); // only a1+b2 on MWF
    expect(run(all, [course('CSC 245')], noFilters({ blocked: [{ day: 0, s: 600, e: 660 }] })).total).toBe(1);
    expect(run(all, [course('MTH 201')], noFilters({ earliest: 545 })).diagnosis?.kind).toBe('empty-group');
  });

  it('diagnoses an impossible pair', () => {
    const c1 = sec('AAA', '100', 'Lecture', M, 600, 700);
    const c2 = sec('BBB', '100', 'Lecture', M, 650, 750);
    const r = run([c1, c2], [course('AAA 100'), course('BBB 100')]);
    expect(r.total).toBe(0);
    expect(r.diagnosis?.kind).toBe('pair-conflict');
  });

  it('optional courses are dropped only when they do not fit', () => {
    const c1 = sec('AAA', '100', 'Lecture', M, 600, 700);
    const c2 = sec('BBB', '100', 'Lecture', M, 650, 750);
    const c3 = sec('CCC', '100', 'Lecture', T, 600, 700);
    const r = run([c1, c2, c3], [course('AAA 100'), course('BBB 100', { optional: true }), course('CCC 100', { optional: true })]);
    const best = r.schedules[r.rankings['balanced'][0]];
    expect(best.f.courses).toBe(2);
    expect(best.f.missing).toBe(1);
  });
});

describe('elective pools (pick N LAS)', () => {
  const pool = (count: number, honors: 'regular' | 'honors' | 'either' = 'either', excluded: string[] = []) => ({ id: 'p', subj: 'LAS', count, honors, excluded });
  const runPool = (sections: Section[], courses: CourseConfig[], pools: ReturnType<typeof pool>[], filters = noFilters()) =>
    solve({ sections, courses, pools, filters, customWeights: customWeights(DEFAULT_CUSTOM) });
  const keysOf = (r: ReturnType<typeof run>, i: number, secs: Section[]) =>
    r.schedules[i].picks
      .map((p, g) => (p < 0 ? null : r.schedules[i].poolPick?.[g] ?? r.candidates[p].crns[0]))
      .filter((c): c is string => !!c)
      .map((crn) => { const s = secs.find((x) => x.crn === crn)!; return `${s.subj} ${s.num}`; });

  const l201 = sec('LAS', '201', 'Lecture', M | W | F, 600, 650);
  const l201h = sec('LAS', '201H', 'Lecture', T | R, 800, 875);
  const l202 = sec('LAS', '202', 'Lecture', T | R, 660, 735);
  const l204 = sec('LAS', '204', 'Lecture', M | W | F, 600, 650); // same time as 201
  const l211h = sec('LAS', '211H', 'Lecture', M | W, 900, 975);
  const l499 = sec('LAS', '499H', 'Project', F, 900, 1000);
  const lasAll = [l201, l201h, l202, l204, l211h, l499];

  it('picks N distinct topics with no duplicate orderings', () => {
    const r = runPool(lasAll, [], [pool(2, 'regular')]);
    // regular topics 201, 202, 204; 201 and 204 share a time slot, so there is exactly one
    // distinct weekly schedule (MWF 10:00 + TR 11:00), filled with 202 plus 201 or 204
    expect(r.total).toBe(1);
    const keys = keysOf(r, 0, lasAll).sort();
    expect(keys).toHaveLength(2);
    expect(keys).toContain('LAS 202');
    expect(new Set(keys).size).toBe(2);
  });

  it('same-time topics share one slot candidate', () => {
    const r = runPool([l201, l204], [], [pool(1, 'regular')]);
    expect(r.candidates).toHaveLength(1);
    expect(r.candidates[0].crns.sort()).toEqual([l201.crn, l204.crn].sort());
  });

  it('honors toggle restricts to H courses and never picks a capstone', () => {
    const r = runPool(lasAll, [], [pool(2, 'honors')]);
    expect(r.total).toBe(1);
    expect(keysOf(r, 0, lasAll).sort()).toEqual(['LAS 201H', 'LAS 211H']);
  });

  it('never takes two variants of one topic (201 and 201H)', () => {
    const r = runPool([l201, l201h], [], [pool(2, 'either')]);
    expect(r.total).toBe(0);
    expect(r.diagnosis?.message).toMatch(/only 1/);
  });

  it('skips topics the user added themselves or excluded', () => {
    const r = runPool(lasAll, [course('LAS 202')], [pool(1, 'regular', ['LAS 204'])]);
    for (let i = 0; i < r.schedules.length; i++) expect(keysOf(r, i, lasAll).sort()).toEqual(['LAS 201', 'LAS 202']);
  });

  it('fits electives around required courses', () => {
    const mth = sec('MTH', '201', 'Lecture', T | R, 660, 735); // clashes with LAS 202
    const r = runPool([...lasAll, mth], [course('MTH 201')], [pool(1, 'regular')]);
    expect(r.total).toBe(1); // only the MWF 10:00 slot fits (201 or 204)
    const picked = keysOf(r, 0, [...lasAll, mth]).filter((k) => k.startsWith('LAS'));
    expect(['LAS 201', 'LAS 204']).toContain(picked[0]);
  });
});

describe('split credits (COE 211: 4+0 or 3+1)', () => {
  const withCr = (s: Section, cr: number) => ({ ...s, cr });
  const lec4 = withCr(sec('COE', '211', 'Lecture', M | W, 540, 615), 4);
  const lec4b = withCr(sec('COE', '211', 'Lecture', T | R, 540, 615), 4);
  const lec3 = withCr(sec('COE', '211', 'Lecture', M | W, 660, 735), 3);
  const lab0 = withCr(sec('COE', '211', 'Lab', F, 540, 710), 0);
  const lab0b = withCr(sec('COE', '211', 'Lab', F, 780, 950), 0);
  const lab1 = withCr(sec('COE', '211', 'Lab', T, 780, 950), 1);
  const all = [lec4, lec4b, lec3, lab0, lab0b, lab1];

  it('course credits use the usual split, not max + max', () => {
    expect(courseCredits(all)).toBe(4);
  });

  it('only pairs lecture and lab sections whose credits add up to the course total', () => {
    const r = run(all, [course('COE 211')]);
    // valid: (lec4 | lec4b) x (lab0 | lab0b) = 4, plus lec3 + lab1 = 1  -> 5 schedules, all 4 credits
    expect(r.total).toBe(5);
    for (const s of r.schedules) expect(s.f.credits).toBe(4);
  });

  it('locks and exclusions never let a mismatched pair through', () => {
    // a locked 4-cr lecture + a locked 1-cr lab is still invalid (5 credits)
    const both = run(all, [course('COE 211', { lockedCrns: [lec4.crn, lab1.crn] })]);
    expect(both.total).toBe(0);
    expect(both.diagnosis?.message).toMatch(/must add up to 4/);
    // excluding every 0-cr lab leaves the 4-cr lectures without a partner
    const noLab0 = run(all, [course('COE 211', { excludedCrns: [lab0.crn, lab0b.crn] })]);
    expect(noLab0.total).toBe(1);
    for (const s of noLab0.schedules) expect(s.f.credits).toBe(4);
  });

  it('does not merge equal-time sections with different credits', () => {
    const a = withCr(sec('COE', '212', 'Lecture', M, 600, 700), 4);
    const b = { ...withCr(sec('COE', '212', 'Lecture', M, 600, 700), 3), ins: a.ins };
    expect(run([a, b], [course('COE 212')]).candidates).toHaveLength(2);
  });
});

describe('ranking prefers fewer campus days', () => {
  // Three courses, each offered MWF or TR. All-MWF has a 2h10 gap per day; mixing in TR removes
  // gaps but puts you on campus 5 days. Every preset except the specialised ones must pick MWF.
  const a1 = sec('AAA', '101', 'Lecture', M | W | F, 480, 530);
  const a2 = sec('AAA', '101', 'Lecture', T | R, 540, 615);
  const b1 = sec('BBB', '101', 'Lecture', M | W | F, 540, 590);
  const b2 = sec('BBB', '101', 'Lecture', T | R, 630, 705);
  const c1 = sec('CCC', '101', 'Lecture', M | W | F, 720, 770); // 12:00 — leaves a 2h10 gap after BBB
  const c2 = sec('CCC', '101', 'Lecture', T | R, 630, 705); // clashes with BBB's TR section, so no TR-only schedule
  const r = run([a1, a2, b1, b2, c1, c2], [course('AAA 101'), course('BBB 101'), course('CCC 101')]);
  const topDays = (id: string) => r.schedules[r.rankings[id][0]].f.days;

  it('Balanced, Fewest days, Consistent, Custom and Preferred profs pick the 3-day MWF schedule', () => {
    for (const id of ['balanced', 'fewest-days', 'consistent', 'custom', 'professors']) expect(topDays(id), id).toBe(3);
  });

  it('reports how many schedules use each day pattern', () => {
    expect(r.patterns[M | W | F]).toBe(1);
    expect(r.patterns[T | R]).toBeUndefined();
    expect(r.patterns[M | T | W | R | F]).toBeGreaterThan(0);
    expect(Object.values(r.patterns).reduce((a, b) => a + b, 0)).toBe(r.total);
  });
});

describe('features', () => {
  it('computes gaps, days, lunch and back-to-back', () => {
    const perDay: [number, number][][] = [[[540, 590], [600, 650], [780, 830]], [], [], [], [], [], []];
    const f = computeFeatures(perDay, { courses: 3, missing: 0, credits: 9, preferred: 0, unscheduled: 0 });
    expect(f.days).toBe(1);
    expect(f.b2b).toBe(1); // 9:50 -> 10:00
    expect(f.gaps).toBe(130); // 10:50 -> 13:00
    expect(f.noLunch).toBe(0);
    const busy = computeFeatures([[[660, 735], [735, 810], [810, 885]], [], [], [], [], [], []], { courses: 3, missing: 0, credits: 9, preferred: 0, unscheduled: 0 });
    expect(busy.noLunch).toBe(1);
  });
});

describe('real term data', () => {
  it('solves a typical engineering load quickly', () => {
    let data: TermData;
    try {
      data = JSON.parse(readFileSync('public/data/202710.json', 'utf8'));
    } catch {
      return; // data not scraped yet
    }
    const keys = ['MTH 201', 'PHY 111', 'CSC 245', 'ENG 202', 'ARA 201', 'MTH 207'];
    const present = keys.filter((k) => data.sections.some((s) => `${s.subj} ${s.num}` === k));
    const r = run(data.sections, present.map((k) => course(k)));
    expect(r.ms).toBeLessThan(5000);
    expect(r.total).toBeGreaterThan(0);
    for (const s of r.schedules.slice(0, 50)) {
      const secs = s.picks.filter((p) => p >= 0).map((p) => data.sections.find((x) => x.crn === r.candidates[p].crns[0])!);
      for (let i = 0; i < secs.length; i++)
        for (let j = i + 1; j < secs.length; j++)
          for (const a of secs[i].m) for (const b of secs[j].m) expect((a.d & b.d) && a.s < b.e && b.s < a.e).toBeFalsy();
    }
    console.log(`real: ${present.join(', ')} -> ${r.total} schedules, ${r.nodes} nodes, ${r.ms.toFixed(0)}ms`);
  });

  it('COE 211 always comes out at 4 credits', () => {
    let data: TermData;
    try {
      data = JSON.parse(readFileSync('public/data/202720.json', 'utf8'));
    } catch {
      return;
    }
    const secs = data.sections.filter((s) => s.subj === 'COE' && s.num === '211');
    if (!secs.length) return;
    expect(courseCredits(secs)).toBe(4);
    const r = run(data.sections, [course('COE 211')]);
    expect(r.total).toBeGreaterThan(0);
    for (const s of r.schedules) expect(s.f.credits).toBe(4);
  });
});
