import type { Course } from './load.ts';

/**
 * Autocomplete: "mth2" / "MTH 2" / "Mth20" → code-prefix matches (MTH 201, 206, 207…),
 * "calc" → title matches, "CSC" → every CSC course.
 */
export function searchCourses(courses: Course[], query: string, limit = 12): Course[] {
  const raw = query.trim();
  if (!raw) return [];
  const q = raw.toUpperCase().replace(/\s+/g, '');
  const codeHits: Course[] = [];
  const titleHits: Course[] = [];
  const words = raw.toLowerCase().split(/\s+/).filter(Boolean);
  const looksLikeCode = /^[A-Z]{2,5}\d*[A-Z]?$/.test(q);

  for (const c of courses) {
    if (looksLikeCode && c.norm.startsWith(q)) codeHits.push(c);
    else if (raw.length >= 3 && words.every((w) => c.titleLower.includes(w) || c.key.toLowerCase().includes(w))) titleHits.push(c);
  }
  // exact subject typed ("CSC") – keep numeric order; otherwise shorter codes first
  return [...codeHits, ...titleHits].slice(0, limit);
}
