import type { Features } from '../solver/model.ts';
import type { Section } from '../data/types.ts';
import { DAY_LETTERS, fmtDays, fmtTime } from '../data/types.ts';
import { cx } from './ui.tsx';

const hrs = (m: number) => (m === 0 ? '0h' : m < 60 ? `${m}m` : `${Math.round((m / 60) * 10) / 10}h`);

export function dayLetters(mask: number) {
  return DAY_LETTERS.slice(0, 6).map((d, i) => ({ d, on: (mask & (1 << i)) !== 0 }));
}

/** Weekly day pattern of a set of sections (bitmask, Mon=1). */
export const dayMaskOf = (sections: Section[]) => sections.reduce((a, s) => s.m.reduce((b, m) => b | m.d, a), 0);

export function MetricChips({ f, compact, mask }: { f: Features; compact?: boolean; mask?: number }) {
  const items: { label: string; value: string; title: string; tone?: 'good' | 'warn' }[] = [
    mask
      ? { label: `${f.days}d`, value: fmtDays(mask), title: `On campus ${f.days} days a week`, tone: f.days <= 3 ? 'good' : undefined }
      : { label: 'days', value: String(f.days), title: 'Days on campus', tone: f.days <= 3 ? 'good' : undefined },
    { label: 'idle', value: hrs(f.gaps), title: 'Total idle time between classes per week', tone: f.gaps <= 60 ? 'good' : f.gaps >= 360 ? 'warn' : undefined },
    { label: '', value: f.days ? `${fmtTime(f.start)}–${fmtTime(f.end)}` : '—', title: 'Earliest start – latest end' },
  ];
  if (!compact) {
    items.push({ label: 'cr', value: String(f.credits), title: 'Credits' });
    if (f.b2b) items.push({ label: 'back-to-back', value: String(f.b2b), title: 'Classes with under 15 minutes between them' });
    if (f.noLunch) items.push({ label: 'no lunch', value: `${f.noLunch}d`, title: 'Days without a 30-minute break between 11:30 and 2:30', tone: 'warn' });
    if (f.preferred) items.push({ label: 'preferred', value: String(f.preferred), title: 'Sections with a preferred professor', tone: 'good' });
  }
  if (f.missing) items.push({ label: 'dropped', value: String(f.missing), title: 'Optional courses left out', tone: 'warn' });
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((it, i) => (
        <span
          key={i}
          title={it.title}
          className={cx(
            'inline-flex items-baseline gap-1 rounded-md px-1.5 py-0.5 text-[11px] tabular-nums',
            it.tone === 'good' ? 'bg-accent-soft text-accent-text' : it.tone === 'warn' ? 'bg-warn-soft text-warn' : 'bg-surface-2 text-muted',
          )}
        >
          <span className="font-semibold">{it.value}</span>
          {it.label && <span className="opacity-80">{it.label}</span>}
        </span>
      ))}
    </div>
  );
}
