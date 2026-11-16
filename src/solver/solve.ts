import type { Meeting, Section } from '../data/types.ts';
import { courseKey, DAY_NAMES, fmtTime } from '../data/types.ts';
import type { Candidate, Features, Filters, Group, Schedule, SolveInput, SolveResult, Weights } from './model.ts';
import { cost, CUSTOM_ID, PRESETS } from './rank.ts';
import { poolCourses } from './pool.ts';

const popcount = (n: number) => {
  n = n - ((n >> 1) & 0x55555555);
  n = (n & 0x33333333) + ((n >> 2) & 0x33333333);
  return (((n + (n >> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
};

export const meetingsOverlap = (a: Meeting, b: Meeting) => (a.d & b.d) !== 0 && a.s < b.e && b.s < a.e;

export function sectionsConflict(a: Section, b: Section): boolean {
  for (const x of a.m) for (const y of b.m) if (meetingsOverlap(x, y)) return true;
  return false;
}

type Reason = 'excluded' | 'locked' | 'campus' | 'professor' | 'time' | 'days' | 'blocked' | 'unscheduled';

function rejectReason(s: Section, f: Filters): Reason | null {
  if (f.campuses.length && !f.campuses.includes(s.campus)) return 'campus';
  if (s.ins.some((n) => f.profs[n] === 'avoid')) return 'professor';
  if (!s.m.length && f.hideUnscheduled) return 'unscheduled';
  for (const m of s.m) {
    if (m.d & f.daysOff) return 'days';
    if (f.earliest !== null && m.s < f.earliest) return 'time';
    if (f.latest !== null && m.e > f.latest) return 'time';
    for (const b of f.blocked) if (m.d & (1 << b.day) && m.s < b.e && b.s < m.e) return 'blocked';
  }
  return null;
}

const REASON_TEXT: Record<Reason, string> = {
  excluded: 'you excluded them',
  locked: 'another CRN is locked',
  campus: 'campus filter',
  professor: 'avoided professors',
  time: 'earliest/latest time limits',
  days: 'days off',
  blocked: 'blocked times',
  unscheduled: 'they have no fixed time',
};

/** Max-heap of the K lowest-cost entries. */
class TopK {
  private h: { c: number; s: Schedule }[] = [];
  constructor(private k: number) {}
  worst() {
    return this.h.length < this.k ? Infinity : this.h[0].c;
  }
  push(c: number, s: Schedule) {
    const h = this.h;
    if (h.length < this.k) {
      h.push({ c, s });
      let i = h.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (h[p].c >= h[i].c) break;
        [h[p], h[i]] = [h[i], h[p]];
        i = p;
      }
    } else if (c < h[0].c) {
      h[0] = { c, s };
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < h.length && h[l].c > h[m].c) m = l;
        if (r < h.length && h[r].c > h[m].c) m = r;
        if (m === i) break;
        [h[m], h[i]] = [h[i], h[m]];
        i = m;
      }
    }
  }
  sorted() {
    return [...this.h].sort((a, b) => a.c - b.c);
  }
}

const LUNCH_FROM = 11 * 60 + 30;
const LUNCH_TO = 14 * 60 + 30;

/** Features of one schedule given its weekly meetings bucketed per day. */
export function computeFeatures(perDay: [number, number][][], extra: { courses: number; missing: number; credits: number; preferred: number; unscheduled: number }): Features {
  let days = 0, gaps = 0, earliness = 0, lateness = 0, noLunch = 0, b2b = 0, onCampus = 0, longestDay = 0;
  let start = 24 * 60, end = 0;
  const starts: number[] = [];
  const ends: number[] = [];
  for (const iv of perDay) {
    if (!iv.length) continue;
    days++;
    iv.sort((a, b) => a[0] - b[0]);
    // merge overlapping (shouldn't happen, but one-off partial-term meetings may)
    const first = iv[0][0];
    let curEnd = iv[0][1];
    // a day "has lunch" if some ≥30 min stretch inside 11:30–14:30 is free
    let lunch = false;
    let cursor = LUNCH_FROM;
    const lunchStep = (s: number, e: number) => {
      if (Math.min(s, LUNCH_TO) - cursor >= 30) lunch = true;
      cursor = Math.max(cursor, e);
    };
    lunchStep(iv[0][0], iv[0][1]);
    for (let i = 1; i < iv.length; i++) {
      const gap = iv[i][0] - curEnd;
      if (gap >= 0 && gap < 15) b2b++;
      else if (gap > 0) gaps += gap;
      lunchStep(iv[i][0], iv[i][1]);
      curEnd = Math.max(curEnd, iv[i][1]);
    }
    const last = curEnd;
    if (LUNCH_TO - cursor >= 30) lunch = true;
    if (!lunch) noLunch++;
    earliness += Math.max(0, 600 - first);
    lateness += Math.max(0, last - 960);
    onCampus += last - first;
    longestDay = Math.max(longestDay, last - first);
    start = Math.min(start, first);
    end = Math.max(end, last);
    starts.push(first);
    ends.push(last);
  }
  const dev = (xs: number[]) => {
    if (xs.length < 2) return 0;
    const avg = xs.reduce((a, b) => a + b, 0) / xs.length;
    return xs.reduce((a, b) => a + Math.abs(b - avg), 0) / xs.length;
  };
  if (!days) start = end = 0;
  return {
    ...extra,
    days,
    gaps,
    spread: Math.round(dev(starts) + dev(ends)),
    earliness,
    lateness,
    noLunch,
    b2b,
    onCampus,
    longestDay,
    start,
    end,
  };
}

export function solve(input: SolveInput): SolveResult {
  const t0 = performance.now();
  const { sections, courses, filters } = input;
  const maxNodes = input.maxNodes ?? 2_000_000;
  const K = input.keepPerPreset ?? 300;

  // ---- build groups (course × schedule type) and filtered, collapsed candidates
  const groups: Group[] = [];
  const candidates: Candidate[] = [];
  const filtered: SolveResult['filtered'] = [];
  const reasons: Map<Reason, number>[] = [];

  for (const cc of courses) {
    const idx = sections.map((s, i) => [s, i] as const).filter(([s]) => courseKey(s) === cc.key);
    const types = [...new Set(idx.map(([s]) => s.type))].filter((t) => !cc.skipTypes.includes(t));
    for (const type of types) {
      const g = groups.length;
      const inType = idx.filter(([s]) => s.type === type);
      const locked = inType.filter(([s]) => cc.lockedCrns.includes(s.crn));
      const why = new Map<Reason, number>();
      const bump = (r: Reason) => why.set(r, (why.get(r) ?? 0) + 1);
      const keep: number[] = [];
      for (const [s, i] of inType) {
        if (cc.excludedCrns.includes(s.crn)) { bump('excluded'); continue; }
        if (locked.length && !cc.lockedCrns.includes(s.crn)) { bump('locked'); continue; }
        // locked sections bypass soft filters except hard ones the user explicitly set on the CRN
        const r = locked.length ? null : rejectReason(s, filters);
        if (r) { bump(r); continue; }
        keep.push(i);
      }
      // collapse equivalent sections
      const byKey = new Map<string, number[]>();
      for (const i of keep) {
        const s = sections[i];
        const sig = s.campus + '|' + s.ins.join(',') + '|' + s.m.map((m) => `${m.d}.${m.s}.${m.e}.${m.dt ?? ''}`).sort().join(';');
        (byKey.get(sig) ?? byKey.set(sig, []).get(sig)!).push(i);
      }
      const cands: number[] = [];
      for (const list of byKey.values()) {
        const id = candidates.length;
        candidates.push({ id, group: g, sections: list, crns: list.map((i) => sections[i].crn) });
        cands.push(id);
      }
      const first = inType[0]?.[0];
      groups.push({ course: cc.key, type, title: first?.title ?? cc.key, optional: cc.optional, candidates: cands });
      filtered.push({ group: g, before: inType.length, after: keep.length });
      reasons.push(why);
    }
  }

  // ---- elective pools: N slots, each able to take any eligible course; distinct topics enforced in the search
  for (const pool of input.pools ?? []) {
    if (pool.count < 1) continue;
    const eligible = poolCourses(sections, pool, courses.map((c) => c.key)).filter((c) => !pool.excluded.includes(c.key));
    const bases = [...new Set(eligible.map((c) => c.base))];
    const why = new Map<Reason, number>();
    const bump = (r: Reason) => why.set(r, (why.get(r) ?? 0) + 1);
    const keep: { i: number; ord: number }[] = [];
    let before = 0;
    for (const c of eligible)
      for (const i of c.sections) {
        before++;
        const r = rejectReason(sections[i], filters);
        if (r) bump(r);
        else keep.push({ i, ord: bases.indexOf(c.base) });
      }
    // Pool candidates are *time slots*: every eligible section with the same campus and meeting times
    // (and instructor, when professor preferences matter) shares one candidate, whatever its topic.
    // Distinct topics are assigned per schedule at the leaf (a tiny matching problem).
    const prefersAnyProf = Object.values(filters.profs).includes('prefer');
    const byKey = new Map<string, { list: number[]; topics: number[] }>();
    for (const { i, ord } of keep) {
      const s = sections[i];
      const sig = s.campus + '|' + (prefersAnyProf ? s.ins.join(',') : '') + '|' + s.m.map((m) => `${m.d}.${m.s}.${m.e}.${m.dt ?? ''}`).sort().join(';');
      const e = byKey.get(sig);
      if (e) {
        e.list.push(i);
        e.topics.push(ord);
      } else byKey.set(sig, { list: [i], topics: [ord] });
    }
    const usableTopics = new Set(keep.map((k) => k.ord)).size;
    for (let slot = 0; slot < pool.count; slot++) {
      const g = groups.length;
      const cands: number[] = [];
      let ord = 0;
      for (const { list, topics } of byKey.values()) {
        const id = candidates.length;
        candidates.push({ id, group: g, sections: list, crns: list.map((i) => sections[i].crn), ord: ord++, topics });
        cands.push(id);
      }
      groups.push({
        course: `pool:${pool.id}:${slot}`,
        type: 'Elective',
        title: `${pool.subj} elective ${slot + 1} of ${pool.count}`,
        optional: false,
        candidates: cands,
        pool: { id: pool.id, subj: pool.subj, slot, count: pool.count },
      });
      filtered.push({ group: g, before, after: keep.length });
      reasons.push(why);
    }
    if (usableTopics < pool.count) {
      const why2 = [...why.entries()].sort((a, b) => b[1] - a[1]).map(([r, n]) => `${n} sections removed by ${REASON_TEXT[r]}`);
      const honors = pool.honors === 'honors' ? 'honors ' : pool.honors === 'regular' ? 'regular ' : '';
      return {
        groups, candidates, schedules: [], rankings: {}, total: 0, nodes: 0, truncated: false, ms: performance.now() - t0, filtered,
        diagnosis: {
          kind: 'empty-group',
          message: `You asked for ${pool.count} ${pool.subj} courses, but only ${usableTopics} ${honors}${pool.subj} topic${usableTopics === 1 ? '' : 's'} pass your filters${why2.length ? ` (${why2.join(', ')})` : ''}.`,
        },
      };
    }
  }

  const empty = (diag?: SolveResult['diagnosis']): SolveResult => ({
    groups, candidates, schedules: [], rankings: {}, total: 0, nodes: 0, truncated: false, ms: performance.now() - t0, diagnosis: diag, filtered,
  });

  if (!groups.length) return empty({ kind: 'nothing', message: 'Add some courses to start.' });

  for (let g = 0; g < groups.length; g++) {
    if (!groups[g].candidates.length && !groups[g].optional) {
      const why = [...reasons[g].entries()].sort((a, b) => b[1] - a[1]).map(([r, n]) => `${n} by ${REASON_TEXT[r]}`);
      const gr = groups[g];
      const what = filtered[g].before
        ? `All ${filtered[g].before} ${gr.type.toLowerCase()} section(s) of ${gr.course} are filtered out (${why.join(', ')}).`
        : `${gr.course} has no ${gr.type.toLowerCase()} sections this term.`;
      return empty({ kind: 'empty-group', message: what });
    }
  }

  // ---- candidate data
  const N = candidates.length;
  const W = Math.max(1, Math.ceil(N / 32));
  const rep = candidates.map((c) => sections[c.sections[0]]);
  const candDays = rep.map((s) => s.m.reduce((a, m) => a | m.d, 0));
  const physical = (s: Section) => s.campus !== 'Online' && s.campus !== 'Other';
  const compat: Uint32Array[] = [];
  for (let i = 0; i < N; i++) {
    const row = new Uint32Array(W);
    for (let j = 0; j < N; j++) {
      if (candidates[i].group === candidates[j].group) continue;
      if (!filters.mixCampuses && physical(rep[i]) && physical(rep[j]) && rep[i].campus !== rep[j].campus) continue;
      if (!sectionsConflict(rep[i], rep[j])) row[j >> 5] |= 1 << (j & 31);
    }
    compat.push(row);
  }
  const groupMask = groups.map((g) => {
    const m = new Uint32Array(W);
    for (const c of g.candidates) m[c >> 5] |= 1 << (c & 31);
    return m;
  });
  const prefersAny = Object.values(filters.profs).includes('prefer');
  const candPreferred = rep.map((s) => (prefersAny && s.ins.some((n) => filters.profs[n] === 'prefer') ? 1 : 0));
  const candPerDay = rep.map((s) => {
    const out: [number, number, number][] = [];
    for (const m of s.m) for (let d = 0; d < 7; d++) if (m.d & (1 << d)) out.push([d, m.s, m.e]);
    return out;
  });

  // pair diagnosis: two required groups whose candidates all conflict
  const required = groups.map((g, i) => (g.optional ? -1 : i)).filter((i) => i >= 0);
  for (let a = 0; a < required.length; a++)
    for (let b = a + 1; b < required.length; b++) {
      const ga = groups[required[a]], gb = groups[required[b]];
      if (ga.course === gb.course && ga.type === gb.type) continue;
      if (ga.pool && gb.pool && ga.pool.id === gb.pool.id) continue;
      let ok = false;
      for (const i of ga.candidates) {
        for (let w = 0; w < W && !ok; w++) if (compat[i][w] & groupMask[required[b]][w]) ok = true;
        if (ok) break;
      }
      if (!ok) {
        const name = (g: Group) =>
          g.pool ? `any ${g.pool.subj} course` : `${g.course}${groups.filter((x) => x.course === g.course).length > 1 ? ' ' + g.type : ''}`;
        return empty({ kind: 'pair-conflict', message: `Every available section of ${name(ga)} clashes with every available section of ${name(gb)}.` });
      }
    }

  // ---- search order: fewest candidates first; optional courses last
  const courseOf = groups.map((g) => g.course);
  const courseIds = [...new Set(courseOf)];
  const courseIdx = groups.map((g) => courseIds.indexOf(g.course));
  const order = groups
    .map((_, i) => i)
    .sort((a, b) => Number(groups[a].optional) - Number(groups[b].optional) || groups[a].candidates.length - groups[b].candidates.length || a - b);
  const G = order.length;
  // pool slot k must pick a later topic than slot k-1 (distinct topics, no duplicate permutations);
  // slots of one pool have equal candidate counts, so the stable sort keeps them in slot order
  const prevSlot = groups.map((g) => (g.pool && g.pool.slot > 0 ? groups.findIndex((x) => x.pool?.id === g.pool!.id && x.pool.slot === g.pool!.slot - 1) : -1));
  const candOrd = candidates.map((c) => c.ord ?? -1);
  const courseState = new Int8Array(courseIds.length); // 0 undecided, 1 in, 2 out

  const presetWeights: [string, Weights][] = [...PRESETS.map((p) => [p.id, p.weights] as [string, Weights]), [CUSTOM_ID, input.customWeights]];
  const heaps = presetWeights.map(() => new TopK(K));

  const picks = new Int32Array(G).fill(-1); // indexed by group id
  const allowed: Uint32Array[] = Array.from({ length: G + 1 }, () => new Uint32Array(W));
  allowed[0].fill(0xffffffff);
  const perDay: [number, number][][] = Array.from({ length: 7 }, () => []);
  let nodes = 0;
  let total = 0;
  let truncated = false;

  // pool slots grouped per pool, in slot order
  const poolSlots = [...new Set(groups.filter((g) => g.pool).map((g) => g.pool!.id))].map((id) =>
    groups.map((g, i) => (g.pool?.id === id ? i : -1)).filter((i) => i >= 0),
  );
  const used = new Set<number>();
  const assignTopics = (slots: number[], k: number, out: string[]): boolean => {
    if (k === slots.length) return true;
    const c = candidates[picks[slots[k]]];
    for (let t = 0; t < c.sections.length; t++) {
      const topic = c.topics![t];
      if (used.has(topic)) continue;
      used.add(topic);
      out[k] = c.crns[t];
      const ok = assignTopics(slots, k + 1, out);
      used.delete(topic);
      if (ok) return true;
    }
    return false;
  };

  const leaf = (dayMask: number) => {
    let poolPick: Record<number, string> | undefined;
    for (const slots of poolSlots) {
      const out: string[] = [];
      used.clear();
      if (!assignTopics(slots, 0, out)) return; // time slots chosen, but not enough distinct topics among them
      poolPick ??= {};
      slots.forEach((g, k) => (poolPick![g] = out[k]));
    }
    total++;
    for (const d of perDay) d.length = 0;
    let credits = 0, preferred = 0, unscheduled = 0;
    const included = new Set<number>();
    for (let g = 0; g < groups.length; g++) {
      const c = picks[g];
      if (c < 0) continue;
      included.add(courseIdx[g]);
      const s = rep[c];
      credits += s.cr;
      preferred += candPreferred[c];
      if (!s.m.length) unscheduled++;
      for (const [d, a, b] of candPerDay[c]) perDay[d].push([a, b]);
    }
    let missing = 0;
    for (let ci = 0; ci < courseIds.length; ci++) if (courseState[ci] === 2) missing++;
    const f = computeFeatures(perDay, { courses: included.size, missing, credits, preferred, unscheduled });
    let sched: Schedule | null = null;
    for (let h = 0; h < heaps.length; h++) {
      const c = cost(f, presetWeights[h][1]);
      if (c < heaps[h].worst()) {
        sched ??= { picks: Array.from(picks), f, dayMask, poolPick };
        heaps[h].push(c, sched);
      }
    }
  };

  const maxDays = filters.maxDays || 7;

  const rec = (depth: number, dayMask: number) => {
    if (++nodes > maxNodes) {
      truncated = true;
      return;
    }
    if (depth === G) {
      leaf(dayMask);
      return;
    }
    const cur = allowed[depth];
    // forward check: every remaining group that must be filled still has an option
    for (let k = depth; k < G; k++) {
      const g = order[k];
      const ci = courseIdx[g];
      if (groups[g].optional && courseState[ci] !== 1) continue;
      const gm = groupMask[g];
      let ok = false;
      for (let w = 0; w < W; w++) if (cur[w] & gm[w]) { ok = true; break; }
      if (!ok) return;
    }
    const g = order[depth];
    const ci = courseIdx[g];
    const next = allowed[depth + 1];
    const optional = groups[g].optional;
    if (!(optional && courseState[ci] === 2)) {
      const prevState = courseState[ci];
      if (optional) courseState[ci] = 1;
      const minOrd = prevSlot[g] >= 0 ? candOrd[picks[prevSlot[g]]] : -1;
      for (const c of groups[g].candidates) {
        if (!(cur[c >> 5] & (1 << (c & 31)))) continue;
        if (minOrd >= 0 && candOrd[c] <= minOrd) continue;
        const dm = dayMask | candDays[c];
        if (popcount(dm) > maxDays) continue;
        const row = compat[c];
        for (let w = 0; w < W; w++) next[w] = cur[w] & row[w];
        picks[g] = c;
        rec(depth + 1, dm);
        if (truncated) break;
      }
      picks[g] = -1;
      courseState[ci] = prevState;
      if (truncated) return;
    }
    // skip branch for optional courses (decided once per course)
    if (optional && courseState[ci] !== 1) {
      const prevState = courseState[ci];
      courseState[ci] = 2;
      next.set(cur);
      rec(depth + 1, dayMask);
      courseState[ci] = prevState;
    }
  };
  rec(0, 0);

  // ---- collect unique schedules and rankings
  const schedules: Schedule[] = [];
  const index = new Map<Schedule, number>();
  const rankings: Record<string, number[]> = {};
  heaps.forEach((h, i) => {
    rankings[presetWeights[i][0]] = h.sorted().map(({ s }) => {
      let k = index.get(s);
      if (k === undefined) {
        k = schedules.push(s) - 1;
        index.set(s, k);
      }
      return k;
    });
  });

  let diagnosis: SolveResult['diagnosis'];
  if (!total) {
    const limits: string[] = [];
    if (filters.maxDays) limits.push(`max ${filters.maxDays} days`);
    if (filters.daysOff) limits.push(`days off (${DAY_NAMES.filter((_, i) => filters.daysOff & (1 << i)).join(', ')})`);
    if (filters.earliest !== null || filters.latest !== null)
      limits.push(`time window ${filters.earliest !== null ? fmtTime(filters.earliest) : ''}–${filters.latest !== null ? fmtTime(filters.latest) : ''}`);
    diagnosis = {
      kind: 'no-fit',
      message: `These courses can't all fit together without clashes${limits.length ? ` under ${limits.join(', ')}` : ''}. Try marking a course optional or relaxing filters.`,
    };
  }

  return { groups, candidates, schedules, rankings, total, nodes, truncated, ms: performance.now() - t0, diagnosis, filtered };
}
