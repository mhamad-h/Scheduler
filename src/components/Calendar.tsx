import { useMemo } from 'react';
import type { Meeting, Section } from '../data/types.ts';
import { courseKey, DAY_NAMES, fmtTime } from '../data/types.ts';
import type { TimeBlock } from '../solver/model.ts';
import { cx, Icon } from './ui.tsx';
import { seatLabel, seatShort, seatState } from '../lib/seats.ts';
import type { SeatState } from '../lib/seats.ts';

/** Pill colours: a solid chip so seat numbers read as their own label, never part of the course text. */
const PILL: Record<SeatState, string> = {
  open: 'bg-surface text-accent-text',
  low: 'bg-surface text-warn',
  full: 'bg-danger text-white',
  closed: 'bg-danger text-white',
  unknown: '',
};
const DOT: Record<SeatState, string> = { open: 'bg-accent', low: 'bg-warn', full: 'bg-danger', closed: 'bg-danger', unknown: '' };

/**
 * Seat chip sized by the block it sits in (a CSS container):
 *   <96px   → just the coloured number ("6", red "0" when full/closed)
 *   ≥96px   → seat icon + number
 *   ≥112px  → "6 left" / "Full" / "Closed"
 */
function SeatPill({ s }: { s: Section }) {
  const st = seatState(s);
  const open = st === 'open' || st === 'low';
  return (
    <span className={cx('inline-flex shrink-0 items-center gap-0.5 rounded px-1 text-[9.5px] font-semibold leading-[14px] tabular-nums shadow-sm', PILL[st])}>
      {open ? (
        <>
          <Icon name="seat" className="hidden size-2.5 @[96px]:inline" strokeWidth={2.2} />
          {s.seats![2]}
          <span className="hidden @[112px]:inline"> left</span>
        </>
      ) : (
        <>
          <Icon name="seat" className="hidden size-2.5 @[96px]:inline @[112px]:hidden" strokeWidth={2.2} />
          <span className="@[112px]:hidden">0</span>
          <span className="hidden @[112px]:inline">{seatShort(s)}</span>
        </>
      )}
    </span>
  );
}

interface Block {
  s: Section;
  m: Meeting;
  day: number;
  lane: number;
  lanes: number;
}

export function Calendar({
  sections,
  hues,
  blocked = [],
  selected,
  onSelect,
  hourHeight = 52,
}: {
  sections: Section[];
  hues: Record<string, number>;
  blocked?: TimeBlock[];
  selected?: string | null;
  onSelect?: (s: Section) => void;
  hourHeight?: number;
}) {
  const { days, start, end, blocks } = useMemo(() => {
    let lo = 8 * 60, hi = 17 * 60, sat = false, sun = false;
    const perDay: Block[][] = Array.from({ length: 7 }, () => []);
    for (const s of sections)
      for (const m of s.m)
        for (let d = 0; d < 7; d++)
          if (m.d & (1 << d)) {
            perDay[d].push({ s, m, day: d, lane: 0, lanes: 1 });
            lo = Math.min(lo, m.s);
            hi = Math.max(hi, m.e);
            if (d === 5) sat = true;
            if (d === 6) sun = true;
          }
    for (const b of blocked) if (b.day === 5) sat = true;
    // lanes for overlapping blocks (only possible in hand-edited schedules)
    for (const list of perDay) {
      list.sort((a, b) => a.m.s - b.m.s);
      const laneEnds: number[] = [];
      for (const b of list) {
        let l = laneEnds.findIndex((e) => e <= b.m.s);
        if (l < 0) l = laneEnds.push(0) - 1;
        laneEnds[l] = b.m.e;
        b.lane = l;
      }
      for (const b of list) b.lanes = list.filter((o) => o.m.s < b.m.e && b.m.s < o.m.e).length > 1 ? laneEnds.length : 1;
    }
    const days = [0, 1, 2, 3, 4, ...(sat || sun ? [5] : []), ...(sun ? [6] : [])];
    return { days, start: Math.floor(lo / 60) * 60, end: Math.ceil(hi / 60) * 60, blocks: perDay };
  }, [sections, blocked]);

  const hours = Array.from({ length: (end - start) / 60 }, (_, i) => start + i * 60);
  const y = (min: number) => ((min - start) / 60) * hourHeight;
  const height = y(end);

  return (
    <div className="scrollbar-thin overflow-x-auto">
      <div className="[--cal-label:34px] sm:min-w-[560px] sm:[--cal-label:48px]">
        <div className="grid" style={{ gridTemplateColumns: `var(--cal-label) repeat(${days.length}, minmax(0, 1fr))` }}>
          <div />
          {days.map((d) => (
            <div key={d} className="pb-2 text-center text-xs font-medium text-muted">
              {DAY_NAMES[d]}
            </div>
          ))}
        </div>
        <div className="relative grid" style={{ gridTemplateColumns: `var(--cal-label) repeat(${days.length}, minmax(0, 1fr))`, height }}>
          {/* hour labels */}
          <div className="relative">
            {hours.map((h) => (
              <div key={h} className="absolute right-1.5 -translate-y-1/2 text-[10px] tabular-nums text-faint sm:right-2" style={{ top: y(h) }}>
                {h > start ? fmtTime(h).replace(':00', '') : ''}
              </div>
            ))}
          </div>
          {days.map((d) => (
            <div key={d} className="relative border-l border-line">
              {hours.map((h) => (
                <div key={h} className="absolute inset-x-0 border-t border-line/70" style={{ top: y(h) }} />
              ))}
              {hours.map((h) => (
                <div key={`h${h}`} className="absolute inset-x-0 border-t border-dashed border-line/40" style={{ top: y(h + 30) }} />
              ))}
              {blocked
                .filter((b) => b.day === d && b.e > start && b.s < end)
                .map((b, i) => (
                  <div key={i} className="hatch absolute inset-x-0 opacity-70" style={{ top: y(Math.max(b.s, start)), height: y(Math.min(b.e, end)) - y(Math.max(b.s, start)) }} title="Blocked" />
                ))}
              {blocks[d].map((b) => {
                const key = courseKey(b.s);
                const h = y(b.m.e) - y(b.m.s);
                const w = 100 / b.lanes;
                const isSel = selected === b.s.crn;
                const seat = seatState(b.s);
                const hasSeats = seat !== 'unknown';
                // Where the seats go is decided by each block's real width (it is a CSS container):
                //  - ≥80px wide: a chip at the right of the title row (compact under 112px). The course code never
                //    shrinks; if code + chip ever don't fit, the chip wraps below the code instead of being clipped.
                //  - <80px (phones): a coloured dot in the corner, text padded clear of it — so room and instructor
                //    keep their lines. Only long blocks (labs) have room for a chip line on top of everything else.
                const seatLine = hasSeats && h >= 90;
                const seatDot = hasSeats && !seatLine;
                return (
                  <button
                    key={`${b.s.crn}-${b.m.s}`}
                    onClick={() => onSelect?.(b.s)}
                    className={cx(
                      'course-block group @container absolute overflow-hidden rounded-md px-1 py-0.5 text-left transition-shadow hover:z-10 hover:shadow-lg sm:px-1.5 sm:py-1',
                      isSel && 'z-10 ring-2 ring-[hsl(var(--h)_70%_var(--block-border-l))]',
                    )}
                    style={{ ['--h' as string]: hues[key] ?? 210, top: y(b.m.s) + 1, height: h - 2, left: `calc(${b.lane * w}% + 2px)`, width: `calc(${w}% - 4px)` }}
                    title={`${key} ${b.s.type} · ${b.s.title}\n${fmtTime(b.m.s)}–${fmtTime(b.m.e)}${b.m.r ? ' · ' + b.m.r : ''}\n${b.s.ins.join(', ') || 'Instructor TBA'}\nCRN ${b.s.crn} · Section ${b.s.sec}${b.m.dt ? '\n' + b.m.dt : ''}${hasSeats ? '\n' + seatLabel(b.s) : ''}`}
                  >
                    <div className={cx('flex flex-wrap items-center gap-x-1 max-sm:hidden', seatDot && '@max-[80px]:pr-2')}>
                      {/* the course code always stays whole; only the type (· Lab) shortens */}
                      <span className="shrink-0 text-[11px] font-semibold leading-tight">{key}</span>
                      <span className="min-w-0 flex-1 basis-0 truncate text-[11px] font-normal leading-tight opacity-80">{b.s.type !== 'Lecture' && <>· {b.s.type}</>}</span>
                      {hasSeats && (
                        <span className="ml-auto hidden @[80px]:inline-flex">
                          <SeatPill s={b.s} />
                        </span>
                      )}
                    </div>
                    {seatDot && (
                      <span className={cx('absolute right-1 top-1 size-1.5 rounded-full ring-1 ring-[var(--surface)] @[80px]:hidden', DOT[seat])} aria-hidden />
                    )}
                    {/* phones: narrow columns, so stack subject / number and abbreviate the type */}
                    <div className={cx('text-[10px] font-semibold leading-[1.15] tracking-tight sm:hidden', seatDot && 'pr-1.5')}>
                      <div className="truncate">{b.s.subj}</div>
                      <div className="truncate">
                        {b.s.num}
                        {b.s.type !== 'Lecture' && <span className="font-normal opacity-80"> {shortType(b.s.type)}</span>}
                      </div>
                    </div>
                    {h > 30 && (
                      <div className="truncate text-[10px] leading-tight opacity-80">
                        <span className="max-sm:hidden">
                          {fmtTime(b.m.s)}–{fmtTime(b.m.e)}
                        </span>
                        <span className="sm:hidden">{fmtTime(b.m.s).replace(/(am|pm)$/, '')}</span>
                      </div>
                    )}
                    {seatLine && (
                      <div className="mt-0.5 flex @[80px]:hidden">
                        <SeatPill s={b.s} />
                      </div>
                    )}
                    {/* desktop: full room and instructor */}
                    {h > 46 && b.m.r && <div className="truncate text-[10px] leading-tight opacity-70 max-sm:hidden">{b.m.r}</div>}
                    {h > 60 && <div className="truncate text-[10px] leading-tight opacity-70 max-sm:hidden">{b.s.ins[0] ?? 'TBA'}</div>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const SHORT_TYPES: Record<string, string> = { Recitation: 'Rec', Tutorial: 'Tut', Language: 'Lang', Seminar: 'Sem', Studio: 'Stu', Internship: 'Int', Workshop: 'Wksp', Project: 'Proj' };
const shortType = (t: string) => SHORT_TYPES[t] ?? (t.length > 4 ? t.slice(0, 4) : t);

/** Tiny SVG week for result cards and slots. */
export function MiniWeek({ sections, hues, className }: { sections: Section[]; hues: Record<string, number>; className?: string }) {
  const S = 8 * 60, E = 20 * 60;
  const sat = sections.some((s) => s.m.some((m) => m.d & 32));
  const cols = sat ? 6 : 5;
  const W = 100, H = 60, cw = W / cols;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={cx('rounded-md bg-surface-2', className)} preserveAspectRatio="none" aria-hidden>
      {Array.from({ length: cols - 1 }, (_, i) => (
        <line key={i} x1={(i + 1) * cw} x2={(i + 1) * cw} y1={0} y2={H} stroke="var(--border)" strokeWidth={0.5} />
      ))}
      {sections.flatMap((s) =>
        s.m.flatMap((m, mi) =>
          Array.from({ length: cols }, (_, d) =>
            m.d & (1 << d) ? (
              <rect
                key={`${s.crn}-${mi}-${d}`}
                x={d * cw + 1.2}
                y={((Math.max(m.s, S) - S) / (E - S)) * H}
                width={cw - 2.4}
                height={Math.max(2, ((Math.min(m.e, E) - Math.max(m.s, S)) / (E - S)) * H)}
                rx={1.2}
                fill={`hsl(${hues[courseKey(s)] ?? 210} 70% var(--block-border-l))`}
                opacity={0.85}
              />
            ) : null,
          ),
        ),
      )}
    </svg>
  );
}
