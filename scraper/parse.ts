import * as cheerio from 'cheerio';
import type { Meeting, Section } from '../src/data/types.ts';
import { DAY_BITS } from '../src/data/types.ts';

export interface Option {
  value: string;
  text: string;
}

const clean = (s: string) => s.replace(/ /g, ' ').replace(/\s+/g, ' ').trim();

/** Options of a <select name=...> (first match), excluding blanks, "dummy" and "%". */
export function parseSelect(html: string, name: string): Option[] {
  const $ = cheerio.load(html);
  const sel = $(`select[name="${name}"]`).first();
  return sel
    .find('option')
    .toArray()
    .map((o) => ({ value: ($(o).attr('value') ?? '').trim(), text: clean($(o).text()) }))
    .filter((o) => o.value && o.value !== 'dummy' && o.value !== '%');
}

export function parseTime(text: string): { s: number; e: number } | null {
  const m = text.match(/(\d{1,2}):(\d{2})\s*([ap]m)\s*-\s*(\d{1,2}):(\d{2})\s*([ap]m)/i);
  if (!m) return null;
  const to = (h: string, mi: string, ap: string) => {
    let hh = parseInt(h, 10) % 12;
    if (ap.toLowerCase() === 'pm') hh += 12;
    return hh * 60 + parseInt(mi, 10);
  };
  const s = to(m[1], m[2], m[3]);
  // Banner encodes "until x:59" for blocks that really end on the hour (e.g. 5:00 - 5:59) — keep as given.
  const e = to(m[4], m[5], m[6]);
  return e > s ? { s, e } : null;
}

export function parseDays(text: string): number {
  let d = 0;
  for (const ch of text.toUpperCase()) d |= (DAY_BITS as Record<string, number>)[ch] ?? 0;
  return d;
}

/** Parse "Jan 14, 2027 - Apr 29, 2027" into ISO dates. */
export function parseDateRange(text: string): { from: string; to: string } | null {
  const parts = text.split(/\s+-\s+/);
  if (parts.length !== 2) return null;
  const a = new Date(parts[0] + ' UTC');
  const b = new Date(parts[1] + ' UTC');
  if (isNaN(+a) || isNaN(+b)) return null;
  return { from: a.toISOString().slice(0, 10), to: b.toISOString().slice(0, 10) };
}

const shortDate = (iso: string) =>
  new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: '2-digit', timeZone: 'UTC' });

export function parseInstructors(text: string): string[] {
  const t = clean(text);
  if (!t || /^TBA$/i.test(t)) return [];
  // "Jane Doe (P), John Roe" — Banner marks the primary with (P)
  const names = t
    .split(/,\s*/)
    .map((n) => ({ primary: /\(P\)/.test(n), name: clean(n.replace(/\(P\)/g, '').replace(/\bE-mail\b/gi, '')) }))
    .filter((n) => n.name && !/^TBA$/i.test(n.name));
  names.sort((a, b) => Number(b.primary) - Number(a.primary));
  return [...new Set(names.map((n) => n.name))];
}

interface RawMeeting {
  time: string;
  days: string;
  where: string;
  dates: string;
  type: string;
  instructors: string;
}

/**
 * Parse a bwckschd.p_get_crse_unsec result page into sections.
 * Structure: <th class="ddtitle">Title - CRN - SUBJ NUM - SEC</th> followed by a row whose cell holds
 * labelled text ("Beirut Campus", "Lecture Schedule Type", "3.000 Credits") and a meeting-times table.
 */
export function parseSections(html: string): Section[] {
  const $ = cheerio.load(html);
  $('br').replaceWith('\n');
  const out: Section[] = [];

  $('th.ddtitle').each((_, th) => {
    const head = clean($(th).text());
    // title may itself contain " - ", so anchor on the trailing three fields
    const hm = head.match(/^(.*) - (\d{4,6}) - ([A-Z]{2,5}) (\S+) - (\S+)$/);
    if (!hm) return;
    const [, title, crn, subj, num, sec] = hm;

    const body = $(th).closest('tr').next('tr').find('td').first();
    const table = body.find('table.datadisplaytable').first();
    const tableText = table.text();
    const lines = body
      .text()
      .replace(tableText, '')
      .split('\n')
      .map(clean)
      .filter(Boolean);

    const campusLine = lines.find((l) => /Campus$/i.test(l));
    let campus = campusLine ? campusLine.replace(/\s*Campus$/i, '') : '';
    if (/online/i.test(campus)) campus = 'Online';
    const typeLine = lines.find((l) => /Schedule Type$/i.test(l));
    const credLine = lines.find((l) => /Credits$/i.test(l));
    const lvlLine = lines.find((l) => /^Levels:/i.test(l));

    const raws: RawMeeting[] = [];
    table.find('tr').each((i, tr) => {
      if (i === 0) return;
      const c = $(tr)
        .find('td')
        .toArray()
        .map((td) => clean($(td).text()));
      if (c.length < 7) return;
      raws.push({ time: c[1], days: c[2], where: c[3], dates: c[4], type: c[5], instructors: c[6] });
    });

    let type = typeLine ? clean(typeLine.replace(/Schedule Type$/i, '')) : '';
    if (!type) type = raws[0]?.type || 'Lecture';

    const m: Meeting[] = [];
    const x: Meeting[] = [];
    // The regular (longest) date range of this section, used to tell partial-term meetings apart.
    const ranges = raws.map((r) => parseDateRange(r.dates)).filter(Boolean) as { from: string; to: string }[];
    const span = (r: { from: string; to: string }) => +new Date(r.to) - +new Date(r.from);
    const longest = ranges.reduce<{ from: string; to: string } | null>((a, r) => (!a || span(r) > span(a) ? r : a), null);

    const insSet: string[] = [];
    for (const r of raws) {
      for (const n of parseInstructors(r.instructors)) if (!insSet.includes(n)) insSet.push(n);
      const t = parseTime(r.time);
      const d = parseDays(r.days);
      if (!t || !d) continue;
      const mt: Meeting = { d, s: t.s, e: t.e };
      if (r.where && !/^TBA$/i.test(r.where)) mt.r = r.where;
      const dr = parseDateRange(r.dates);
      if (dr && dr.from === dr.to) {
        mt.dt = shortDate(dr.from);
        x.push(mt);
        continue;
      }
      if (dr && longest && (dr.from !== longest.from || dr.to !== longest.to)) {
        mt.dt = `${shortDate(dr.from)} – ${shortDate(dr.to)}`;
      }
      // merge identical time blocks on different day rows (e.g. M 9-10 and W 9-10 listed separately)
      const same = m.find((o) => o.s === mt.s && o.e === mt.e && o.r === mt.r && o.dt === mt.dt);
      if (same) same.d |= mt.d;
      else m.push(mt);
    }

    const cr = credLine ? parseFloat(credLine) : NaN;
    const s: Section = {
      crn,
      subj,
      num,
      sec,
      title: clean(title),
      type,
      campus: campus || 'Other',
      cr: isNaN(cr) ? 0 : cr,
      ins: insSet,
      m,
    };
    if (x.length) s.x = x;
    if (lvlLine) s.lvl = clean(lvlLine.replace(/^Levels:/i, ''));
    out.push(s);
  });

  return out;
}
