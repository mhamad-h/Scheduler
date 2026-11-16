import type { Filters } from '../solver/model.ts';
import { useStore } from '../state/store.ts';
import { cx, Icon } from './ui.tsx';

type Choice = string; // a campus name, or 'either'

/**
 * The one campus setting for everything: search counts, solver, swaps.
 *  - a campus: only that campus's sections (+ online if allowed)
 *  - either:   both campuses, but each schedule stays on one of them (unless mixing is allowed)
 */
export function CampusPicker({ filters, campuses, counts }: { filters: Filters; campuses: string[]; counts: Record<string, number> }) {
  const setFilters = useStore((s) => s.setFilters);
  const physical = campuses.filter((c) => c !== 'Online' && c !== 'Other');
  const hasOnline = campuses.includes('Online');
  const chosen = filters.campuses.filter((c) => c !== 'Online');
  const choice: Choice = chosen.length === 1 ? chosen[0] : 'either';
  const online = filters.campuses.length === 0 || filters.campuses.includes('Online');

  const apply = (c: Choice, withOnline = online) => {
    if (c === 'either') setFilters({ campuses: withOnline ? [] : physical });
    else setFilters({ campuses: withOnline && hasOnline ? [c, 'Online'] : [c] });
  };

  const options: { id: Choice; title: string; sub: string; icon: string }[] = [
    ...physical.map((c) => ({ id: c, title: c, sub: `${(counts[c] ?? 0).toLocaleString()} sections`, icon: 'pin' })),
    { id: 'either', title: 'Either', sub: filters.mixCampuses ? 'mix freely' : 'one per schedule', icon: 'swap' },
  ];

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Campus</h2>
        <span className="text-[11px] text-faint">applies to every course</span>
      </div>
      <div role="radiogroup" aria-label="Campus" className={cx('grid gap-1.5', options.length === 3 ? 'grid-cols-3' : 'grid-cols-2')}>
        {options.map((o) => {
          const on = choice === o.id;
          return (
            <button
              key={o.id}
              role="radio"
              aria-checked={on}
              onClick={() => apply(o.id)}
              className={cx(
                'flex flex-col items-start gap-0.5 rounded-xl border px-3 py-2.5 text-left transition-colors',
                on ? 'border-accent bg-accent-soft text-accent-text ring-1 ring-accent' : 'border-line bg-surface hover:border-line-strong',
              )}
            >
              <span className="flex w-full items-center justify-between">
                <span className={cx('text-sm font-semibold', on ? '' : 'text-ink')}>{o.title}</span>
                <span className={cx('grid size-4 place-items-center rounded-full border', on ? 'border-accent bg-accent' : 'border-line-strong')}>
                  {on && <Icon name="check" className="size-2.5 text-white dark:text-[#04130d]" strokeWidth={3} />}
                </span>
              </span>
              <span className={cx('text-[11px]', on ? 'opacity-80' : 'text-muted')}>{o.sub}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-muted">
        {choice === 'either'
          ? filters.mixCampuses
            ? 'Schedules may combine Beirut and Byblos classes.'
            : 'You get the best schedules from both campuses — each one stays on a single campus.'
          : `Only ${choice} sections are used${online && hasOnline ? ', plus online ones' : ''}.`}
      </p>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
        {hasOnline && (
          <label className="flex cursor-pointer items-center gap-2 text-xs">
            <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={online} onChange={(e) => apply(choice, e.target.checked)} />
            Include online sections
          </label>
        )}
        {choice === 'either' && physical.length > 1 && (
          <label className="flex cursor-pointer items-center gap-2 text-xs">
            <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={!!filters.mixCampuses} onChange={(e) => setFilters({ mixCampuses: e.target.checked })} />
            Allow mixing in one schedule
          </label>
        )}
      </div>
    </div>
  );
}
