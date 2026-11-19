import type { Section } from '../data/types.ts';
import { courseKey } from '../data/types.ts';
import type { Course, TermIndex } from '../data/load.ts';
import type { Features, ProfPref, SolveResult } from '../solver/model.ts';
import { computeFeatures, meetingsOverlap } from '../solver/solve.ts';

/** A concrete schedule as displayed: one section per (course, type), plus equivalent alternates. */
export interface ScheduleView {
  sections: Section[];
  /** crn -> other CRNs with identical time/instructor */
  alternates: Record<string, string[]>;
  f: Features;
  /** CRNs from a saved slot that no longer exist in the term data */
  missing: string[];
}

export function featuresFor(sections: Section[], profs: Record<string, ProfPref>, missingCourses = 0): Features {
  const perDay: [number, number][][] = Array.from({ length: 7 }, () => []);
  for (const s of sections) for (const m of s.m) for (let d = 0; d < 7; d++) if (m.d & (1 << d)) perDay[d].push([m.s, m.e]);
  return computeFeatures(perDay, {
    courses: new Set(sections.map(courseKey)).size,
    missing: missingCourses,
    credits: sections.reduce((a, s) => a + s.cr, 0),
    preferred: sections.filter((s) => s.ins.some((n) => profs[n] === 'prefer')).length,
    unscheduled: sections.filter((s) => !s.m.length).length,
  });
}

export function viewFromResult(r: SolveResult, idx: number, index: TermIndex): ScheduleView {
  const s = r.schedules[idx];
  const sections: Section[] = [];
  const alternates: Record<string, string[]> = {};
  s.picks.forEach((p, g) => {
    if (p < 0) return;
    const c = r.candidates[p];
    const pooled = s.poolPick?.[g];
    const sec = index.byCrn.get(pooled ?? c.crns[0]);
    if (!sec) return;
    sections.push(sec);
    // alternates = same course, same time (for pool slots, other topics at this time are offered via swap)
    const alt = c.crns.filter((x) => x !== sec.crn && (!pooled || courseKey(index.byCrn.get(x)!) === courseKey(sec)));
    if (alt.length) alternates[sec.crn] = alt;
  });
  return { sections, alternates, f: s.f, missing: [] };
}

export function viewFromCrns(crns: string[], index: TermIndex, profs: Record<string, ProfPref>): ScheduleView {
  const sections: Section[] = [];
  const missing: string[] = [];
  for (const c of crns) {
    const s = index.byCrn.get(c);
    if (s) sections.push(s);
    else missing.push(c);
  }
  return { sections, alternates: {}, f: featuresFor(sections, profs), missing };
}

export function conflictsWith(s: Section, others: Section[]): Section | undefined {
  return others.find((o) => o.crn !== s.crn && s.m.some((a) => o.m.some((b) => meetingsOverlap(a, b))));
}

const clashesWith = (s: Section, others: Section[]) =>
  others.filter((o) => o.crn !== s.crn && s.m.some((a) => o.m.some((b) => meetingsOverlap(a, b))));

/**
 * Credit total a course's two components must add up to when the split varies between sections
 * (COE 211: 4-cr lecture + 0-cr lab, or 3 + 1). null = any pairing is fine. Same rule as the solver.
 */
export function pairCredits(course: Course | undefined): number | null {
  if (!course) return null;
  const types = [...new Set(course.sections.map((s) => s.type))];
  if (types.length !== 2) return null;
  const [a, b] = types.map((t) => new Set(course.sections.filter((s) => s.type === t).map((s) => s.cr)));
  if (a.size === 1 && b.size === 1) return null;
  return [...a].some((x) => b.has(course.credits - x)) ? course.credits : null;
}

/** The other component of `s`'s course in `schedule` (its lab, or its lecture) if their credits don't pair up. */
export function creditMismatch(s: Section, schedule: Section[], index: TermIndex): Section | undefined {
  const total = pairCredits(index.byKey.get(courseKey(s)));
  if (total === null) return undefined;
  return schedule.find((o) => o.crn !== s.crn && courseKey(o) === courseKey(s) && o.type !== s.type && o.cr + s.cr !== total);
}

const physical = (c: string) => c !== 'Online' && c !== 'Other';
const sameTimes = (a: Section, b: Section) =>
  a.m.length === b.m.length && a.m.every((x) => b.m.some((y) => x.d === y.d && x.s === y.s && x.e === y.e));

export interface Trade {
  /** the class that's in the way… */
  from: Section;
  /** …and the section of it to move to */
  to: Section;
  /** `to` sits exactly where the selected section was: a straight time swap */
  exact: boolean;
}

/**
 * Moving `selected` to `option` is blocked by exactly one other class (a clash, or a lab whose credits
 * no longer pair up)? Find a section of that class that fits everything else, preferring one at
 * `selected`'s old time, then one in the same campus without an avoided professor.
 */
export function findTrade(
  selected: Section,
  option: Section,
  schedule: Section[],
  index: TermIndex,
  opts: { profs: Record<string, ProfPref>; mixCampuses?: boolean; alternatives?: (s: Section) => Section[] },
): Trade | null {
  const others = schedule.filter((s) => s.crn !== selected.crn);
  const blockers = new Set(clashesWith(option, others));
  const mismatch = creditMismatch(option, others, index);
  if (mismatch) blockers.add(mismatch);
  if (blockers.size !== 1) return null;
  const [from] = blockers;
  const rest = [...others.filter((s) => s.crn !== from.crn), option];
  const home = rest.find((s) => physical(s.campus))?.campus;
  const alts = opts.alternatives?.(from) ?? index.byKey.get(courseKey(from))?.sections ?? [];
  const fits = alts.filter(
    (s) =>
      s.type === from.type &&
      s.crn !== from.crn &&
      !clashesWith(s, rest).length &&
      !creditMismatch(s, rest, index) &&
      (opts.mixCampuses || !home || !physical(s.campus) || s.campus === home),
  );
  if (!fits.length) return null;
  const score = (s: Section) =>
    (sameTimes(s, selected) ? 0 : 4) + (s.ins.some((n) => opts.profs[n] === 'avoid') ? 2 : 0) + (s.ins.join() === from.ins.join() ? 0 : 1);
  const to = fits.sort((a, b) => score(a) - score(b))[0];
  return { from, to, exact: sameTimes(to, selected) };
}

/** One-off dated sessions (usually finals) and clashes between them. */
export function datedSessions(sections: Section[]) {
  const list = sections.flatMap((s) => (s.x ?? []).map((m) => ({ s, m })));
  list.sort((a, b) => +new Date(`${a.m.dt} 2000`) - +new Date(`${b.m.dt} 2000`) || a.m.s - b.m.s);
  const clashes = new Set<string>();
  for (let i = 0; i < list.length; i++)
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      if (a.m.dt === b.m.dt && a.s.crn !== b.s.crn && a.m.s < b.m.e && b.m.s < a.m.e) {
        clashes.add(a.s.crn + a.m.dt);
        clashes.add(b.s.crn + b.m.dt);
      }
    }
  return { list, clashes };
}
