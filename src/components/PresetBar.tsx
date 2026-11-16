import { useEffect, useRef, useState } from 'react';
import { CUSTOM_FACTORS, CUSTOM_ID, PRESETS } from '../solver/rank.ts';
import { useStore } from '../state/store.ts';
import { cx, Icon } from './ui.tsx';

export function PresetBar() {
  const preset = useStore((s) => s.preset);
  const custom = useStore((s) => s.custom);
  const { setPreset, setCustom } = useStore.getState();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <div className="scrollbar-thin scrollbar-none-sm -mx-1 flex gap-1 overflow-x-auto px-1 pb-1 max-sm:-mx-4 max-sm:px-4">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            title={p.hint}
            onClick={() => setPreset(p.id)}
            className={cx(
              'shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
              preset === p.id ? 'border-transparent bg-ink text-bg' : 'border-line bg-surface text-muted hover:text-ink',
            )}
          >
            {p.label}
          </button>
        ))}
        <button
          onClick={() => {
            setPreset(CUSTOM_ID);
            setOpen((o) => (preset === CUSTOM_ID ? !o : true));
          }}
          className={cx(
            'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
            preset === CUSTOM_ID ? 'border-transparent bg-ink text-bg' : 'border-line bg-surface text-muted hover:text-ink',
          )}
        >
          <Icon name="sliders" className="size-3.5" />
          Custom
        </button>
      </div>
      {open && preset === CUSTOM_ID && (
        <div className="animate-pop absolute right-0 top-10 z-30 w-[min(340px,calc(100vw-2rem))] rounded-xl border border-line bg-surface p-4 shadow-card">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-semibold">What matters to you?</div>
            <button className="rounded p-1 text-muted hover:text-ink" onClick={() => setOpen(false)} aria-label="Close">
              <Icon name="x" />
            </button>
          </div>
          <div className="space-y-2.5">
            {CUSTOM_FACTORS.map((f) => (
              <label key={f.key} className="grid grid-cols-[1fr_120px_18px] items-center gap-3 text-sm">
                <span className="text-muted">{f.label}</span>
                <input type="range" min={0} max={10} value={custom[f.key] ?? 0} onChange={(e) => setCustom(f.key, Number(e.target.value))} />
                <span className="text-right text-xs tabular-nums text-faint">{custom[f.key] ?? 0}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
