import { useEffect, useMemo, useRef, useState } from 'react';
import type { Course } from '../data/load.ts';
import { searchCourses } from '../data/search.ts';
import { cx, Icon, Kbd } from './ui.tsx';

export function CourseSearch({
  courses,
  selected,
  campuses,
  onAdd,
  onAddPool,
}: {
  courses: Course[];
  selected: string[];
  campuses: string[];
  onAdd: (key: string) => void;
  /** "let the scheduler pick" entry for LAS */
  onAddPool?: (subj: string) => void;
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const results = useMemo(() => searchCourses(courses, q, 40), [courses, q]);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    listRef.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  // typing "LA", "LAS", "elective" or "liberal" offers the auto-pick LAS entry first
  const qUpper = q.toUpperCase().replace(/\s+/g, '');
  const showPool = !!onAddPool && (qUpper === 'LA' || qUpper === 'LAS' || /elective|liberal/i.test(q));
  const off = showPool ? 1 : 0;
  const count = results.length + off;
  const choose = (i: number) => {
    if (showPool && i === 0) {
      onAddPool!('LAS');
      setQ('');
      inputRef.current?.focus();
    } else if (results[i - off]) pick(results[i - off]);
  };

  const pick = (c: Course) => {
    onAdd(c.key);
    setQ('');
    inputRef.current?.focus();
  };

  // inline completion hint: the remaining characters of the top code match
  const top = results[0];
  const qn = q.toUpperCase().replace(/\s+/g, '');
  const ghost = top && qn && top.norm.startsWith(qn) ? top.key : '';

  return (
    <div className="relative">
      <div className={cx('flex h-11 items-center gap-2 rounded-xl border bg-surface px-3 transition-colors', open && q ? 'border-accent' : 'border-line')}>
        <Icon name="search" className="size-4 text-faint" />
        <div className="relative flex-1">
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 120)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, count - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === 'Enter' && active < count) {
                e.preventDefault();
                choose(active);
              } else if (e.key === 'Tab' && ghost && ghost.replace(' ', '') !== qn) {
                e.preventDefault();
                setQ(ghost);
              } else if (e.key === 'Escape') {
                setQ('');
                (e.target as HTMLInputElement).blur();
              }
            }}
            placeholder="Add a course — e.g. MTH2, CSC 245, calculus"
            className="relative z-10 w-full bg-transparent text-base outline-none sm:text-sm placeholder:text-faint focus-visible:outline-none"
            spellCheck={false}
            autoComplete="off"
            aria-label="Search courses"
          />
          {ghost && open && (
            <div className="pointer-events-none absolute inset-0 flex items-center text-base text-faint/70 sm:text-sm" aria-hidden>
              <span className="invisible whitespace-pre">{q}</span>
              <span className="whitespace-pre">{ghostSuffix(q, ghost)}</span>
            </div>
          )}
        </div>
        {!q && <Kbd>/</Kbd>}
      </div>

      {open && q && (
        <div ref={listRef} className="animate-pop scrollbar-thin absolute inset-x-0 top-12 z-30 max-h-[min(440px,60vh)] overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-card">
          {count === 0 && <div className="px-3 py-6 text-center text-sm text-muted">No courses match “{q}”</div>}
          {showPool && (
            <button
              data-i={0}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(0)}
              onMouseEnter={() => setActive(0)}
              className={cx('mb-1 flex w-full items-center gap-3 rounded-lg border border-dashed border-accent/40 px-3 py-2 text-left', active === 0 ? 'bg-accent-soft' : '')}
            >
              <span className="grid w-[76px] shrink-0 place-items-start">
                <Icon name="sparkle" className="size-4 text-accent" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-ink">Any LAS course — let the scheduler pick</span>
                <span className="block text-xs text-muted">Choose how many, regular or honors; it picks what fits your schedule best</span>
              </span>
              {active === 0 && <Kbd>↵</Kbd>}
            </button>
          )}
          {results.map((c, j) => {
            const i = j + off;
            const added = selected.includes(c.key);
            const secs = campuses.length ? c.sections.filter((s) => campuses.includes(s.campus)) : c.sections;
            return (
              <button
                key={c.key}
                data-i={i}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(c)}
                onMouseEnter={() => setActive(i)}
                className={cx('flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left', i === active ? 'bg-surface-2' : '')}
              >
                <span className="w-[76px] shrink-0 font-mono text-[13px] font-medium text-ink">
                  <Highlight text={c.key} q={qn} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-ink">{c.title}</span>
                  <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                    <span>
                      {secs.length} section{secs.length === 1 ? '' : 's'}
                      {campuses.length > 0 && secs.length !== c.sections.length && <span className="text-faint"> of {c.sections.length}</span>}
                    </span>
                    {c.types.length > 1 && <span className="text-accent-text">{c.types.join(' + ')}</span>}
                    <span className="text-faint">{c.campuses.filter((x) => x !== 'Other').join(' · ')}</span>
                    {c.credits > 0 && <span className="text-faint">{c.credits} cr</span>}
                  </span>
                </span>
                {added ? <Icon name="check" className="size-4 text-accent" /> : i === active ? <Kbd>↵</Kbd> : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ghostSuffix(q: string, key: string) {
  // map typed chars onto the key ignoring spaces, return what's left
  const qn = q.toUpperCase().replace(/\s+/g, '');
  let i = 0, n = 0;
  while (i < key.length && n < qn.length) {
    if (key[i] !== ' ') n++;
    i++;
  }
  if (q.endsWith(' ') && key[i] === ' ') i++;
  const rest = key.slice(i);
  return rest;
}

function Highlight({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  let i = 0, n = 0;
  while (i < text.length && n < q.length) {
    if (text[i] !== ' ') {
      if (text[i] !== q[n]) return <>{text}</>;
      n++;
    }
    i++;
  }
  return (
    <>
      <span className="text-accent-text">{text.slice(0, i)}</span>
      <span className="text-muted">{text.slice(i)}</span>
    </>
  );
}
