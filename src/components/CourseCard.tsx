import { useMemo, useState } from 'react';
import type { Course } from '../data/load.ts';
import type { Section } from '../data/types.ts';
import { fmtDays, fmtTime } from '../data/types.ts';
import type { CourseConfig, Filters, ProfPref } from '../solver/model.ts';
import { useStore } from '../state/store.ts';
import { cx, Icon, IconButton, Toggle } from './ui.tsx';

export function CourseCard({ course, config, hue, filters, stat }: { course: Course | undefined; config: CourseConfig; hue: number; filters: Filters; stat?: { before: number; after: number } }) {
  const [open, setOpen] = useState(false);
  const { removeCourse, updateCourse, toggleCrn, setProf } = useStore.getState();
  const profs = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of course?.sections ?? []) for (const n of s.ins) m.set(n, (m.get(n) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [course]);

  if (!course) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-dashed border-line px-3 py-2.5 text-sm text-muted">
        <span className="font-mono">{config.key}</span>
        <span className="flex-1 text-xs">not offered this term</span>
        <IconButton icon="x" label="Remove" onClick={() => removeCourse(config.key)} />
      </div>
    );
  }

  const usable = stat ? stat.after : course.sections.length;
  const locked = config.lockedCrns.filter((c) => course.sections.some((s) => s.crn === c)).length;

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface" style={{ ['--h' as string]: hue }}>
      <div className="flex items-center gap-2.5 py-2 pl-3 pr-1.5">
        <span className="course-dot size-2.5 shrink-0 rounded-full" />
        <button className="min-w-0 flex-1 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-[13px] font-medium">{course.key}</span>
            {config.optional && <span className="rounded bg-surface-2 px-1.5 text-[10px] font-medium uppercase tracking-wide text-muted">optional</span>}
          </div>
          <div className="truncate text-xs text-muted">{course.title}</div>
        </button>
        <span
          className={cx('rounded-md px-1.5 py-0.5 text-[11px] tabular-nums', usable === 0 ? 'bg-danger-soft text-danger' : 'text-muted')}
          title={`${usable} of ${course.sections.length} sections pass your filters`}
        >
          {locked ? (
            <span className="inline-flex items-center gap-1 text-accent-text">
              <Icon name="lock" className="size-3" />
              locked
            </span>
          ) : (
            <>
              {usable}/{course.sections.length}
            </>
          )}
        </span>
        <IconButton icon={open ? 'chevronUp' : 'chevronDown'} label={open ? 'Collapse' : 'Options'} onClick={() => setOpen((o) => !o)} />
        <IconButton icon="x" label={`Remove ${course.key}`} onClick={() => removeCourse(course.key)} />
      </div>

      {open && (
        <div className="space-y-3 border-t border-line bg-surface-2/40 px-3 py-3">
          <Toggle checked={config.optional} onChange={(v) => updateCourse(course.key, { optional: v })} label="Optional — drop it if it doesn't fit" />

          {course.types.length > 1 && (
            <div>
              <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-faint">Components</div>
              <div className="flex flex-wrap gap-1.5">
                {course.types.map((t) => {
                  const on = !config.skipTypes.includes(t);
                  return (
                    <button
                      key={t}
                      onClick={() => updateCourse(course.key, { skipTypes: on ? [...config.skipTypes, t] : config.skipTypes.filter((x) => x !== t) })}
                      className={cx('flex items-center gap-1 rounded-md border px-2 py-1 text-xs', on ? 'border-accent/40 bg-accent-soft text-accent-text' : 'border-line text-muted line-through')}
                    >
                      {on && <Icon name="check" className="size-3" />}
                      {t}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {profs.length > 0 && (
            <div>
              <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-faint">Professors</div>
              <div className="space-y-1">
                {profs.map(([name, n]) => (
                  <ProfRow key={name} name={name} count={n} pref={filters.profs[name]} onChange={(p) => setProf(name, p)} />
                ))}
              </div>
              {course.sections.some((s) => !s.ins.length) && <p className="mt-1 text-[11px] text-faint">Some sections list the instructor as TBA.</p>}
            </div>
          )}

          <div>
            <div className="mb-1.5 flex items-center justify-between text-[11px] font-medium uppercase tracking-wide text-faint">
              <span>Sections</span>
              {(config.excludedCrns.length > 0 || config.lockedCrns.length > 0) && (
                <button className="normal-case tracking-normal text-accent-text hover:underline" onClick={() => updateCourse(course.key, { excludedCrns: [], lockedCrns: [] })}>
                  reset
                </button>
              )}
            </div>
            <div className="space-y-2">
              {course.types
                .filter((t) => !config.skipTypes.includes(t))
                .map((t) => (
                  <div key={t}>
                    {course.types.length > 1 && <div className="mb-1 text-xs font-medium text-muted">{t}</div>}
                    <div className="overflow-hidden rounded-lg border border-line bg-surface">
                      {course.sections
                        .filter((s) => s.type === t)
                        .map((s) => (
                          <SectionRow
                            key={s.crn}
                            s={s}
                            excluded={config.excludedCrns.includes(s.crn)}
                            locked={config.lockedCrns.includes(s.crn)}
                            filteredOut={!passes(s, filters)}
                            onExclude={() => toggleCrn(course.key, s.crn, 'excludedCrns')}
                            onLock={() => {
                              // only one locked CRN per component
                              const others = course.sections.filter((x) => x.type === t && x.crn !== s.crn).map((x) => x.crn);
                              updateCourse(course.key, { lockedCrns: config.lockedCrns.filter((c) => !others.includes(c)) });
                              toggleCrn(course.key, s.crn, 'lockedCrns');
                            }}
                          />
                        ))}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function passes(s: Section, f: Filters) {
  if (f.campuses.length && !f.campuses.includes(s.campus)) return false;
  if (s.ins.some((n) => f.profs[n] === 'avoid')) return false;
  for (const m of s.m) {
    if (m.d & f.daysOff) return false;
    if (f.earliest !== null && m.s < f.earliest) return false;
    if (f.latest !== null && m.e > f.latest) return false;
    for (const b of f.blocked) if (m.d & (1 << b.day) && m.s < b.e && b.s < m.e) return false;
  }
  return true;
}

function ProfRow({ name, count, pref, onChange }: { name: string; count: number; pref?: ProfPref; onChange: (p: ProfPref | null) => void }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className={cx('min-w-0 flex-1 truncate', pref === 'avoid' && 'text-faint line-through', pref === 'prefer' && 'font-medium text-accent-text')}>{name}</span>
      <span className="text-[11px] tabular-nums text-faint">{count}</span>
      <div className="flex rounded-md bg-surface-2 p-0.5">
        <button
          title="Prefer"
          onClick={() => onChange(pref === 'prefer' ? null : 'prefer')}
          className={cx('rounded px-2 py-1.5 sm:px-1.5 sm:py-0.5', pref === 'prefer' ? 'bg-accent text-white dark:text-[#04130d]' : 'text-faint hover:text-ink')}
        >
          <Icon name="thumbUp" className="size-3.5" />
        </button>
        <button
          title="Avoid (remove their sections)"
          onClick={() => onChange(pref === 'avoid' ? null : 'avoid')}
          className={cx('rounded px-2 py-1.5 sm:px-1.5 sm:py-0.5', pref === 'avoid' ? 'bg-danger text-white dark:text-[#1a0505]' : 'text-faint hover:text-ink')}
        >
          <Icon name="ban" className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

function SectionRow({ s, excluded, locked, filteredOut, onExclude, onLock }: { s: Section; excluded: boolean; locked: boolean; filteredOut: boolean; onExclude: () => void; onLock: () => void }) {
  return (
    <div className={cx('flex items-center gap-2 border-b border-line px-2 py-1.5 text-xs last:border-0', (excluded || filteredOut) && !locked && 'opacity-45', locked && 'bg-accent-soft/60')}>
      <span className="w-9 shrink-0 font-mono text-[11px] text-muted">{s.sec}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate">
          {s.m.length ? s.m.map((m, i) => (
            <span key={i} className="mr-2 whitespace-nowrap">
              <span className="font-medium">{fmtDays(m.d)}</span> {fmtTime(m.s)}–{fmtTime(m.e)}
            </span>
          )) : <span className="italic text-muted">time TBA</span>}
        </span>
        <span className="block truncate text-muted">
          {s.ins.length ? s.ins.join(', ') : 'Instructor TBA'} · {s.campus}
        </span>
      </span>
      <span className="font-mono text-[10px] text-faint">{s.crn}</span>
      <button onClick={onLock} title={locked ? 'Unlock' : 'Lock this section (always use it)'} className={cx('rounded p-2 sm:p-1', locked ? 'text-accent-text' : 'text-faint hover:text-ink')}>
        <Icon name="lock" className="size-3.5" />
      </button>
      <button onClick={onExclude} title={excluded ? 'Include again' : 'Exclude this section'} className={cx('rounded p-2 sm:p-1', excluded ? 'text-danger' : 'text-faint hover:text-ink')}>
        <Icon name="eyeOff" className="size-3.5" />
      </button>
    </div>
  );
}
