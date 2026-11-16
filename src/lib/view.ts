import type { Section } from '../data/types.ts';
import { courseKey } from '../data/types.ts';
import type { TermIndex } from '../data/load.ts';
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
