import { fmtDays } from '../data/types.ts';
import { useStore } from '../state/store.ts';
import { cx } from './ui.tsx';

const WEEK = 0b111111; // Mon..Sat
const bits = (n: number) => n.toString(2).replace(/0/g, '').length;
const short = (n: number) => (n >= 10000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

/**
 * "Which days would I be on campus?" — every weekly pattern the valid schedules use (MWF, TR, MTWRF…),
 * fewest days first. Clicking one keeps only schedules inside that pattern (by marking the other days off).
 */
export function DayPatterns({ patterns, daysOff }: { patterns: Record<number, number>; daysOff: number }) {
  const setFilters = useStore((s) => s.setFilters);
  const list = Object.entries(patterns)
    .map(([m, n]) => ({ mask: Number(m), n }))
    .filter((p) => p.mask > 0)
    .sort((a, b) => bits(a.mask) - bits(b.mask) || b.n - a.n);
  const activeMask = daysOff ? WEEK & ~daysOff : 0;
  if (!list.length && !activeMask) return null;
  const shown = list.slice(0, 7);

  return (
    <div className="scrollbar-thin scrollbar-none-sm -mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-1 max-sm:-mx-4 max-sm:px-4">
      <span className="shrink-0 text-[11px] text-faint">Days</span>
      {activeMask > 0 && (
        <button
          onClick={() => setFilters({ daysOff: 0 })}
          className="shrink-0 rounded-full border border-line px-2.5 py-1 text-[11px] text-muted hover:text-ink"
          title="Show schedules on any days"
        >
          Any days
        </button>
      )}
      {shown.map(({ mask, n }) => {
        const on = activeMask === mask;
        return (
          <button
            key={mask}
            onClick={() => setFilters({ daysOff: on ? 0 : WEEK & ~mask })}
            title={`${n.toLocaleString()} schedules on ${fmtDays(mask)} only (${bits(mask)} day${bits(mask) === 1 ? '' : 's'})`}
            className={cx(
              'inline-flex shrink-0 items-baseline gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors',
              on ? 'border-accent bg-accent-soft text-accent-text' : 'border-line bg-surface text-muted hover:text-ink',
            )}
          >
            <span className="font-mono font-semibold tracking-wide">{fmtDays(mask)}</span>
            <span className="tabular-nums opacity-75">{short(n)}</span>
          </button>
        );
      })}
    </div>
  );
}
