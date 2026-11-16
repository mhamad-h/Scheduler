import { useEffect, useRef, useState } from 'react';
import { DAY_NAMES, fmtTime } from '../data/types.ts';
import type { Filters, TimeBlock } from '../solver/model.ts';
import { DEFAULT_FILTERS, useStore } from '../state/store.ts';
import { cx, Icon, Segmented, Toggle } from './ui.tsx';

const TIME_OPTIONS = Array.from({ length: 29 }, (_, i) => 7 * 60 + i * 30); // 7:00 .. 21:00

// Campus lives in its own picker (CampusPicker) at the top of the page; this panel holds the rest.
export function FiltersPanel({ filters }: { filters: Filters }) {
  const { setFilters, setProf } = useStore.getState();
  const [showBlocker, setShowBlocker] = useState(filters.blocked.length > 0);
  const prefs = Object.entries(filters.profs);
  const changed =
    JSON.stringify({ ...filters, profs: {}, campuses: [], mixCampuses: false }) !== JSON.stringify({ ...DEFAULT_FILTERS, profs: {}, campuses: [], mixCampuses: false });

  return (
    <div className="space-y-4">
      <Field label="Days off" hint="No classes on these days">
        <div className="grid grid-cols-6 gap-1">
          {DAY_NAMES.slice(0, 6).map((d, i) => {
            const on = (filters.daysOff & (1 << i)) !== 0;
            return (
              <button
                key={d}
                onClick={() => setFilters({ daysOff: filters.daysOff ^ (1 << i) })}
                className={cx('rounded-md border py-2 text-xs font-medium transition-colors sm:py-1.5', on ? 'border-danger/40 bg-danger-soft text-danger' : 'border-line text-muted hover:text-ink')}
              >
                {d}
              </button>
            );
          })}
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Start after">
          <TimeSelect value={filters.earliest} onChange={(v) => setFilters({ earliest: v })} placeholder="Any time" options={TIME_OPTIONS.slice(0, 14)} />
        </Field>
        <Field label="End before">
          <TimeSelect value={filters.latest} onChange={(v) => setFilters({ latest: v })} placeholder="Any time" options={TIME_OPTIONS.slice(10)} />
        </Field>
      </div>

      <Field label="Max days on campus">
        <Segmented
          className="w-full"
          value={filters.maxDays}
          onChange={(v) => setFilters({ maxDays: v })}
          options={[{ value: 0, label: 'Any' }, ...[2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }))]}
        />
      </Field>

      <div>
        <button className="flex w-full items-center justify-between text-left" onClick={() => setShowBlocker((s) => !s)}>
          <span className="text-[11px] font-medium uppercase tracking-wide text-faint">
            Blocked times {filters.blocked.length > 0 && <span className="ml-1 rounded bg-danger-soft px-1 text-danger normal-case tracking-normal">{blockedHours(filters.blocked)}</span>}
          </span>
          <Icon name={showBlocker ? 'chevronUp' : 'chevronDown'} className="size-4 text-faint" />
        </button>
        {showBlocker && <TimeBlocker blocked={filters.blocked} />}
      </div>

      <div className="space-y-0.5 border-t border-line pt-3">
        <Toggle checked={filters.hideUnscheduled} onChange={(v) => setFilters({ hideUnscheduled: v })} label="Hide sections with no set time" />
      </div>

      {prefs.length > 0 && (
        <Field label="Professor preferences">
          <div className="flex flex-wrap gap-1.5">
            {prefs.map(([n, p]) => (
              <span key={n} className={cx('inline-flex items-center gap-1 rounded-md py-0.5 pl-2 pr-1 text-xs', p === 'prefer' ? 'bg-accent-soft text-accent-text' : 'bg-danger-soft text-danger')}>
                <Icon name={p === 'prefer' ? 'thumbUp' : 'ban'} className="size-3" />
                {n}
                <button onClick={() => setProf(n, null)} className="rounded p-0.5 hover:bg-black/5" aria-label={`Clear ${n}`}>
                  <Icon name="x" className="size-3" />
                </button>
              </span>
            ))}
          </div>
        </Field>
      )}

      {changed && (
        <button className="text-xs text-muted hover:text-ink hover:underline" onClick={() => setFilters({ ...DEFAULT_FILTERS, profs: filters.profs, campuses: filters.campuses, mixCampuses: filters.mixCampuses })}>
          Reset filters
        </button>
      )}
    </div>
  );
}

function blockedHours(b: TimeBlock[]) {
  const mins = b.reduce((a, x) => a + x.e - x.s, 0);
  return `${Math.round((mins / 60) * 10) / 10}h`;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div title={hint}>
      <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-faint">{label}</div>
      {children}
    </div>
  );
}

function TimeSelect({ value, onChange, options, placeholder }: { value: number | null; onChange: (v: number | null) => void; options: number[]; placeholder: string }) {
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      className="h-10 w-full rounded-lg border border-line bg-surface px-2 text-base outline-none focus:border-accent sm:h-8 sm:text-sm"
    >
      <option value="">{placeholder}</option>
      {options.map((m) => (
        <option key={m} value={m}>
          {fmtTime(m)}
        </option>
      ))}
    </select>
  );
}

// ---------- drag-to-paint weekly blocker (30-minute cells, Mon–Sat, 7:00–21:00) ----------
const START = 7 * 60;
const END = 21 * 60;
const STEP = 30;
const ROWS = (END - START) / STEP;

function toCells(blocked: TimeBlock[]): Set<string> {
  const s = new Set<string>();
  for (const b of blocked) for (let t = b.s; t < b.e; t += STEP) if (t >= START && t < END) s.add(`${b.day}:${(t - START) / STEP}`);
  return s;
}

function fromCells(cells: Set<string>): TimeBlock[] {
  const out: TimeBlock[] = [];
  for (let d = 0; d < 6; d++) {
    let run: TimeBlock | null = null;
    for (let r = 0; r <= ROWS; r++) {
      const on = r < ROWS && cells.has(`${d}:${r}`);
      if (on && !run) run = { day: d, s: START + r * STEP, e: START + (r + 1) * STEP };
      else if (on && run) run.e = START + (r + 1) * STEP;
      else if (!on && run) {
        out.push(run);
        run = null;
      }
    }
  }
  return out;
}

function TimeBlocker({ blocked }: { blocked: TimeBlock[] }) {
  const setBlocked = useStore((s) => s.setBlocked);
  const [cells, setCells] = useState(() => toCells(blocked));
  const drag = useRef<{ paint: boolean } | null>(null);
  const cellsRef = useRef(cells);
  cellsRef.current = cells;

  useEffect(() => setCells(toCells(blocked)), [blocked]);

  useEffect(() => {
    const up = () => {
      if (drag.current) {
        drag.current = null;
        setBlocked(fromCells(cellsRef.current));
      }
    };
    window.addEventListener('pointerup', up);
    return () => window.removeEventListener('pointerup', up);
  }, [setBlocked]);

  const apply = (k: string) => {
    if (!drag.current) return;
    const paint = drag.current.paint;
    setCells((c) => {
      if (c.has(k) === paint) return c;
      const n = new Set(c);
      if (paint) n.add(k);
      else n.delete(k);
      return n;
    });
  };

  return (
    <div className="mt-2 select-none">
      <p className="mb-2 text-xs text-muted">Drag to mark times you're unavailable (work, commute…).</p>
      <div className="grid touch-none gap-px overflow-hidden rounded-lg border border-line bg-line" style={{ gridTemplateColumns: '34px repeat(6, 1fr)' }}>
        <div className="bg-surface" />
        {DAY_NAMES.slice(0, 6).map((d) => (
          <div key={d} className="bg-surface py-1 text-center text-[10px] font-medium text-muted">
            {d[0]}
            {d[1]}
          </div>
        ))}
        {Array.from({ length: ROWS }, (_, r) => (
          <Row key={r} r={r} cells={cells} apply={apply} drag={drag} />
        ))}
      </div>
      {cells.size > 0 && (
        <button className="mt-1.5 text-xs text-muted hover:text-ink hover:underline" onClick={() => setBlocked([])}>
          Clear blocked times
        </button>
      )}
    </div>
  );
}

function Row({ r, cells, apply, drag }: { r: number; cells: Set<string>; apply: (k: string) => void; drag: React.MutableRefObject<{ paint: boolean } | null> }) {
  const t = START + r * STEP;
  return (
    <>
      <div className="bg-surface pr-1 text-right text-[9px] leading-[14px] text-faint">{t % 60 === 0 ? fmtTime(t).replace(':00', '') : ''}</div>
      {Array.from({ length: 6 }, (_, d) => {
        const k = `${d}:${r}`;
        const on = cells.has(k);
        return (
          <div
            key={d}
            onPointerDown={(e) => {
              e.preventDefault();
              (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
              drag.current = { paint: !on };
              apply(k);
            }}
            onPointerEnter={() => apply(k)}
            className={cx('h-3.5 cursor-crosshair', on ? 'hatch bg-danger-soft' : 'bg-surface hover:bg-surface-2')}
          />
        );
      })}
    </>
  );
}
