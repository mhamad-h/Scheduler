import { useEffect, useState } from 'react';
import type { TermIndex } from '../data/load.ts';
import { courseKey } from '../data/types.ts';
import { joinCrns, useStore, useTermState } from '../state/store.ts';
import type { Separator } from '../state/store.ts';
import { viewFromCrns } from '../lib/view.ts';
import { MiniWeek } from './Calendar.tsx';
import { MetricChips } from './Metrics.tsx';
import { copyText, cx, Icon, IconButton, Segmented } from './ui.tsx';

export function SlotsPanel({ index, hues, activeSlot, onOpen, onClose }: { index: TermIndex; hues: Record<string, number>; activeSlot: string | null; onOpen: (id: string) => void; onClose: () => void }) {
  const { slots } = useTermState();
  const profs = useStore((s) => s.filters.profs);
  const separator = useStore((s) => s.separator);
  const { renameSlot, deleteSlot, moveSlot, setSeparator } = useStore.getState();
  const [editing, setEditing] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const copyAll = () => {
    const text = slots.map((s) => `${s.name}: ${joinCrns(s.crns, separator === 'newline' ? 'space' : separator)}`).join('\n');
    copyText(text, `Copied CRNs for ${slots.length} slots`);
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-label="Saved schedules">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[1px]" onClick={onClose} />
      <aside className="animate-slide relative flex h-full w-full max-w-md flex-col border-l border-line bg-bg shadow-card">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <Icon name="bookmark" className="size-4 text-accent" />
          <div className="flex-1">
            <div className="text-sm font-semibold">Saved schedules</div>
            <div className="text-xs text-muted">{index.data.name} · stored in this browser</div>
          </div>
          <IconButton icon="x" label="Close" onClick={onClose} />
        </div>

        <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
          <span className="text-xs text-muted">Separator</span>
          <Segmented<Separator>
            value={separator}
            onChange={setSeparator}
            options={[
              { value: 'space', label: 'Space' },
              { value: 'comma', label: 'Comma' },
              { value: 'newline', label: 'Lines' },
            ]}
          />
          <div className="flex-1" />
          <button
            disabled={!slots.length}
            onClick={copyAll}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-medium text-white hover:bg-accent-strong disabled:opacity-40 dark:text-[#04130d]"
          >
            <Icon name="copy" className="size-3.5" />
            Copy all
          </button>
        </div>

        <div className="scrollbar-thin flex-1 space-y-2.5 overflow-y-auto p-4">
          {slots.length === 0 && (
            <div className="rounded-xl border border-dashed border-line px-6 py-12 text-center">
              <Icon name="bookmark" className="mx-auto mb-2 size-6 text-faint" />
              <div className="text-sm font-medium">No saved schedules yet</div>
              <p className="mt-1 text-xs text-muted">Press “Save” on a schedule you like (or hit S) to keep it here as slot A, B, C…</p>
            </div>
          )}
          {slots.map((slot, i) => {
            const view = viewFromCrns(slot.crns, index, profs);
            const courses = [...new Set(view.sections.map(courseKey))];
            return (
              <div key={slot.id} className={cx('rounded-xl border bg-surface p-3', activeSlot === slot.id ? 'border-accent' : 'border-line')}>
                <div className="flex items-start gap-3">
                  <button onClick={() => onOpen(slot.id)} className="shrink-0" title="Open">
                    <MiniWeek sections={view.sections} hues={hues} className="h-[60px] w-[84px]" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      {editing === slot.id ? (
                        <input
                          autoFocus
                          defaultValue={slot.name}
                          onBlur={(e) => {
                            renameSlot(slot.id, e.target.value.trim() || slot.name);
                            setEditing(null);
                          }}
                          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                          className="h-8 w-full rounded-md border border-accent bg-surface px-2 text-base outline-none sm:h-7 sm:text-sm"
                        />
                      ) : (
                        <button onClick={() => onOpen(slot.id)} className="truncate text-left text-sm font-semibold hover:underline">
                          {slot.name}
                        </button>
                      )}
                      {editing !== slot.id && <IconButton icon="edit" label="Rename" className="size-6" onClick={() => setEditing(slot.id)} />}
                    </div>
                    <div className="mb-1.5 truncate text-xs text-muted">{courses.join(' · ') || 'Empty'}</div>
                    <MetricChips f={view.f} compact />
                  </div>
                </div>
                <div className="mt-2.5 flex items-center gap-1 border-t border-line pt-2">
                  <button
                    onClick={() => copyText(joinCrns(slot.crns, separator), `Copied ${slot.name} CRNs`)}
                    className="group flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-surface-2"
                    title="Copy CRNs"
                  >
                    <Icon name="copy" className="size-3.5 text-muted group-hover:text-accent" />
                    <span className="truncate font-mono text-xs">{slot.crns.join(' ')}</span>
                  </button>
                  <IconButton icon="chevronUp" label="Move up" className="size-7" disabled={i === 0} onClick={() => moveSlot(slot.id, -1)} />
                  <IconButton icon="chevronDown" label="Move down" className="size-7" disabled={i === slots.length - 1} onClick={() => moveSlot(slot.id, 1)} />
                  <IconButton icon="trash" label="Delete" className="size-7 hover:!text-danger" onClick={() => deleteSlot(slot.id)} />
                </div>
              </div>
            );
          })}
        </div>
      </aside>
    </div>
  );
}
