import type { Section } from '../data/types.ts';
import { courseKey } from '../data/types.ts';
import type { PoolConfig } from './model.ts';

/** Courses that never belong in an elective pool (capstones, portfolios). */
const NEVER: Record<string, string[]> = { LAS: ['LAS 498H', 'LAS 499H'] };

/** "201H" -> "201": regular, honors and language variants of one topic share a base. */
export const baseNum = (num: string) => num.replace(/[A-Z]+$/, '');
export const isHonors = (num: string) => /H$/.test(num);

export interface PoolCourse {
  key: string;
  base: string;
  title: string;
  honors: boolean;
  sections: number[];
}

/**
 * Courses a pool may choose from, in a stable order. Courses the user already added
 * (or any variant of them) are left out so the pool never doubles up.
 */
export function poolCourses(sections: Section[], pool: PoolConfig, takenKeys: string[]): PoolCourse[] {
  const takenBases = new Set(takenKeys.filter((k) => k.startsWith(pool.subj + ' ')).map((k) => baseNum(k.split(' ')[1])));
  const map = new Map<string, PoolCourse>();
  sections.forEach((s, i) => {
    if (s.subj !== pool.subj) return;
    const key = courseKey(s);
    if ((NEVER[pool.subj] ?? []).includes(key)) return;
    const honors = isHonors(s.num);
    if (pool.honors === 'regular' && honors) return;
    if (pool.honors === 'honors' && !honors) return;
    const base = baseNum(s.num);
    if (takenBases.has(base)) return;
    let c = map.get(key);
    if (!c) map.set(key, (c = { key, base, title: s.title, honors, sections: [] }));
    c.sections.push(i);
  });
  // only single-component courses (an elective with a lab would need pairing)
  for (const [k, c] of map) if (new Set(c.sections.map((i) => sections[i].type)).size > 1) map.delete(k);
  return [...map.values()].sort((a, b) => a.base.localeCompare(b.base, undefined, { numeric: true }) || a.key.localeCompare(b.key));
}
