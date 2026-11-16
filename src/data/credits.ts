import type { Section } from './types.ts';

/**
 * Credits of a whole course from its sections.
 *
 * Banner sometimes splits a course's credits between components in more than one way, e.g.
 * COE 211 (4 cr): most lectures are 4 cr with 0-cr labs, but one lecture is 3 cr with 1-cr labs.
 * Taking the max per component would give 4 + 1 = 5, so use the most common value per
 * component (ties -> higher) and add those up.
 */
export function courseCredits(sections: Section[]): number {
  const byType = new Map<string, Map<number, number>>();
  for (const s of sections) {
    const m = byType.get(s.type) ?? byType.set(s.type, new Map()).get(s.type)!;
    m.set(s.cr, (m.get(s.cr) ?? 0) + 1);
  }
  let total = 0;
  for (const counts of byType.values()) {
    let best = 0, bestN = -1;
    for (const [cr, n] of counts) if (n > bestN || (n === bestN && cr > best)) [best, bestN] = [cr, n];
    total += best;
  }
  return total;
}
