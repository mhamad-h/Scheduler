import { useMemo, useState } from 'react';
import type { Section } from '../data/types.ts';
import type { Filters, PoolConfig } from '../solver/model.ts';
import { poolCourses } from '../solver/pool.ts';
import { useStore } from '../state/store.ts';
import { cx, Icon, IconButton, Segmented } from './ui.tsx';

const MAX = 4;

/** "Add N LAS": the scheduler chooses which LAS courses to take based on what fits best. */
export function PoolCard({ pool, sections, takenKeys, hue, filters, usable }: { pool: PoolConfig; sections: Section[]; takenKeys: string[]; hue: number; filters: Filters; usable?: number }) {
  const [open, setOpen] = useState(false);
  const { updatePool, removePool } = useStore.getState();

  // every topic this pool could use (honors setting applied), with how many sections pass the campus filter
  const all = useMemo(() => poolCourses(sections, pool, takenKeys), [sections, pool, takenKeys]);
  const included = all.filter((c) => !pool.excluded.includes(c.key));
  const campusOk = (s: Section) => !filters.campuses.length || filters.campuses.includes(s.campus);
  const short = included.length < pool.count;

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface" style={{ ['--h' as string]: hue }}>
      <div className="flex items-center gap-2.5 py-2 pl-3 pr-1.5">
        <span className="course-dot size-2.5 shrink-0 rounded-full" />
        <button className="min-w-0 flex-1 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <div className="flex items-center gap-2">
            <span className="whitespace-nowrap font-mono text-[13px] font-medium">{pool.subj} electives</span>
            <span className="whitespace-nowrap rounded bg-accent-soft px-1.5 text-[10px] font-medium uppercase tracking-wide text-accent-text">auto-pick</span>
          </div>
          <div className="truncate text-xs text-muted">The scheduler picks the topics that fit best</div>
        </button>
        <IconButton icon={open ? 'chevronUp' : 'chevronDown'} label={open ? 'Collapse' : 'Choose topics'} onClick={() => setOpen((o) => !o)} />
        <IconButton icon="x" label={`Remove ${pool.subj} electives`} onClick={() => removePool(pool.id)} />
      </div>

      <div className="flex items-center gap-2 px-3 pb-2.5">
        <div className="flex shrink-0 items-center rounded-lg bg-surface-2" title={`How many ${pool.subj} courses`}>
          <button
            className="grid size-7 place-items-center rounded-lg text-muted hover:text-ink disabled:opacity-30"
            disabled={pool.count <= 1}
            onClick={() => updatePool(pool.id, { count: pool.count - 1 })}
            aria-label={`One fewer ${pool.subj}`}
          >
            −
          </button>
          <span className="w-10 text-center text-sm font-semibold tabular-nums">× {pool.count}</span>
          <button
            className="grid size-7 place-items-center rounded-lg text-muted hover:text-ink disabled:opacity-30"
            disabled={pool.count >= MAX}
            onClick={() => updatePool(pool.id, { count: pool.count + 1 })}
            aria-label={`One more ${pool.subj}`}
          >
            +
          </button>
        </div>
        <Segmented
          className="min-w-0 flex-1"
          value={pool.honors}
          onChange={(v) => updatePool(pool.id, { honors: v })}
          options={[
            { value: 'regular', label: 'Regular', title: 'Only non-honors sections' },
            { value: 'honors', label: 'Honors', title: 'Only honors (H) sections' },
            { value: 'either', label: 'Either', title: 'Honors or regular — never both versions of one topic' },
          ]}
        />
      </div>
      <div className="px-3 pb-2.5">
        <div className={cx('text-[11px]', short ? 'text-danger' : 'text-faint')}>
          {included.length} topic{included.length === 1 ? '' : 's'} to choose from
          {usable !== undefined && usable !== included.length && <> · {usable} fit your filters</>}
          {short && ` — need at least ${pool.count}`}
        </div>
      </div>

      {open && (
        <div className="border-t border-line bg-surface-2/40 px-3 py-3">
          <div className="mb-1.5 flex items-center justify-between text-[11px] font-medium uppercase tracking-wide text-faint">
            <span>Allowed topics</span>
            <span className="flex gap-2 normal-case tracking-normal">
              <button className="text-accent-text hover:underline" onClick={() => updatePool(pool.id, { excluded: [] })}>
                all
              </button>
              <button className="text-muted hover:underline" onClick={() => updatePool(pool.id, { excluded: all.map((c) => c.key) })}>
                none
              </button>
            </span>
          </div>
          <p className="mb-2 text-[11px] text-muted">Untick topics you've already taken or don't want.</p>
          <div className="overflow-hidden rounded-lg border border-line bg-surface">
            {all.map((c) => {
              const on = !pool.excluded.includes(c.key);
              const n = c.sections.filter((i) => campusOk(sections[i])).length;
              return (
                <label key={c.key} className={cx('flex cursor-pointer items-center gap-2.5 border-b border-line px-2.5 py-2 text-xs last:border-0', !on && 'opacity-50')}>
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--accent)]"
                    checked={on}
                    onChange={() => updatePool(pool.id, { excluded: on ? [...pool.excluded, c.key] : pool.excluded.filter((k) => k !== c.key) })}
                  />
                  <span className="w-[62px] shrink-0 font-mono text-[12px] font-medium">{c.key}</span>
                  <span className="min-w-0 flex-1 truncate">{c.title}</span>
                  <span className={cx('tabular-nums', n ? 'text-faint' : 'text-danger')} title="Sections on your campus">
                    {n}
                  </span>
                </label>
              );
            })}
            {all.length === 0 && <div className="px-3 py-4 text-center text-xs text-muted">No {pool.subj} courses match this setting.</div>}
          </div>
        </div>
      )}
    </div>
  );
}

/** Quick-add chip shown under the search box. */
export function AddPoolButton({ subj, onAdd }: { subj: string; onAdd: () => void }) {
  return (
    <button onClick={onAdd} className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-line px-3 py-1.5 text-xs text-muted hover:border-accent hover:text-accent-text">
      <Icon name="sparkle" className="size-3.5" />
      Add {subj} electives (auto-pick)
    </button>
  );
}
