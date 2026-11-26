import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TouchEvent as RTouchEvent } from 'react';
import type { TermIndex } from './data/load.ts';
import { loadTerm, loadTerms } from './data/load.ts';
import type { Section, TermInfo } from './data/types.ts';
import { courseKey, fmtDays } from './data/types.ts';
import { courseHues, hueFor } from './lib/colors.ts';
import type { ScheduleView } from './lib/view.ts';
import { alternatesFor, featuresFor, viewFromCrns, viewFromResult } from './lib/view.ts';
import { timeAgo } from './lib/time.ts';
import type { SolveInput } from './solver/model.ts';
import { CUSTOM_ID, customWeights, PRESETS } from './solver/rank.ts';
import { useSolver } from './solver/useSolver.ts';
import { baseNum, poolCourses } from './solver/pool.ts';
import type { PoolConfig } from './solver/model.ts';
import { useStore, useTermState } from './state/store.ts';
import type { Theme } from './state/store.ts';
import { Calendar, MiniWeek } from './components/Calendar.tsx';
import { CourseCard } from './components/CourseCard.tsx';
import { CourseSearch } from './components/CourseSearch.tsx';
import { AddPoolButton, PoolCard } from './components/PoolCard.tsx';
import { CampusPicker } from './components/CampusPicker.tsx';
import { FiltersPanel } from './components/FiltersPanel.tsx';
import { dayMaskOf, MetricChips } from './components/Metrics.tsx';
import { DayPatterns } from './components/DayPatterns.tsx';
import { PresetBar } from './components/PresetBar.tsx';
import { CopyCrnsButton, CrnTable, DatedSessions, SwapPanel } from './components/ScheduleDetails.tsx';
import { SlotsPanel } from './components/SlotsPanel.tsx';
import { Button, Card, copyText, cx, Icon, IconButton, Kbd, toast, Toasts } from './components/ui.tsx';

type Mode = { kind: 'results' } | { kind: 'slot'; id: string } | { kind: 'shared'; crns: string[] };
type MobileTab = 'courses' | 'filters' | 'schedules';
const NO_POOLS: PoolConfig[] = [];

function parseShare(): { term: string; crns: string[] } | null {
  const m = location.hash.match(/^#s=(\d{6}):([\d.]+)$/);
  return m ? { term: m[1], crns: m[2].split('.').filter(Boolean) } : null;
}

export function App() {
  const theme = useStore((s) => s.theme);
  const term = useStore((s) => s.term);
  const filters = useStore((s) => s.filters);
  const preset = useStore((s) => s.preset);
  const custom = useStore((s) => s.custom);
  const { courses: courseConfigs, slots, pools = NO_POOLS } = useTermState();
  const { setTerm, addCourse, addPool, clearCourses, saveSlot, setSlotCrns } = useStore.getState();
  const hasWork = courseConfigs.length > 0 || pools.length > 0;

  const [terms, setTerms] = useState<TermInfo[] | null>(null);
  // when the scraper last checked Banner (data files only change when Banner's data does)
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const dismissedTerm = useStore((s) => s.dismissedTerm);
  const [index, setIndex] = useState<TermIndex | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>({ kind: 'results' });
  const [pos, setPos] = useState(0);
  const [edited, setEdited] = useState<ScheduleView | null>(null);
  const [selected, setSelected] = useState<Section | null>(null);
  const [slotsOpen, setSlotsOpen] = useState(false);
  const [showCount, setShowCount] = useState(30);
  const [filtersOpen, setFiltersOpen] = useState(true);
  // phone layout: one panel at a time, switched from the bottom tab bar
  const [mobileTab, setMobileTab] = useState<MobileTab>(() => {
    const s = useStore.getState();
    const t = s.term ? s.terms[s.term] : undefined;
    return (t?.courses.length ?? 0) + (t?.pools?.length ?? 0) > 0 ? 'schedules' : 'courses';
  });
  const showTab = (t: MobileTab) => {
    setMobileTab(t);
    window.scrollTo({ top: 0 });
  };

  // ---- theme
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => document.documentElement.classList.toggle('dark', theme === 'dark' || (theme === 'system' && mq.matches));
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);

  // ---- data
  useEffect(() => {
    loadTerms()
      .then(({ terms, generatedAt }) => {
        setTerms(terms);
        setCheckedAt(generatedAt ?? null);
        const share = parseShare();
        const cur = useStore.getState().term;
        if (share && terms.some((t) => t.code === share.term)) {
          setTerm(share.term);
          setMode({ kind: 'shared', crns: share.crns });
          setMobileTab('schedules');
        } else if (!cur || !terms.some((t) => t.code === cur)) setTerm(terms[0]?.code);
      })
      .catch((e) => setLoadError(String(e.message ?? e)));
  }, [setTerm]);

  // share links opened while the app is already loaded
  useEffect(() => {
    const onHash = () => {
      const share = parseShare();
      if (share && terms?.some((t) => t.code === share.term)) {
        setTerm(share.term);
        setMode({ kind: 'shared', crns: share.crns });
        setMobileTab('schedules');
      }
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [terms, setTerm]);

  const termInfo = terms?.find((t) => t.code === term);
  // a newer semester than the one this visitor is looking at (e.g. Fall 2027 came out while they're on Spring 2027)
  const newest = terms?.[0];
  const newTerm = newest && term && Number(newest.code) > Number(term) && dismissedTerm !== newest.code ? newest : null;
  useEffect(() => {
    if (!termInfo) return;
    setIndex(null);
    loadTerm(termInfo.code, termInfo.updatedAt)
      .then(setIndex)
      .catch((e) => setLoadError(String(e.message ?? e)));
  }, [termInfo]);

  // ---- solver
  const hues = useMemo(() => courseHues(courseConfigs.map((c) => c.key)), [courseConfigs]);
  // each elective pool gets its own colour, used for whichever courses it picks
  const poolHues = useMemo(() => Object.fromEntries(pools.map((p, i) => [p.subj, hueFor(courseConfigs.length + i)])), [pools, courseConfigs.length]);
  const takenKeys = useMemo(() => courseConfigs.map((c) => c.key), [courseConfigs]);
  // colours for the small result-card previews: auto-picked electives use their pool's colour
  const cardHues = useMemo(() => {
    const h: Record<string, number> = {};
    for (const c of index?.courses ?? []) if (poolHues[c.subj] !== undefined) h[c.key] = poolHues[c.subj];
    return { ...h, ...hues };
  }, [index, poolHues, hues]);
  const input = useMemo<SolveInput | null>(() => {
    if (!index || !hasWork) return null;
    const keys = new Set(takenKeys);
    const poolSubj = new Set(pools.map((p) => p.subj));
    const sections = index.data.sections.filter((s) => keys.has(courseKey(s)) || poolSubj.has(s.subj));
    return { sections, courses: courseConfigs, pools, filters, customWeights: customWeights(custom) };
  }, [index, hasWork, takenKeys, courseConfigs, pools, filters, custom]);
  const { state: solveState, result, error: solveError } = useSolver(input);
  const ranking = result?.rankings[preset] ?? result?.rankings['balanced'] ?? [];

  useEffect(() => {
    setPos(0);
    setEdited(null);
    setShowCount(30);
  }, [result, preset]);
  useEffect(() => setSelected(null), [pos, mode]);

  const courseStats = useMemo(() => {
    const out: Record<string, { before: number; after: number }> = {};
    if (!result) return out;
    for (const f of result.filtered) {
      const g = result.groups[f.group];
      const o = (out[g.course] ??= { before: 0, after: 0 });
      o.before += f.before;
      o.after += f.after;
    }
    return out;
  }, [result]);
  // how many distinct topics of each pool survive the filters
  const poolUsable = useMemo(() => {
    const out: Record<string, number> = {};
    if (!result) return out;
    for (const g of result.groups) {
      if (!g.pool || g.pool.slot !== 0) continue;
      const topics = new Set<number>();
      for (const c of g.candidates) for (const t of result.candidates[c].topics ?? []) topics.add(t);
      out[g.pool.id] = topics.size;
    }
    return out;
  }, [result]);

  // ---- current view
  const activeSlot = mode.kind === 'slot' ? slots.find((s) => s.id === mode.id) : undefined;
  const view: ScheduleView | null = useMemo(() => {
    if (!index) return null;
    if (mode.kind === 'slot') return activeSlot ? viewFromCrns(activeSlot.crns, index, filters.profs) : null;
    if (mode.kind === 'shared') return viewFromCrns(mode.crns, index, filters.profs);
    if (edited) return edited;
    if (!result || !ranking.length) return null;
    return viewFromResult(result, ranking[Math.min(pos, ranking.length - 1)], index);
  }, [index, mode, activeSlot, edited, result, ranking, pos, filters.profs]);

  // colours for sections of courses not in the current list (slots / shared links)
  const viewHues = useMemo(() => {
    const h = { ...hues };
    let i = Object.keys(h).length;
    const poolSeen: Record<string, number> = {};
    for (const s of view?.sections ?? []) {
      if (h[courseKey(s)] !== undefined) continue;
      if (poolHues[s.subj] !== undefined) {
        // each auto-picked elective gets its own shade, starting from the pool's colour
        const k = (poolSeen[s.subj] = (poolSeen[s.subj] ?? -1) + 1);
        h[courseKey(s)] = (poolHues[s.subj] + k * 40) % 360;
      } else h[courseKey(s)] = hueFor(i++);
    }
    return h;
  }, [hues, poolHues, view]);

  // other sections the selected class could be swapped for: same course, or — for an auto-picked
  // elective — any allowed course of that pool (but not a topic already in the schedule)
  const swapOptions = useMemo(() => {
    if (!selected || !index || !view) return undefined;
    const key = courseKey(selected);
    const pool = pools.find((p) => p.subj === selected.subj);
    if (!pool || takenKeys.includes(key)) return undefined;
    const others = new Set(view.sections.filter((s) => s.subj === pool.subj && s.crn !== selected.crn).map((s) => baseNum(s.num)));
    return poolCourses(index.data.sections, pool, takenKeys)
      .filter((c) => !pool.excluded.includes(c.key) && !others.has(c.base))
      .flatMap((c) => c.sections.map((i) => index.data.sections[i]))
      .filter((s) => s.type === selected.type);
  }, [selected, index, view, pools, takenKeys]);

  const crns = view?.sections.map((s) => s.crn) ?? [];
  const alreadySaved = slots.find((s) => s.crns.length === crns.length && s.crns.every((c) => crns.includes(c)));

  const save = useCallback(() => {
    if (!view || !view.sections.length) return;
    if (alreadySaved) {
      toast(`Already saved as ${alreadySaved.name}`, 'warn');
      return;
    }
    const slot = saveSlot(view.sections.map((s) => s.crn));
    toast(`Saved as ${slot.name}`);
  }, [view, alreadySaved, saveSlot]);

  const share = () => {
    if (!term || !crns.length) return;
    const url = `${location.origin}${location.pathname}#s=${term}:${crns.join('.')}`;
    copyText(url, 'Share link copied');
  };

  const swap = (changes: [Section, Section][]) => {
    if (!view || !index || !changes.length) return;
    const to = changes[0][1];
    const sections = view.sections.map((s) => changes.find(([from]) => from.crn === s.crn)?.[1] ?? s);
    if (changes.length > 1) toast(`Swapped ${changes.map(([, t]) => `${courseKey(t)}${t.type !== 'Lecture' ? ' ' + t.type.toLowerCase() : ''}`).join(' and ')}`);
    if (mode.kind === 'slot' && activeSlot) {
      setSlotCrns(activeSlot.id, sections.map((s) => s.crn));
      toast(`${activeSlot.name} updated`);
    } else if (mode.kind === 'shared') {
      setMode({ kind: 'shared', crns: sections.map((s) => s.crn) });
    } else {
      setEdited({ sections, alternates: alternatesFor(sections, index), f: featuresFor(sections, filters.profs), missing: [] });
    }
    setSelected(to);
  };

  // ---- keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (mode.kind === 'results' && (e.key === 'ArrowRight' || e.key === 'j')) {
        setEdited(null);
        setPos((p) => Math.min(p + 1, ranking.length - 1));
      } else if (mode.kind === 'results' && (e.key === 'ArrowLeft' || e.key === 'k')) {
        setEdited(null);
        setPos((p) => Math.max(p - 1, 0));
      } else if (e.key === 's') save();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, ranking.length, save]);

  // ---- touch: swipe the calendar left/right to browse results
  const touch = useRef<{ x: number; y: number } | null>(null);
  const swipe = {
    start: (e: RTouchEvent) => {
      const t = e.touches[0];
      touch.current = { x: t.clientX, y: t.clientY };
    },
    end: (e: RTouchEvent) => {
      const s = touch.current;
      touch.current = null;
      if (!s || mode.kind !== 'results') return;
      const t = e.changedTouches[0];
      const dx = t.clientX - s.x, dy = t.clientY - s.y;
      if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      setEdited(null);
      setPos((p) => (dx < 0 ? Math.min(p + 1, ranking.length - 1) : Math.max(p - 1, 0)));
    },
  };

  // keep the active result visible in the phone strip
  const stripRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = stripRef.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    const card = el.children[pos] as HTMLElement | undefined;
    if (card) el.scrollTo({ left: card.offsetLeft - el.clientWidth / 2 + card.clientWidth / 2, behavior: 'smooth' });
  }, [pos]);

  const activeFilterCount =
    (filters.daysOff ? 1 : 0) +
    (filters.earliest !== null ? 1 : 0) +
    (filters.latest !== null ? 1 : 0) +
    (filters.maxDays ? 1 : 0) +
    (filters.blocked.length ? 1 : 0) +
    Object.keys(filters.profs).length;

  const leaveSpecial = () => {
    if (mode.kind === 'shared') history.replaceState(null, '', location.pathname + location.search);
    setMode({ kind: 'results' });
  };

  const totalCredits = useMemo(() => {
    if (!index) return 0;
    // electives: LAS courses are 3 credits each
    return courseConfigs.reduce((a, c) => a + (c.optional ? 0 : index.byKey.get(c.key)?.credits ?? 0), 0) + pools.reduce((a, p) => a + p.count * 3, 0);
  }, [index, courseConfigs, pools]);

  const campusCounts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const s of index?.data.sections ?? []) out[s.campus] = (out[s.campus] ?? 0) + 1;
    return out;
  }, [index]);

  const campusesAvailable = useMemo(() => {
    if (!index) return ['Beirut', 'Byblos'];
    const c = new Set(index.data.sections.map((s) => s.campus));
    return ['Beirut', 'Byblos', 'Online', ...[...c].filter((x) => !['Beirut', 'Byblos', 'Online', 'Other'].includes(x))].filter((x) => c.has(x));
  }, [index]);

  return (
    <div className="min-h-screen">
      <Header theme={theme} terms={terms} term={term} termInfo={termInfo} checkedAt={checkedAt} slotCount={slots.length} onSlots={() => setSlotsOpen(true)} />

      {newTerm && (
        <div className="mx-auto max-w-[1500px] px-4 pt-4">
          <div className="animate-pop flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-accent/30 bg-accent-soft px-4 py-2.5 text-sm text-accent-text">
            <Icon name="sparkle" />
            <span className="min-w-0 flex-1">
              <b>{newTerm.name}</b> is out on Banner — {newTerm.courses.toLocaleString()} courses. You're viewing {termInfo?.name}.
            </span>
            <Button size="sm" variant="primary" onClick={() => setTerm(newTerm.code)}>
              Switch to {newTerm.name}
            </Button>
            <IconButton icon="x" label="Dismiss" onClick={() => useStore.getState().dismissTerm(newTerm.code)} />
          </div>
        </div>
      )}

      {loadError && (
        <div className="mx-auto max-w-[1500px] px-4 pt-4">
          <div className="flex items-center gap-2 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
            <Icon name="alert" /> {loadError}
          </div>
        </div>
      )}

      <main className="mx-auto grid max-w-[1500px] grid-cols-[minmax(0,1fr)] gap-5 px-4 py-5 lg:grid-cols-[360px_minmax(0,1fr)]">
        {/* ---------- left column ---------- */}
        <aside className={cx('min-w-0 space-y-4 lg:sticky lg:top-[72px] lg:max-h-[calc(100vh-88px)] lg:self-start lg:overflow-y-auto lg:pb-4 scrollbar-thin', mobileTab === 'schedules' && 'max-lg:hidden')}>
          <Card className={cx('p-4', mobileTab !== 'courses' && 'max-lg:hidden')}>
            <CampusPicker filters={filters} campuses={campusesAvailable} counts={campusCounts} />
          </Card>

          <Card className={cx('p-4', mobileTab !== 'courses' && 'max-lg:hidden')}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Courses</h2>
              {hasWork && (
                <span className="text-xs text-muted">
                  {courseConfigs.length + pools.reduce((a, p) => a + p.count, 0)} course{courseConfigs.length + pools.reduce((a, p) => a + p.count, 0) === 1 ? '' : 's'} · {totalCredits} cr
                  <button className="ml-2 text-faint hover:text-danger" onClick={() => clearCourses()}>
                    clear
                  </button>
                </span>
              )}
            </div>
            {index ? (
              <CourseSearch courses={index.courses} selected={takenKeys} campuses={filters.campuses} onAdd={addCourse} onAddPool={(subj) => addPool(subj)} />
            ) : (
              <div className="h-11 animate-pulse rounded-xl bg-surface-2" />
            )}
            <div className="mt-3 space-y-2">
              {courseConfigs.map((c) => (
                <CourseCard key={c.key} course={index?.byKey.get(c.key)} config={c} hue={hues[c.key]} filters={filters} stat={courseStats[c.key]} />
              ))}
              {index &&
                pools.map((p) => (
                  <PoolCard key={p.id} pool={p} sections={index.data.sections} takenKeys={takenKeys} hue={poolHues[p.subj]} filters={filters} usable={poolUsable[p.id]} />
                ))}
            </div>
            {index && !pools.some((p) => p.subj === 'LAS') && index.data.sections.some((s) => s.subj === 'LAS') && (
              <div className="mt-3">
                <AddPoolButton subj="LAS" onAdd={() => addPool('LAS')} />
              </div>
            )}
            {hasWork && (
              <Button variant="primary" className="mt-4 w-full lg:hidden" onClick={() => showTab('schedules')}>
                {solveState === 'solving' ? 'Finding schedules…' : result ? `See ${result.total.toLocaleString()}${result.truncated ? '+' : ''} schedule${result.total === 1 ? '' : 's'}` : 'See schedules'}
                <Icon name="chevronRight" />
              </Button>
            )}
          </Card>

          <Card className={cx('p-4', mobileTab !== 'filters' && 'max-lg:hidden')}>
            <button className="flex w-full items-center justify-between" onClick={() => setFiltersOpen((o) => !o)}>
              <h2 className="text-sm font-semibold">Filters</h2>
              <Icon name={filtersOpen ? 'chevronUp' : 'chevronDown'} className="size-4 text-faint max-lg:hidden" />
            </button>
            {(filtersOpen || mobileTab === 'filters') && (
              <div className="mt-3">
                <FiltersPanel filters={filters} />
              </div>
            )}
          </Card>
        </aside>

        {/* ---------- right column ---------- */}
        <section className={cx('min-w-0 space-y-4', mobileTab !== 'schedules' && 'max-lg:hidden')}>
          {mode.kind !== 'results' ? (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-accent/30 bg-accent-soft px-4 py-2.5 text-sm text-accent-text">
              <Icon name={mode.kind === 'slot' ? 'bookmark' : 'link'} />
              <span className="flex-1">
                {mode.kind === 'slot' ? (
                  <>
                    Viewing saved schedule <b>{activeSlot?.name}</b> — click a class to swap its section.
                  </>
                ) : (
                  <>Viewing a shared schedule.</>
                )}
              </span>
              {mode.kind === 'shared' && (
                <Button size="sm" variant="primary" onClick={save}>
                  <Icon name="bookmark" className="size-3.5" /> Save to my slots
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={leaveSpecial}>
                <Icon name="arrowLeft" className="size-3.5" /> Back to results
              </Button>
            </div>
          ) : (
            hasWork && (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <PresetBar />
                </div>
                <div className="shrink-0 text-xs text-muted">
                  {solveState === 'solving' ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="size-2 animate-pulse rounded-full bg-accent" /> Finding schedules…
                    </span>
                  ) : result ? (
                    <span title={`${result.nodes.toLocaleString()} search steps in ${result.ms.toFixed(0)} ms`}>
                      <b className="text-ink">{result.total.toLocaleString()}</b> valid schedule{result.total === 1 ? '' : 's'}
                      {result.truncated && '+'}
                    </span>
                  ) : null}
                </div>
              </div>
            )
          )}
          {mode.kind === 'results' && hasWork && result && <DayPatterns patterns={result.patterns ?? {}} dayPattern={filters.dayPattern ?? 0} />}

          {mode.kind === 'results' && !hasWork && <EmptyState index={index} onAdd={addCourse} />}
          {solveError && <div className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">Solver error: {solveError}</div>}

          {mode.kind === 'results' && result?.diagnosis && hasWork && result.total === 0 && (
            <Card className="flex items-start gap-3 p-5">
              <div className="rounded-full bg-warn-soft p-2 text-warn">
                <Icon name="alert" className="size-5" />
              </div>
              <div>
                <div className="font-semibold">No schedule fits</div>
                <p className="mt-1 text-sm text-muted">{result.diagnosis.message}</p>
              </div>
            </Card>
          )}

          {view && (
            <div className={cx('grid gap-4', mode.kind === 'results' && 'xl:grid-cols-[minmax(0,1fr)_260px]')}>
              <Card className="min-w-0 p-3 sm:p-5">
                <div className="mb-4 flex flex-wrap items-center gap-3">
                  {mode.kind === 'results' && (
                    <div className="flex items-center gap-1 max-sm:hidden">
                      <IconButton icon="chevronLeft" label="Previous (←)" disabled={pos === 0} onClick={() => (setEdited(null), setPos((p) => p - 1))} />
                      <div className="min-w-[70px] text-center text-sm tabular-nums">
                        <b>#{pos + 1}</b> <span className="text-muted">/ {ranking.length}</span>
                      </div>
                      <IconButton icon="chevronRight" label="Next (→)" disabled={pos >= ranking.length - 1} onClick={() => (setEdited(null), setPos((p) => p + 1))} />
                    </div>
                  )}
                  <div className="order-last w-full min-w-0 2xl:order-none 2xl:w-auto 2xl:flex-1">
                    <MetricChips f={view.f} mask={dayMaskOf(view.sections)} />
                  </div>
                  <div className="flex-1 max-sm:hidden 2xl:hidden" />
                  {edited && mode.kind === 'results' && (
                    <button onClick={() => setEdited(null)} className="rounded-md bg-warn-soft px-2 py-1 text-[11px] font-medium text-warn" title="Undo your swaps">
                      Edited · reset
                    </button>
                  )}
                  <div className="flex items-center gap-1.5 max-sm:hidden">
                    <IconButton icon="link" label="Copy share link" onClick={share} />
                    {mode.kind !== 'slot' && (
                      <Button onClick={save} variant={alreadySaved ? 'soft' : 'outline'} title="Save to a slot (S)">
                        <Icon name={alreadySaved ? 'check' : 'bookmark'} />
                        {alreadySaved ? `Saved · ${alreadySaved.name}` : 'Save'}
                      </Button>
                    )}
                    <CopyCrnsButton crns={crns} />
                  </div>
                </div>

                <div onTouchStart={swipe.start} onTouchEnd={swipe.end}>
                  <Calendar sections={view.sections} hues={viewHues} blocked={filters.blocked} selected={selected?.crn} onSelect={(s) => {
                    const opening = selected?.crn !== s.crn;
                    setSelected(opening ? s : null);
                    // phones: the class's details open below the calendar, so bring them into view
                    if (opening && window.innerWidth < 640)
                      requestAnimationFrame(() => document.getElementById('class-details')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
                  }} />
                </div>

                {selected && index && (
                  <div className="mt-4">
                    <SwapPanel view={view} index={index} selected={selected} hues={viewHues} options={swapOptions} onSwap={swap} onClose={() => setSelected(null)} />
                  </div>
                )}

                <div className="mt-5">
                  <CrnTable view={view} hues={viewHues} seatsAt={termInfo?.seatsAt} order={takenKeys} selected={selected?.crn ?? null} onSelect={setSelected} />
                </div>
                <div className="mt-5">
                  <DatedSessions view={view} hues={viewHues} />
                </div>
                <p className="mt-4 hidden text-[11px] text-faint sm:block">
                  Tip: <Kbd>←</Kbd> <Kbd>→</Kbd> browse · <Kbd>S</Kbd> save · <Kbd>/</Kbd> search · click a class to swap its section
                </p>
                <p className="mt-4 text-center text-[11px] text-faint sm:hidden">
                  {mode.kind === 'results' ? 'Swipe the calendar to browse · tap' : 'Tap'} a class to swap its section
                </p>
              </Card>

              {mode.kind === 'results' && result && (
                <div className="min-w-0 space-y-2 max-sm:order-first xl:sticky xl:top-[72px] xl:max-h-[calc(100vh-88px)] xl:self-start xl:overflow-y-auto scrollbar-thin xl:pr-1">
                  <div className="px-1 text-[11px] font-medium uppercase tracking-wide text-faint max-sm:hidden">
                    Top {Math.min(ranking.length, 300)} · {preset === CUSTOM_ID ? 'Custom' : PRESETS.find((p) => p.id === preset)?.label}
                  </div>
                  {/* phones: a swipeable strip above the calendar; tablets: grid; desktop: sticky column */}
                  <div ref={stripRef} className="scrollbar-thin scrollbar-none-sm grid grid-cols-2 gap-2 max-sm:-mx-4 max-sm:flex max-sm:snap-x max-sm:snap-mandatory max-sm:overflow-x-auto max-sm:px-4 max-sm:pb-1 sm:grid-cols-3 xl:grid-cols-1">
                    {ranking.slice(0, showCount).map((si, i) => (
                      <ResultCard key={si} rank={i} active={i === pos && !edited} onClick={() => (setEdited(null), setPos(i))} result={result} si={si} index={index!} hues={cardHues} />
                    ))}
                    {showCount < ranking.length && (
                      <button className="shrink-0 rounded-xl border border-dashed border-line px-4 text-xs text-muted sm:hidden" onClick={() => setShowCount((n) => n + 30)}>
                        More
                      </button>
                    )}
                  </div>
                  {showCount < ranking.length && (
                    <Button variant="ghost" className="w-full max-sm:hidden" onClick={() => setShowCount((n) => n + 30)}>
                      Show more
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}

          {mode.kind === 'slot' && !activeSlot && <Card className="p-6 text-sm text-muted">That slot was deleted.</Card>}
        </section>
      </main>

      <footer
        className={cx(
          'mx-auto max-w-[1500px] px-4 pt-2 text-center text-[11px] text-faint lg:pb-8',
          // leave room for the bottom tab bar (and the action bar above it) on phones
          mobileTab === 'schedules' && view ? 'pb-24 max-sm:pb-40' : 'pb-24',
        )}
      >
        Unofficial tool. Course data is copied from LAU Banner's public class schedule{checkedAt && <> and was last checked {timeAgo(checkedAt)}</>}. Always confirm on Banner before registering.
      </footer>

      {slotsOpen && index && (
        <SlotsPanel
          index={index}
          hues={viewHues}
          activeSlot={activeSlot?.id ?? null}
          onOpen={(id) => {
            setMode({ kind: 'slot', id });
            setMobileTab('schedules');
            setSlotsOpen(false);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          onClose={() => setSlotsOpen(false)}
        />
      )}

      {/* ---------- phone: schedule action bar + bottom tab bar ---------- */}
      {mobileTab === 'schedules' && view && (
        <div className="fixed inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom))] z-30 border-t border-line bg-surface/95 px-3 py-2 backdrop-blur sm:hidden">
          <div className="flex items-center gap-2">
            {mode.kind === 'results' ? (
              <div className="flex items-center">
                <IconButton icon="chevronLeft" label="Previous" className="size-10" disabled={pos === 0} onClick={() => (setEdited(null), setPos((p) => p - 1))} />
                <div className="min-w-[56px] text-center text-sm tabular-nums leading-tight">
                  <b>#{pos + 1}</b>
                  <div className="text-[10px] text-muted">of {ranking.length}</div>
                </div>
                <IconButton icon="chevronRight" label="Next" className="size-10" disabled={pos >= ranking.length - 1} onClick={() => (setEdited(null), setPos((p) => p + 1))} />
              </div>
            ) : (
              <span className="truncate text-sm font-medium">{mode.kind === 'slot' ? activeSlot?.name : 'Shared'}</span>
            )}
            <div className="flex-1" />
            <IconButton icon="link" label="Copy share link" className="size-10" onClick={share} />
            {mode.kind !== 'slot' && <IconButton icon={alreadySaved ? 'check' : 'bookmark'} label={alreadySaved ? `Saved as ${alreadySaved.name}` : 'Save'} active={!!alreadySaved} className="size-10" onClick={save} />}
            <CopyCrnsButton crns={crns} label="Copy" />
          </div>
        </div>
      )}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label="Sections">
        <div className="mx-auto grid h-14 max-w-md grid-cols-4">
          {(
            [
              ['courses', 'search', 'Courses', courseConfigs.length + pools.reduce((a, p) => a + p.count, 0) || null],
              ['filters', 'sliders', 'Filters', activeFilterCount || null],
              ['schedules', 'calendar', 'Schedules', mode.kind === 'results' && result?.total ? (result.total > 999 ? '999+' : result.total) : null],
            ] as const
          ).map(([id, icon, label, badge]) => (
            <button
              key={id}
              onClick={() => showTab(id)}
              className={cx('relative flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium', mobileTab === id ? 'text-accent-text' : 'text-muted')}
              aria-current={mobileTab === id ? 'page' : undefined}
            >
              <span className="relative">
                <Icon name={icon} className="size-5" />
                {badge !== null && <span className="absolute -right-3 -top-1.5 min-w-4 rounded-full bg-accent px-1 text-center text-[9px] font-semibold leading-4 text-white dark:text-[#04130d]">{badge}</span>}
              </span>
              {label}
            </button>
          ))}
          <button onClick={() => setSlotsOpen(true)} className="flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted">
            <span className="relative">
              <Icon name="bookmark" className="size-5" />
              {slots.length > 0 && <span className="absolute -right-3 -top-1.5 min-w-4 rounded-full bg-accent px-1 text-center text-[9px] font-semibold leading-4 text-white dark:text-[#04130d]">{slots.length}</span>}
            </span>
            Saved
          </button>
        </div>
      </nav>
      <Toasts />
    </div>
  );
}

function ResultCard({ rank, active, onClick, result, si, index, hues }: { rank: number; active: boolean; onClick: () => void; result: NonNullable<ReturnType<typeof useSolver>['result']>; si: number; index: TermIndex; hues: Record<string, number> }) {
  const view = useMemo(() => viewFromResult(result, si, index), [result, si, index]);
  return (
    <button
      onClick={onClick}
      className={cx(
        'w-full rounded-xl border bg-surface p-2.5 text-left transition-colors max-sm:w-[124px] max-sm:shrink-0 max-sm:snap-start max-sm:p-2',
        active ? 'border-accent ring-1 ring-accent' : 'border-line hover:border-line-strong',
      )}
    >
      <div className="mb-1.5 flex items-center gap-2 max-sm:mb-1">
        <span className={cx('text-xs font-semibold tabular-nums', active ? 'text-accent-text' : 'text-muted')}>#{rank + 1}</span>
      </div>
      <MiniWeek sections={view.sections} hues={hues} className="mb-2 h-10 w-full sm:h-14" />
      <div className="max-sm:hidden">
        <MetricChips f={view.f} compact mask={dayMaskOf(view.sections)} />
      </div>
      <div className="truncate text-[11px] tabular-nums text-muted sm:hidden">
        <b className="font-mono text-ink">{fmtDays(dayMaskOf(view.sections))}</b> ·<b className="text-ink">{Math.round((view.f.gaps / 60) * 10) / 10}h</b> idle
      </div>
    </button>
  );
}

function Header({ theme, terms, term, termInfo, checkedAt, slotCount, onSlots }: { theme: Theme; terms: TermInfo[] | null; term: string | null; termInfo?: TermInfo; checkedAt: string | null; slotCount: number; onSlots: () => void }) {
  const { setTheme, setTerm } = useStore.getState();
  const next: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' };
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1500px] items-center gap-2 px-4 sm:gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent text-white dark:text-[#04130d]">
            <Icon name="grid" className="size-4" strokeWidth={2.2} />
          </div>
          <div className="hidden whitespace-nowrap leading-tight min-[480px]:block">
            <div className="text-sm font-semibold">LAU Scheduler</div>
            <div className="hidden text-[11px] text-muted sm:block">Build a conflict-free schedule in seconds</div>
          </div>
        </div>
        <div className="flex-1" />
        {terms && (
          <select
            value={term ?? ''}
            onChange={(e) => setTerm(e.target.value)}
            className="h-9 min-w-0 rounded-lg border border-line bg-surface px-2.5 text-base font-medium outline-none focus:border-accent sm:text-sm"
            aria-label="Term"
          >
            {terms.map((t) => (
              <option key={t.code} value={t.code}>
                {t.name}
              </option>
            ))}
          </select>
        )}
        {termInfo && (
          <span
            className="hidden items-center gap-1.5 text-xs text-muted md:inline-flex"
            title={`Banner checked ${new Date(checkedAt ?? termInfo.updatedAt).toLocaleString()}\n${termInfo.name} sections last changed ${new Date(termInfo.updatedAt).toLocaleString()}`}
          >
            <span className="size-1.5 rounded-full bg-accent" />
            Checked {timeAgo(checkedAt ?? termInfo.updatedAt)}
          </span>
        )}
        <Button onClick={onSlots} variant="outline" className="max-lg:hidden">
          <Icon name="bookmark" />
          <span className="hidden sm:inline">Saved</span>
          {slotCount > 0 && <span className="rounded-full bg-accent-soft px-1.5 text-[11px] font-semibold text-accent-text">{slotCount}</span>}
        </Button>
        <IconButton icon={theme === 'dark' ? 'moon' : theme === 'light' ? 'sun' : 'monitor'} label={`Theme: ${theme}`} onClick={() => setTheme(next[theme])} />
      </div>
    </header>
  );
}

function EmptyState({ index, onAdd }: { index: TermIndex | null; onAdd: (k: string) => void }) {
  const samples = ['ENG 202', 'MTH 201', 'CSC 245', 'PHY 111', 'ARA 201', 'COM 203'].filter((k) => index?.byKey.has(k));
  return (
    <Card className="overflow-hidden">
      <div className="grid gap-6 p-6 sm:p-10 md:grid-cols-[1.1fr_1fr] md:items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Your best schedule, without the spreadsheet.</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Add the courses you need. Every conflict-free combination of sections is checked, then ranked the way you like:
            fewest days, least idle time, late starts, favourite professors and more. Save the best ones and copy their CRNs straight into Banner.
          </p>
          {samples.length > 0 && (
            <div className="mt-5">
              <div className="mb-2 text-xs text-faint">Try adding</div>
              <div className="flex flex-wrap gap-1.5">
                {samples.map((k) => (
                  <button key={k} onClick={() => onAdd(k)} className="inline-flex items-center gap-1 rounded-full border border-line px-3 py-1 font-mono text-xs hover:border-accent hover:text-accent-text">
                    <Icon name="plus" className="size-3" />
                    {k}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <ol className="space-y-3 text-sm">
          {[
            ['Type a code', 'MTH2 lists MTH 201, 206, 207… Titles work too ("calculus").'],
            ['Set filters', 'Pick a campus, days off and blocked times, and avoid or prefer professors.'],
            ['Pick a ranking', 'Switch between “Fewest days”, “Least idle time”, “Late starts”… or build your own.'],
            ['Save & copy', 'Keep schedules in slots A, B, C and copy all their CRNs in one click.'],
          ].map(([t, d], i) => (
            <li key={t} className="flex gap-3">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent-text">{i + 1}</span>
              <span>
                <span className="font-medium">{t}</span>
                <span className="block text-muted">{d}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </Card>
  );
}

