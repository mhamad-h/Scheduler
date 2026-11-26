import { create } from 'zustand';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

// ---------- icons (inline, 1.75 stroke) ----------
const paths: Record<string, ReactNode> = {
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  x: <path d="M18 6 6 18M6 6l12 12" />,
  plus: <path d="M12 5v14M5 12h14" />,
  copy: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></>,
  check: <path d="m5 12 5 5L20 7" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevronLeft: <path d="m15 18-6-6 6-6" />,
  chevronRight: <path d="m9 18 6-6-6-6" />,
  chevronUp: <path d="m18 15-6-6-6 6" />,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  eyeOff: <><path d="M3 3l18 18" /><path d="M10.6 5.1A10 10 0 0 1 12 5c6 0 9.5 7 9.5 7a17 17 0 0 1-3.1 3.9M6.6 6.6A17 17 0 0 0 2.5 12S6 19 12 19a9.9 9.9 0 0 0 5.4-1.6" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>,
  bookmark: <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />,
  trash: <><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  moon: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />,
  monitor: <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></>,
  link: <><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></>,
  sliders: <><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" /></>,
  calendar: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
  thumbUp: <path d="M7 10v11H4V10zM7 10l4-8a3 3 0 0 1 3 3v4h5.5a2 2 0 0 1 2 2.3l-1.4 8A2 2 0 0 1 18.1 21H7" />,
  ban: <><circle cx="12" cy="12" r="9" /><path d="m5.7 5.7 12.6 12.6" /></>,
  seat: <><path d="M6 11V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v6" /><path d="M4 11h16v4H4z" /><path d="M6 15v5M18 15v5" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 16v-4M12 8h.01" /></>,
  alert: <><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></>,
  edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></>,
  swap: <><path d="M7 16V4M3 8l4-4 4 4M17 8v12M21 16l-4 4-4-4" /></>,
  sparkle: <path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z" />,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  arrowLeft: <path d="M19 12H5M12 19l-7-7 7-7" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
};

export function Icon({ name, className = 'size-4', strokeWidth = 1.75 }: { name: keyof typeof paths | string; className?: string; strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={cx('shrink-0', className)} aria-hidden>
      {paths[name]}
    </svg>
  );
}

// ---------- buttons ----------
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'outline' | 'danger' | 'soft'; size?: 'sm' | 'md' };
export function Button({ variant = 'outline', size = 'md', className, ...p }: BtnProps) {
  return (
    <button
      {...p}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:opacity-40 disabled:pointer-events-none select-none whitespace-nowrap',
        size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-9 px-3.5 text-sm',
        variant === 'primary' && 'bg-accent text-white hover:bg-accent-strong dark:text-[#04130d]',
        variant === 'outline' && 'border border-line bg-surface hover:bg-surface-2 text-ink',
        variant === 'ghost' && 'hover:bg-surface-2 text-muted hover:text-ink',
        variant === 'soft' && 'bg-accent-soft text-accent-text hover:brightness-95',
        variant === 'danger' && 'text-danger hover:bg-danger-soft',
        className,
      )}
    />
  );
}

export function IconButton({ icon, label, className, active, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: string; label: string; active?: boolean }) {
  return (
    <button
      {...p}
      aria-label={label}
      title={label}
      className={cx(
        'inline-flex size-8 items-center justify-center rounded-lg transition-colors disabled:opacity-40',
        active ? 'bg-accent-soft text-accent-text' : 'text-muted hover:bg-surface-2 hover:text-ink',
        className,
      )}
    >
      <Icon name={icon} />
    </button>
  );
}

export function Segmented<T extends string | number>({ value, options, onChange, className }: { value: T; options: { value: T; label: ReactNode; title?: string }[]; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={cx('inline-flex rounded-lg bg-surface-2 p-0.5 text-xs font-medium', className)}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cx('flex-1 rounded-md px-2.5 py-1.5 transition-all', value === o.value ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-1 text-sm" title={hint}>
      <span className="text-ink">{label}</span>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx('relative h-5 w-9 shrink-0 rounded-full transition-colors', checked ? 'bg-accent' : 'bg-surface-3')}
      >
        <span className={cx('absolute top-0.5 size-4 rounded-full bg-white shadow transition-all', checked ? 'left-4.5' : 'left-0.5')} />
      </button>
    </label>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx('rounded-xl border border-line bg-surface shadow-card', className)}>{children}</div>;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-line bg-surface-2 px-1 font-mono text-[10px] text-muted">{children}</kbd>;
}

// ---------- toasts ----------
interface ToastState {
  toasts: { id: number; text: string; tone: 'ok' | 'warn' }[];
  push(text: string, tone?: 'ok' | 'warn'): void;
}
export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (text, tone = 'ok') => {
    const id = Date.now() + Math.random();
    set((s) => ({ toasts: [...s.toasts, { id, text, tone }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 2600);
  },
}));
export const toast = (text: string, tone?: 'ok' | 'warn') => useToasts.getState().push(text, tone);

export function Toasts() {
  const toasts = useToasts((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(8.5rem+env(safe-area-inset-bottom))] z-50 flex flex-col items-center gap-2 px-4 lg:bottom-5">
      {toasts.map((t) => (
        <div key={t.id} className="animate-pop flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm shadow-card">
          <Icon name={t.tone === 'ok' ? 'check' : 'alert'} className={cx('size-4', t.tone === 'ok' ? 'text-accent' : 'text-warn')} />
          {t.text}
        </div>
      ))}
    </div>
  );
}

export async function copyText(text: string, what = 'Copied') {
  try {
    await navigator.clipboard.writeText(text);
    toast(what);
  } catch {
    // fallback for insecure contexts
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    toast(what);
  }
}
