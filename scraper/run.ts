// Scrape the newest LAU terms from Banner into public/data/*.json.
// Usage: npm run scrape [-- --terms 202720,202710] [-- --count 3] [-- --save-fixtures]
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pLimit from 'p-limit';
import { BannerClient } from './banner.ts';
import { parseSections, parseSelect } from './parse.ts';
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

async function main() {
  const client = new BannerClient();
  const landing = await client.landing();
  const allTerms = parseSelect(landing, 'p_term').map((o) => ({ code: o.value, name: o.text.replace(/\s*\(View only\)\s*/i, '').trim() }));
  const explicit = argVal('--terms')?.split(',');
  const count = Number(argVal('--count') ?? 3);
  const terms = explicit
    ? allTerms.filter((t) => explicit.includes(t.code))
    : allTerms.filter((t) => isRegularTerm(t.name)).slice(0, count);
  if (!terms.length) throw new Error('No terms found on Banner landing page');

  await mkdir(outDir, { recursive: true });
  const infos: TermInfo[] = [];
  const limit = pLimit(4);

  for (const term of terms) {
    const t0 = Date.now();
    const termPage = await client.selectTerm(term.code);
    const subjects = parseSelect(termPage, 'sel_subj');
    if (!subjects.length) throw new Error(`No subjects for ${term.name}`);
    let failed = 0;
    const results = await Promise.all(
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

    const file = join(outDir, `${term.code}.json`);
    // Don't overwrite good data with a partial scrape.
    if (failed > subjects.length * 0.1 || sections.length === 0) {
      console.warn(`  ! ${term.name}: ${failed}/${subjects.length} subjects failed — keeping previous data`);
      try {
        const prev = JSON.parse(await readFile(file, 'utf8')) as TermData;
        infos.push({ code: term.code, name: term.name, updatedAt: prev.updatedAt, sections: prev.sections.length, courses: new Set(prev.sections.map(courseKey)).size });
      } catch {
        /* no previous data */
      }
      continue;
    }

    const updatedAt = new Date().toISOString();
    const data: TermData = { term: term.code, name: term.name, updatedAt, sections };
    await writeFile(file, JSON.stringify(data));
    const courses = new Set(sections.map(courseKey)).size;
    infos.push({ code: term.code, name: term.name, updatedAt, sections: sections.length, courses });
    console.log(`✓ ${term.name} (${term.code}): ${sections.length} sections, ${courses} courses, ${subjects.length} subjects in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }

  await writeFile(join(outDir, 'terms.json'), JSON.stringify({ generatedAt: new Date().toISOString(), terms: infos }, null, 1));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
