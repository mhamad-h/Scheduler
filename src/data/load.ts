import type { Section, TermData, TermInfo } from './types.ts';
import { courseKey } from './types.ts';

export interface Course {
  key: string; // "MTH 201"
  subj: string;
  num: string;
  title: string;
  sections: Section[];
  types: string[];
  campuses: string[];
  credits: number;
  /** "MTH201" — used for prefix search */
  norm: string;
  titleLower: string;
}

export interface TermIndex {
  data: TermData;
  courses: Course[];
  byKey: Map<string, Course>;
  byCrn: Map<string, Section>;
}

const base = import.meta.env.BASE_URL;

export async function loadTerms(): Promise<{ generatedAt: string; terms: TermInfo[] }> {
  const res = await fetch(`${base}data/terms.json`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Could not load term list (${res.status})`);
  return res.json();
}

const cache = new Map<string, Promise<TermIndex>>();

export function loadTerm(code: string, updatedAt?: string): Promise<TermIndex> {
  const k = `${code}@${updatedAt ?? ''}`;
  let p = cache.get(k);
  if (!p) {
    p = fetch(`${base}data/${code}.json${updatedAt ? `?v=${encodeURIComponent(updatedAt)}` : ''}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Could not load term ${code} (${r.status})`);
        return r.json() as Promise<TermData>;
      })
      .then(buildIndex);
    p.catch(() => cache.delete(k));
    cache.set(k, p);
  }
  return p;
}

const TYPE_ORDER = ['Lecture', 'Lab', 'Recitation', 'Tutorial', 'Studio', 'Seminar'];

export function buildIndex(data: TermData): TermIndex {
  const byKey = new Map<string, Course>();
  const byCrn = new Map<string, Section>();
  for (const s of data.sections) {
    byCrn.set(s.crn, s);
    const key = courseKey(s);
    let c = byKey.get(key);
    if (!c) {
      c = { key, subj: s.subj, num: s.num, title: s.title, sections: [], types: [], campuses: [], credits: 0, norm: (s.subj + s.num).toUpperCase(), titleLower: '' };
      byKey.set(key, c);
    }
    c.sections.push(s);
    if (!c.types.includes(s.type)) c.types.push(s.type);
    if (!c.campuses.includes(s.campus)) c.campuses.push(s.campus);
  }
  for (const c of byKey.values()) {
    // Prefer the lecture's title ("Mechanics" rather than "Mechanics Lab")
    const lec = c.sections.find((s) => s.type === 'Lecture') ?? c.sections[0];
    c.title = lec.title;
    c.titleLower = [...new Set(c.sections.map((s) => s.title.toLowerCase()))].join(' | ');
    c.types.sort((a, b) => (TYPE_ORDER.indexOf(a) + 99) % 99 - (TYPE_ORDER.indexOf(b) + 99) % 99 || a.localeCompare(b));
    // credits: sum of the max credits per component type
    c.credits = c.types.reduce((sum, t) => sum + Math.max(0, ...c!.sections.filter((s) => s.type === t).map((s) => s.cr)), 0);
  }
  const courses = [...byKey.values()].sort((a, b) => a.subj.localeCompare(b.subj) || a.num.localeCompare(b.num, undefined, { numeric: true }));
  return { data, courses, byKey, byCrn };
}
