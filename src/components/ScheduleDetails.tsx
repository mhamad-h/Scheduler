import { useMemo } from 'react';
import type { TermIndex } from '../data/load.ts';
import type { Section } from '../data/types.ts';
import { courseKey, fmtDays, fmtTime } from '../data/types.ts';
import type { ScheduleView } from '../lib/view.ts';
import { conflictsWith, creditMismatch, datedSessions, findTrade } from '../lib/view.ts';
import { joinCrns, useStore } from '../state/store.ts';
import type { CrnSort } from '../state/store.ts';
import { copyText, cx, Icon, Segmented } from './ui.tsx';
import { noSeats, seatLabel, seatShort, seatState } from '../lib/seats.ts';
import { timeAgo } from '../lib/time.ts';

const SEAT_TONE = { open: 'text-accent-text', low: 'text-warn', full: 'text-danger', closed: 'text-danger', unknown: 'text-faint' } as const;

/** "12 left" / "Full" with capacity — the numbers Banner showed at the last check. */
export function SeatBadge({ s, compact }: { s: Section; compact?: boolean }) {
  const st = seatState(s);
  if (!s.seats) return <span className="text-xs text-faint" title={seatLabel(s)}>—</span>;
  const [cap] = s.seats;
  return (
    <span className={cx('whitespace-nowrap text-xs', SEAT_TONE[st])} title={seatLabel(s)}>
      <b className="font-semibold">{seatShort(s)}</b>
      {!compact && st !== 'closed' && <span className="text-faint"> / {cap}</span>}
      {!compact && st === 'full' && s.wl && <span className="block text-[10px] text-faint">waitlist {s.wl[1]}/{s.wl[0]}</span>}
    </span>
  );
}

/** "or 21812 (5 left)" — sections you could register instead with no other change. */
function Alternates({ alt }: { alt: Section[] }) {
  return (
    <>
      or{' '}
      {alt.slice(0, 3).map((a, i) => (
        <span key={a.crn} title={seatLabel(a)}>
          {i > 0 && ', '}
          {a.crn}
          {a.seats && <span className={SEAT_TONE[seatState(a)]}> ({seatShort(a).toLowerCase()})</span>}
        </span>
      ))}
      {alt.length > 3 ? '…' : ''}
    </>
  );
}

const TYPE_RANK = ['Lecture', 'Lab', 'Recitation', 'Tutorial', 'Studio', 'Seminar'];
const typeRank = (t: string) => (TYPE_RANK.indexOf(t) + 99) % 99;

/** Earliest weekly slot of a section as one sortable number (day * 1440 + start). */
const firstSlot = (s: Section) => {
  let best = Infinity;
  for (const m of s.m) for (let d = 0; d < 7; d++) if (m.d & (1 << d)) best = Math.min(best, d * 1440 + m.s);
  return best;
};

/**
 * Sections in a predictable order:
 *  - "course": the order of your course list (lecture before lab), auto-picked electives last
 *  - "time":   by first class of the week (Mon 8:00 first), unscheduled last
 */
export function sortSections(sections: Section[], order: string[], mode: CrnSort) {
  const rank = (s: Section) => {
    const i = order.indexOf(courseKey(s));
    return i < 0 ? order.length : i;
  };
  return [...sections].sort((a, b) =>
    mode === 'time'
      ? firstSlot(a) - firstSlot(b) || courseKey(a).localeCompare(courseKey(b))
      : rank(a) - rank(b) || courseKey(a).localeCompare(courseKey(b)) || typeRank(a.type) - typeRank(b.type),
  );
}

export function CrnTable({
  view,
  hues,
  order,
  selected,
  onSelect,
  seatsAt,
}: {
  view: ScheduleView;
  hues: Record<string, number>;
  /** when Banner's seat numbers were last read (absent = this term has no seat data) */
  seatsAt?: string;
  /** the user's course list, used for "course order" */
  order: string[];
  selected: string | null;
  onSelect: (s: Section | null) => void;
}) {
  const mode = useStore((s) => s.crnSort);
  const setCrnSort = useStore((s) => s.setCrnSort);
  const sorted = useMemo(() => sortSections(view.sections, order, mode), [view.sections, order, mode]);
  const auto = (s: Section) => order.length > 0 && !order.includes(courseKey(s));
  const full = view.sections.filter(noSeats);
  return (
    <>
    <div className="mb-2 flex items-center justify-between gap-3">
      <h3 className="text-sm font-semibold">
        Sections <span className="font-normal text-muted">· {view.sections.length}</span>
      </h3>
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-faint">Sort</span>
        <Segmented<CrnSort>
          value={mode}
          onChange={setCrnSort}
          options={[
            { value: 'course', label: 'Course', title: 'Same order as your course list (lecture before lab)' },
            { value: 'time', label: 'Time', title: 'First class of the week first' },
          ]}
        />
      </div>
    </div>
    {seatsAt && (
      <div className="mb-3 space-y-2">
        <p className="flex items-start gap-1.5 text-[11px] text-muted">
          <Icon name="info" className="mt-px size-3.5 shrink-0" />
          <span>
            Seats are from Banner, checked {timeAgo(seatsAt)}. They change fast once registration opens, so confirm on Banner before you register.
            <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
              On the calendar:
              <span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-accent" />seats left</span>
              <span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-warn" />only a few</span>
              <span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-danger" />full or closed</span>
            </span>
          </span>
        </p>
        {full.length > 0 && (
          <div className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger-soft px-3 py-2 text-xs text-danger">
            <Icon name="alert" className="mt-px size-4 shrink-0" />
            <span>
              <b className="font-semibold">
                {full.length === 1 ? '1 section has' : `${full.length} sections have`} no seats left:{' '}
                {full.map((s) => `${courseKey(s)}${s.type !== 'Lecture' ? ' ' + s.type.toLowerCase() : ''} (${s.crn}, ${seatShort(s).toLowerCase()})`).join(', ')}.
              </b>{' '}
              Use an "or" CRN with seats if there is one, tap the class to swap it, or turn on <b className="font-semibold">Hide full sections</b> in Filters.
            </span>
          </div>
        )}
      </div>
    )}
    {/* phones: stacked cards */}
    <div className="space-y-2 sm:hidden">
      {sorted.map((s) => {
        const key = courseKey(s);
        const alt = view.alternates[s.crn];
        const rooms = [...new Set(s.m.map((m) => m.r).filter(Boolean))].join(', ');
        return (
          <div
            key={s.crn}
            onClick={() => onSelect(selected === s.crn ? null : s)}
            className={cx('rounded-xl border p-3', selected === s.crn ? 'border-accent bg-surface-2' : 'border-line')}
            style={{ ['--h' as string]: hues[key] ?? 210 }}
          >
            <div className="flex items-start gap-2">
              <span className="course-dot mt-1.5 size-2 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[13px] font-medium">{key}</span>
                  {s.type !== 'Lecture' && <span className="rounded bg-surface-2 px-1 text-[10px] text-muted">{s.type}</span>}
                  {auto(s) && <span className="rounded bg-accent-soft px-1 text-[10px] text-accent-text" title="Picked by the scheduler from your electives">auto</span>}
                  <span className="text-[11px] text-faint">sec {s.sec}</span>
                </div>
                <div className="truncate text-xs text-muted">{s.title}</div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    copyText(s.crn, `Copied CRN ${s.crn}`);
                  }}
                  className="inline-flex items-center gap-1 rounded-lg bg-surface-2 px-2.5 py-1.5 font-mono text-sm font-medium active:bg-accent-soft"
                  aria-label={`Copy CRN ${s.crn}`}
                >
                  {s.crn}
                  <Icon name="copy" className="size-3.5 text-muted" />
                </button>
                {seatsAt && <SeatBadge s={s} />}
              </div>
            </div>
            <div className="mt-2 space-y-0.5 pl-4 text-xs">
              {s.m.length ? (
                s.m.map((m, i) => (
                  <div key={i}>
                    <span className="font-medium">{fmtDays(m.d)}</span> {fmtTime(m.s)}–{fmtTime(m.e)}
                    {m.dt && <span className="text-faint"> ({m.dt})</span>}
                  </div>
                ))
              ) : (
                <div className="italic text-muted">No set time</div>
              )}
              <div className="truncate text-muted">
                {s.ins.length ? s.ins.join(', ') : 'Instructor TBA'} · {rooms || s.campus}
              </div>
              {alt && (
                <div className="text-[11px] text-faint">
                  Same time & instructor: <Alternates alt={alt} />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
    <div className="scrollbar-thin overflow-x-auto max-sm:hidden">
      <table className={cx('w-full text-sm', seatsAt ? 'min-w-[700px]' : 'min-w-[620px]')}>
        <thead>
          <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-faint">
            <th className="py-2 pl-1 font-medium">Course</th>
            <th className="py-2 font-medium">CRN</th>
            {seatsAt && <th className="py-2 pr-3 font-medium">Seats</th>}
            <th className="py-2 font-medium">Sec</th>
            <th className="py-2 font-medium">When</th>
            <th className="py-2 font-medium">Instructor</th>
            <th className="py-2 pr-1 font-medium">Where</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((s) => {
            const key = courseKey(s);
            const alt = view.alternates[s.crn];
            return (
              <tr
                key={s.crn}
                onClick={() => onSelect(selected === s.crn ? null : s)}
                className={cx('cursor-pointer border-b border-line/60 last:border-0 hover:bg-surface-2/60', selected === s.crn && 'bg-surface-2')}
                style={{ ['--h' as string]: hues[key] ?? 210 }}
              >
                <td className="py-2 pl-1">
                  <div className="flex items-center gap-2">
                    <span className="course-dot size-2 rounded-full" />
                    <span className="font-mono text-[13px] font-medium">{key}</span>
                    {s.type !== 'Lecture' && <span className="rounded bg-surface-2 px-1 text-[10px] text-muted">{s.type}</span>}
                  {auto(s) && <span className="rounded bg-accent-soft px-1 text-[10px] text-accent-text" title="Picked by the scheduler from your electives">auto</span>}
                  </div>
                  <div className="max-w-[220px] truncate pl-4 text-xs text-muted">{s.title}</div>
                </td>
                <td className="py-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      copyText(s.crn, `Copied CRN ${s.crn}`);
                    }}
                    className="rounded px-1 font-mono text-[13px] font-medium hover:bg-accent-soft hover:text-accent-text"
                    title="Copy CRN"
                  >
                    {s.crn}
                  </button>
                  {alt && (
                    <div className="px-1 text-[10px] text-faint" title="Identical time and instructor — use if the first is full">
                      <Alternates alt={alt} />
                    </div>
                  )}
                </td>
                {seatsAt && (
                  <td className="py-2 pr-3">
                    <SeatBadge s={s} />
                  </td>
                )}
                <td className="py-2 font-mono text-xs text-muted">{s.sec}</td>
                <td className="py-2 text-xs">
                  {s.m.length ? (
                    s.m.map((m, i) => (
                      <div key={i} className="whitespace-nowrap">
                        <span className="font-medium">{fmtDays(m.d)}</span> {fmtTime(m.s)}–{fmtTime(m.e)}
                        {m.dt && <span className="text-faint"> ({m.dt})</span>}
                      </div>
                    ))
                  ) : (
                    <span className="italic text-muted">No set time</span>
                  )}
                </td>
                <td className="max-w-[180px] truncate py-2 text-xs">{s.ins.length ? s.ins.join(', ') : <span className="text-faint">TBA</span>}</td>
                <td className="max-w-[160px] truncate py-2 pr-1 text-xs text-muted">
                  {[...new Set(s.m.map((m) => m.r).filter(Boolean))].join(', ') || s.campus}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    {view.missing.length > 0 && (
      <p className="mt-2 flex items-center gap-1.5 text-xs text-warn">
        <Icon name="alert" className="size-3.5" />
        CRN{view.missing.length > 1 ? 's' : ''} {view.missing.join(', ')} no longer listed on Banner this term.
      </p>
    )}
    </>
  );
}

/** Alternatives for the selected section that fit with the rest of the schedule. */
export function SwapPanel({
  view,
  index,
  selected,
  hues,
  options: poolOptions,
  onSwap,
  onClose,
}: {
  view: ScheduleView;
  index: TermIndex;
  selected: Section;
  hues: Record<string, number>;
  /** auto-picked electives: every allowed course of the pool instead of just this course's sections */
  options?: Section[];
  /** one or more [from, to] replacements applied together */
  onSwap: (changes: [Section, Section][]) => void;
  onClose: () => void;
}) {
  const filters = useStore((s) => s.filters);
  const key = courseKey(selected);
  const course = index.byKey.get(key);
  const others = view.sections.filter((s) => s.crn !== selected.crn);
  const physical = (c: string) => c !== 'Online' && c !== 'Other';
  const homeCampus = others.find((s) => physical(s.campus))?.campus;
  const isPool = !!poolOptions;
  const options = (poolOptions ?? course?.sections ?? [])
    .filter((s) => s.type === selected.type && s.crn !== selected.crn)
    .map((s) => {
      const clash = conflictsWith(s, others);
      const mismatch = creditMismatch(s, others, index);
      // blocked by one other class? offer to move that class too (ideally into this one's old slot)
      const otherCampus = !filters.mixCampuses && !!homeCampus && physical(s.campus) && s.campus !== homeCampus;
      const trade = (clash || mismatch) && !otherCampus ? findTrade(selected, s, view.sections, index, { profs: filters.profs, mixCampuses: filters.mixCampuses }) : null;
      return {
        s,
        clash,
        mismatch,
        trade,
        blocked: (!!clash || !!mismatch) && !trade,
        avoided: s.ins.some((n) => filters.profs[n] === 'avoid'),
        otherCampus,
      };
    })
    .sort(
      (a, b) =>
        Number(a.blocked) - Number(b.blocked) ||
        Number(!!a.trade) - Number(!!b.trade) ||
        Number(a.otherCampus) - Number(b.otherCampus) ||
        (a.s.m[0]?.s ?? 0) - (b.s.m[0]?.s ?? 0),
    );
  const when = (s: Section) => s.m.map((m) => `${fmtDays(m.d)} ${fmtTime(m.s)}`).join(', ') || 'no set time';

  return (
    <div id="class-details" className="animate-pop scroll-mt-20 rounded-xl border border-line bg-surface p-3" style={{ ['--h' as string]: hues[key] ?? 210 }}>
      {/* the tapped class in full: everything the calendar box has no room for */}
      <div className="mb-3 flex items-start gap-2.5 border-b border-line pb-3">
        <span className="course-dot mt-1.5 size-2.5 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="font-mono text-sm font-semibold">{key}</span>
            {selected.type !== 'Lecture' && <span className="rounded bg-surface-2 px-1 text-[10px] text-muted">{selected.type}</span>}
            <span className="text-[11px] text-faint">section {selected.sec}</span>
          </div>
          <div className="truncate text-xs text-muted">{selected.title}</div>
          <div className="mt-1.5 space-y-0.5 text-xs">
            {selected.m.length ? (
              selected.m.map((m, i) => (
                <div key={i}>
                  <b className="font-medium">{fmtDays(m.d)}</b> {fmtTime(m.s)}–{fmtTime(m.e)}
                  {m.r && <span className="text-muted"> · {m.r}</span>}
                  {m.dt && <span className="text-faint"> ({m.dt})</span>}
                </div>
              ))
            ) : (
              <div className="italic text-muted">No set time</div>
            )}
            <div className="text-muted">{selected.ins.length ? selected.ins.join(', ') : 'Instructor TBA'}</div>
            {selected.seats && <div className={cx('font-medium', SEAT_TONE[seatState(selected)])}>{seatLabel(selected)}</div>}
          </div>
        </div>
        <button
          onClick={() => copyText(selected.crn, `Copied CRN ${selected.crn}`)}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-surface-2 px-2 py-1 font-mono text-[13px] font-medium hover:bg-accent-soft"
          title="Copy CRN"
        >
          {selected.crn}
          <Icon name="copy" className="size-3.5 text-muted" />
        </button>
        <button onClick={onClose} className="shrink-0 rounded p-1 text-muted hover:text-ink" aria-label="Close">
          <Icon name="x" />
        </button>
      </div>
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-faint">
        <Icon name="swap" className="size-3.5" />
        {isPool ? `Swap for another ${selected.subj} course` : `Swap for another ${selected.type.toLowerCase()} section`}
      </div>
      {options.length === 0 && <p className="text-xs text-muted">No other sections of this {selected.type.toLowerCase()}.</p>}
      <div className="scrollbar-thin max-h-56 space-y-1 overflow-y-auto">
        {options.map(({ s, clash, mismatch, trade, blocked, avoided, otherCampus }) => (
          <button
            key={s.crn}
            disabled={blocked}
            onClick={() => onSwap(trade ? [[selected, s], [trade.from, trade.to]] : [[selected, s]])}
            title={trade ? `Also moves ${courseKey(trade.from)}${trade.from.type !== 'Lecture' ? ' ' + trade.from.type.toLowerCase() : ''} to section ${trade.to.sec} (${when(trade.to)}, CRN ${trade.to.crn})` : undefined}
            className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPool ? (
              <span className="w-[64px] shrink-0">
                <span className="block font-mono font-medium">{courseKey(s)}</span>
                <span className="block font-mono text-[10px] text-faint">sec {s.sec}</span>
              </span>
            ) : (
              <span className="w-8 font-mono text-muted">{s.sec}</span>
            )}
            <span className="min-w-0 flex-1 max-sm:min-w-[160px]">
              {isPool &&<span className="block truncate font-medium">{s.title}</span>}
              {s.m.length ? s.m.map((m, i) => <span key={i} className="mr-2 whitespace-nowrap"><b className="font-medium">{fmtDays(m.d)}</b> {fmtTime(m.s)}–{fmtTime(m.e)}</span>) : <i>No set time</i>}
              <span className={cx('block', avoided ? 'text-danger' : 'text-muted')}>
                {s.ins.join(', ') || 'TBA'} · {s.campus}
              </span>
            </span>
            {trade ? (
              <span className="shrink-0 rounded-md bg-accent-soft px-1.5 py-0.5 text-right text-[10px] leading-tight text-accent-text max-sm:ml-11 max-sm:text-left">
                <span className="flex items-center gap-1 font-medium sm:justify-end">
                  <Icon name="swap" className="size-3" />
                  {trade.exact ? 'Trade times' : 'Also move'} with {courseKey(trade.from)}
                  {trade.from.type !== 'Lecture' && ' ' + trade.from.type.toLowerCase()}
                </span>
                <span className="block opacity-80">→ {when(trade.to)}</span>
              </span>
            ) : clash ? (
              <span className="text-[10px] text-danger">clashes with {courseKey(clash)}</span>
            ) : mismatch ? (
              <span className="text-[10px] text-danger" title={`${courseKey(s)}'s lecture and lab credits must add up to the course total`}>
                credits don't pair with your {mismatch.type.toLowerCase()}
              </span>
            ) : otherCampus ? (
              <span className="text-[10px] text-warn" title={`Your other classes are in ${homeCampus}`}>
                {s.campus} campus · <span className="font-mono">{s.crn}</span>
              </span>
            ) : (
              <span className="flex shrink-0 flex-col items-end">
                <span className="font-mono text-faint">{s.crn}</span>
                {s.seats && <SeatBadge s={s} compact />}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

export function DatedSessions({ view, hues }: { view: ScheduleView; hues: Record<string, number> }) {
  const { list, clashes } = useMemo(() => datedSessions(view.sections), [view.sections]);
  const unscheduled = view.sections.filter((s) => !s.m.length);
  if (!list.length && !unscheduled.length) return null;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {list.length > 0 && (
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-faint">
            <Icon name="calendar" className="size-3.5" />
            Dated sessions <span className="normal-case tracking-normal">(usually finals)</span>
          </div>
          <div className="space-y-1">
            {list.map(({ s, m }, i) => {
              const clash = clashes.has(s.crn + m.dt);
              return (
                <div key={i} className={cx('flex items-center gap-2 rounded-md px-2 py-1 text-xs', clash ? 'bg-danger-soft text-danger' : 'bg-surface-2')} style={{ ['--h' as string]: hues[courseKey(s)] ?? 210 }}>
                  <span className="course-dot size-2 rounded-full" />
                  <span className="w-14 font-medium">{m.dt}</span>
                  <span className="font-mono">{courseKey(s)}</span>
                  <span className="flex-1 text-right tabular-nums">
                    {fmtTime(m.s)}–{fmtTime(m.e)}
                  </span>
                  {clash && <Icon name="alert" className="size-3.5" />}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {unscheduled.length > 0 && (
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-faint">
            <Icon name="clock" className="size-3.5" />
            No set time
          </div>
          <div className="space-y-1">
            {unscheduled.map((s) => (
              <div key={s.crn} className="flex items-center gap-2 rounded-md bg-surface-2 px-2 py-1 text-xs" style={{ ['--h' as string]: hues[courseKey(s)] ?? 210 }}>
                <span className="course-dot size-2 rounded-full" />
                <span className="font-mono">{courseKey(s)}</span>
                <span className="flex-1 truncate text-muted">{s.type} · {s.campus}</span>
                <span className="font-mono text-faint">{s.crn}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function CopyCrnsButton({ crns, label = 'Copy CRNs' }: { crns: string[]; label?: string }) {
  const sep = useStore((s) => s.separator);
  return (
    <button
      onClick={() => copyText(joinCrns(crns, sep), `Copied ${crns.length} CRNs`)}
      className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3.5 text-sm font-medium text-white hover:bg-accent-strong dark:text-[#04130d]"
    >
      <Icon name="copy" />
      {label}
    </button>
  );
}
