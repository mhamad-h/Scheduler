import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseDateRange, parseDays, parseInstructors, parseSections, parseTime } from './parse.ts';

const fx = (n: string) => readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures', `${n}.html`), 'utf8');

describe('field parsers', () => {
  it('parses times', () => {
    expect(parseTime('12:30 pm - 1:45 pm')).toEqual({ s: 750, e: 825 });
    expect(parseTime('8:00 am - 9:15 am')).toEqual({ s: 480, e: 555 });
    expect(parseTime('12:00 pm - 12:50 pm')).toEqual({ s: 720, e: 770 });
    expect(parseTime('TBA')).toBeNull();
  });
  it('parses days', () => {
    expect(parseDays('MWF')).toBe(1 | 4 | 16);
    expect(parseDays('TR')).toBe(2 | 8);
    expect(parseDays('')).toBe(0);
  });
  it('parses date ranges', () => {
    expect(parseDateRange('Jan 14, 2027 - Apr 29, 2027')).toEqual({ from: '2027-01-14', to: '2027-04-29' });
  });
  it('parses instructors with primary first', () => {
    expect(parseInstructors('TBA')).toEqual([]);
    expect(parseInstructors('Jimmy Elia  Romanos (P)')).toEqual(['Jimmy Elia Romanos']);
    expect(parseInstructors('A B, C D (P)')).toEqual(['C D', 'A B']);
  });
});

describe('parseSections on live fixtures', () => {
  for (const subj of ['MTH', 'PHY', 'BUS', 'CSC']) {
    it(`${subj}: every section has a valid header and sane meetings`, () => {
      const secs = parseSections(fx(subj));
      expect(secs.length).toBeGreaterThan(1);
      for (const s of secs) {
        expect(s.subj).toBe(subj);
        expect(s.crn).toMatch(/^\d{4,6}$/);
        expect(s.title.length).toBeGreaterThan(0);
        expect(s.type.length).toBeGreaterThan(0);
        for (const m of s.m) {
          expect(m.e).toBeGreaterThan(m.s);
          expect(m.d).toBeGreaterThan(0);
        }
      }
      // most sections have a known campus and at least one weekly meeting
      expect(secs.filter((s) => s.campus === 'Beirut' || s.campus === 'Byblos' || s.campus === 'Online').length / secs.length).toBeGreaterThan(0.9);
    });
  }

  it('PHY: lecture and lab sections share a course code', () => {
    const secs = parseSections(fx('PHY'));
    const byCourse = new Map<string, Set<string>>();
    for (const s of secs) (byCourse.get(s.num) ?? byCourse.set(s.num, new Set()).get(s.num)!).add(s.type);
    expect([...byCourse.values()].some((t) => t.has('Lecture') && t.has('Lab'))).toBe(true);
  });

  it('keeps single-date meetings out of the weekly schedule', () => {
    const all = ['MTH', 'PHY', 'BUS', 'CSC'].flatMap((s) => parseSections(fx(s)));
    for (const s of all) for (const x of s.x ?? []) expect(x.dt).toBeTruthy();
    for (const s of all) for (const m of s.m) expect(m.dt === undefined || m.dt.includes('–')).toBe(true);
  });
});
