// Scrape the newest LAU terms from Banner into public/data/*.json.
// Usage: npm run scrape [-- --terms 202720,202710] [-- --count 3] [-- --save-fixtures]
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pLimit from 'p-limit';
import { BannerClient } from './banner.ts';
import { parseSeats, parseSections, parseSelect } from './parse.ts';
import type { Section, TermData, TermInfo } from '../src/data/types.ts';
import { courseKey } from '../src/data/types.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'data');
const args = process.argv.slice(2);
const argVal = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

/** Regular semesters only: "Fall 2026", "Spring 2027", "Summer 2026" (not Academic Year / Progreen / ACE). */
const isRegularTerm = (name: string) => /^(Fall|Spring|Summer)( I{1,2})? \d{4}$/.test(name);

/**
 * Read every section's seat numbers (one "Detailed Class Information" page each). If too many pages
 * fail, keep the previous run's numbers rather than publish a half-empty picture.
 * Returns when the numbers in `sections` were read.
 */
async function addSeats(client: BannerClient, term: string, sections: Section[], prev: TermData | undefined, limit: ReturnType<typeof pLimit>) {
  let failed = 0;
  await Promise.all(
    sections.map((s) =>
      limit(async () => {
        try {
          const r = parseSeats(await client.detail(term, s.crn));
          if (!r) throw new Error('no seating table');
          s.seats = r.seats;
          if (r.waitlist) s.wl = r.waitlist;
        } catch {
          failed++;
        }
      }),
    ),
  );
  if (failed <= sections.length * 0.1) return { seatsAt: new Date().toISOString(), failed };
  console.warn(`  ! ${term}: seats failed for ${failed}/${sections.length} sections — keeping previous seat numbers`);
  const old = new Map(prev?.sections.map((s) => [s.crn, s]) ?? []);
  for (const s of sections) {
    delete s.seats;
    delete s.wl;
    const o = old.get(s.crn);
    if (o?.seats) s.seats = o.seats;
    if (o?.wl) s.wl = o.wl;
  }
  return { seatsAt: prev?.seatsAt, failed };
}

async function main() {
  const client = new BannerClient();
  const landing = await client.landing();
  const allTerms = parseSelect(landing, 'p_term').map((o) => ({ code: o.value, name: o.text.replace(/\s*\(View only\)\s*/i, '').trim() }));
  const explicit = argVal('--terms')?.split(',');
  const count = Number(argVal('--count') ?? 3);
  // seat numbers only matter while people register: the newest N terms (0 = none)
  const seatTerms = args.includes('--no-seats') ? 0 : Number(argVal('--seat-terms') ?? 2);
  const terms = explicit
    ? allTerms.filter((t) => explicit.includes(t.code))
    : allTerms.filter((t) => isRegularTerm(t.name)).slice(0, count);
  if (!terms.length) throw new Error('No terms found on Banner landing page');

  await mkdir(outDir, { recursive: true });
  const infos: TermInfo[] = [];
  let fresh = 0; // terms refreshed successfully this run
  const limit = pLimit(4); // subject-by-subject listings (fallback only)
  const seatLimit = pLimit(6); // seat pages: small, fast requests
  const saveFixtures = args.includes('--save-fixtures');

  for (const term of terms) {
    const t0 = Date.now();
    const termPage = await client.selectTerm(term.code);
    const subjects = parseSelect(termPage, 'sel_subj');
    if (!subjects.length) throw new Error(`No subjects for ${term.name}`);
    const file = join(outDir, `${term.code}.json`);
    let prev: TermData | undefined;
    try {
      prev = JSON.parse(await readFile(file, 'utf8')) as TermData;
    } catch {
      /* new term */
    }

    // Fast path: every subject in one search request (one big page, ~3x faster than 80 small ones).
    // Trusted only if it looks complete; otherwise fall back to one subject at a time.
    let failed = 0;
    let mode = 'one request';
    let results: Section[][] | null = null;
    if (!saveFixtures) {
      try {
        const all = parseSections(await client.searchSubjects(term.code, subjects.map((s) => s.value), 180_000));
        const before = prev?.name === term.name ? prev.sections.length : 0;
        if (all.length > 0 && all.length >= before * 0.9) results = [all];
        else console.warn(`  ! ${term.code}: one-request search gave ${all.length} sections (last time ${before}) — going subject by subject`);
      } catch (err) {
        console.warn(`  ! ${term.code}: one-request search failed (${(err as Error).message}) — going subject by subject`);
      }
    }
    if (!results) mode = 'per subject';
    results ??= await Promise.all(
      subjects.map((s) =>
        limit(async () => {
          try {
            const html = await client.searchSubject(term.code, s.value);
            if (args.includes('--save-fixtures') && term === terms[0] && ['MTH', 'PHY', 'BUS', 'CSC'].includes(s.value)) {
              await mkdir(join(root, 'scraper', 'fixtures'), { recursive: true });
              await writeFile(join(root, 'scraper', 'fixtures', `${s.value}.html`), html);
            }
            return parseSections(html);
          } catch (err) {
            failed++;
            console.warn(`  ! ${term.code} ${s.value}: ${(err as Error).message}`);
            return [] as Section[];
          }
        }),
      ),
    );
    const byCrn = new Map<string, Section>();
    for (const list of results) for (const s of list) byCrn.set(s.crn, s);
    const sections = [...byCrn.values()].sort(
      (a, b) => a.subj.localeCompare(b.subj) || a.num.localeCompare(b.num, undefined, { numeric: true }) || a.sec.localeCompare(b.sec),
    );

    const listedIn = ((Date.now() - t0) / 1000).toFixed(1);
    // Don't overwrite good data with a partial scrape.
    if (failed > subjects.length * 0.1 || sections.length === 0) {
      console.warn(`  ! ${term.name}: ${failed}/${subjects.length} subjects failed — keeping previous data`);
      if (prev)
        infos.push({ code: term.code, name: term.name, updatedAt: prev.updatedAt, sections: prev.sections.length, courses: new Set(prev.sections.map(courseKey)).size, ...(prev.seatsAt ? { seatsAt: prev.seatsAt } : {}) });
      continue;
    }

    let seatsAt: string | undefined;
    let seatNote = '';
    if (terms.indexOf(term) < seatTerms) {
      const t1 = Date.now();
      const r = await addSeats(client, term.code, sections, prev, seatLimit);
      seatsAt = r.seatsAt;
      seatNote = `, seats in ${((Date.now() - t1) / 1000).toFixed(1)}s${r.failed ? ` (${r.failed} failed)` : ''}`;
    }

    // Only rewrite the term file when Banner's data (sections or seats) actually changed, so the repo
    // doesn't grow by a full copy of every term on each run. `updatedAt` = when the sections last
    // changed; terms.json always carries the latest seat-check time.
    let updatedAt = new Date().toISOString();
    let changed = true;
    if (prev && prev.name === term.name && JSON.stringify(prev.sections) === JSON.stringify(sections)) {
      updatedAt = prev.updatedAt;
      changed = false;
    }
    if (changed) await writeFile(file, JSON.stringify({ term: term.code, name: term.name, updatedAt, seatsAt, sections } satisfies TermData));
    fresh++;
    const courses = new Set(sections.map(courseKey)).size;
    infos.push({ code: term.code, name: term.name, updatedAt, sections: sections.length, courses, ...(seatsAt ? { seatsAt } : {}) });
    console.log(
      `✓ ${term.name} (${term.code}): ${sections.length} sections, ${courses} courses, ${subjects.length} subjects listed in ${listedIn}s (${mode})${seatNote} — ${changed ? 'CHANGED' : 'unchanged'}`,
    );
  }

  // Fail the run (so GitHub shows a red ✗ and emails the owner) if no term could be refreshed,
  // without touching terms.json — the site keeps showing the last good data and check time.
  if (fresh === 0) throw new Error(`Could not refresh any term from Banner (${terms.length} tried)`);

  // generatedAt = when Banner was last checked successfully
  await writeFile(join(outDir, 'terms.json'), JSON.stringify({ generatedAt: new Date().toISOString(), terms: infos }, null, 1));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
