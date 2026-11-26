import { fmtDays } from '../data/types.ts';
import { useStore } from '../state/store.ts';
import { cx } from './ui.tsx';

const bits = (n: number) => n.toString(2).replace(/0/g, '').length;
const short = (n: number) => (n >= 10000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

/**
 * "Which days would I be on campus?" — every weekly pattern the valid schedules use (MWF, TR, MTWRF…),
 * fewest days first. Clicking one shows only the schedules on exactly those days; all patterns stay
 * listed (their counts ignore this choice) so you can switch between them.
 */
export function DayPatterns({ patterns, dayPattern }: { patterns: Record<number, number>; dayPattern: number }) {
  const setFilters = useStore((s) => s.setFilters);
  const list = Object.entries(patterns)
    .map(([m, n]) => ({ mask: Number(m), n }))
    .filter((p) => p.mask > 0)
    .sort((a, b) => bits(a.mask) - bits(b.mask) || b.n - a.n);
  if (!list.length && !dayPattern) return null;
  const shown = list.slice(0, 7);
  // the chosen pattern stays visible even if it falls outside the first 7 (or no longer has schedules)
  if (dayPattern && !shown.some((p) => p.mask === dayPattern)) shown.push({ mask: dayPattern, n: patterns[dayPattern] ?? 0 });

  return (
    <div className="scrollbar-thin scrollbar-none-sm -mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-1 max-sm:-mx-4 max-sm:px-4">
      <span className="shrink-0 text-[11px] text-faint">Days</span>
      <button
        onClick={() => setFilters({ dayPattern: 0 })}
        className={cx(
          'shrink-0 rounded-full border px-2.5 py-1 text-[11px] transition-colors',
          !dayPattern ? 'border-accent bg-accent-soft text-accent-text' : 'border-line bg-surface text-muted hover:text-ink',
        )}
        title="Schedules on any days"
      >
        Any
      </button>
      {shown.map(({ mask, n }) => {
        const on = dayPattern === mask;
        return (
          <button
            key={mask}
            onClick={() => setFilters({ dayPattern: on ? 0 : mask })}
            title={`${n.toLocaleString()} schedule${n === 1 ? '' : 's'} on exactly ${fmtDays(mask)} (${bits(mask)} day${bits(mask) === 1 ? '' : 's'})${on ? ' — click again for any days' : ''}`}
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
