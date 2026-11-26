import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CourseConfig, Filters, PoolConfig, ProfPref, TimeBlock } from '../solver/model.ts';
import { DEFAULT_CUSTOM } from '../solver/rank.ts';

export interface Slot {
  id: string;
  name: string;
  crns: string[];
  createdAt: number;
}

export interface TermState {
  courses: CourseConfig[];
  /** "pick N of subject" electives, e.g. 2 LAS */
  pools: PoolConfig[];
  slots: Slot[];
}

export type Theme = 'light' | 'dark' | 'system';
export type Separator = 'space' | 'comma' | 'newline';
export type CrnSort = 'course' | 'time';

interface State {
  theme: Theme;
  term: string | null;
  terms: Record<string, TermState>;
  filters: Filters;
  preset: string;
  custom: Record<string, number>;
  separator: Separator;
  crnSort: CrnSort;
  /** newest term whose "new semester is out" notice the user closed */
  dismissedTerm: string | null;

  setTheme(t: Theme): void;
  setTerm(t: string): void;
  addCourse(key: string): void;
  removeCourse(key: string): void;
  clearCourses(): void;
  updateCourse(key: string, patch: Partial<CourseConfig>): void;
  toggleCrn(key: string, crn: string, field: 'excludedCrns' | 'lockedCrns'): void;
  setFilters(patch: Partial<Filters>): void;
  setProf(name: string, pref: ProfPref | null): void;
  setBlocked(blocked: TimeBlock[]): void;
  setPreset(id: string): void;
  setCustom(key: string, v: number): void;
  setSeparator(s: Separator): void;
  setCrnSort(s: CrnSort): void;
  dismissTerm(code: string): void;
  addPool(subj: string, count?: number): void;
  updatePool(id: string, patch: Partial<PoolConfig>): void;
  removePool(id: string): void;
  saveSlot(crns: string[], name?: string): Slot;
  renameSlot(id: string, name: string): void;
  setSlotCrns(id: string, crns: string[]): void;
  deleteSlot(id: string): void;
  moveSlot(id: string, dir: -1 | 1): void;
}

export const DEFAULT_FILTERS: Filters = {
  campuses: [],
  earliest: null,
  latest: null,
  daysOff: 0,
  maxDays: 0,
  dayPattern: 0,
  blocked: [],
  profs: {},
  hideUnscheduled: false,
  hideFull: false,
  mixCampuses: false,
};

const emptyTerm = (): TermState => ({ courses: [], pools: [], slots: [] });

const slotName = (slots: Slot[]) => {
  for (let i = 0; ; i++) {
    const n = i < 26 ? String.fromCharCode(65 + i) : `Slot ${i + 1}`;
    if (!slots.some((s) => s.name === n)) return n;
  }
};

export const useStore = create<State>()(
  persist(
    (set, get) => {
      const patchTerm = (fn: (t: TermState) => TermState) => {
        const term = get().term;
        if (!term) return;
        set((s) => ({ terms: { ...s.terms, [term]: fn({ ...emptyTerm(), ...s.terms[term] }) } }));
      };
      return {
        theme: 'system',
        term: null,
        terms: {},
        filters: DEFAULT_FILTERS,
        preset: 'balanced',
        custom: DEFAULT_CUSTOM,
        separator: 'space',
        crnSort: 'course',
        dismissedTerm: null,

        setTheme: (theme) => set({ theme }),
        setTerm: (term) => set({ term }),
        dismissTerm: (dismissedTerm) => set({ dismissedTerm }),
        addCourse: (key) =>
          patchTerm((t) =>
            t.courses.some((c) => c.key === key)
              ? t
              : { ...t, courses: [...t.courses, { key, skipTypes: [], excludedCrns: [], lockedCrns: [], optional: false }] },
          ),
        removeCourse: (key) => patchTerm((t) => ({ ...t, courses: t.courses.filter((c) => c.key !== key) })),
        clearCourses: () => patchTerm((t) => ({ ...t, courses: [], pools: [] })),
        addPool: (subj, count = 1) =>
          patchTerm((t) => {
            const existing = t.pools.find((p) => p.subj === subj);
            if (existing) return { ...t, pools: t.pools.map((p) => (p === existing ? { ...p, count: Math.min(p.count + count, 4) } : p)) };
            return { ...t, pools: [...t.pools, { id: Math.random().toString(36).slice(2, 8), subj, count, honors: 'regular', excluded: [] }] };
          }),
        updatePool: (id, patch) => patchTerm((t) => ({ ...t, pools: t.pools.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),
        removePool: (id) => patchTerm((t) => ({ ...t, pools: t.pools.filter((p) => p.id !== id) })),
        updateCourse: (key, patch) =>
          patchTerm((t) => ({ ...t, courses: t.courses.map((c) => (c.key === key ? { ...c, ...patch } : c)) })),
        toggleCrn: (key, crn, field) =>
          patchTerm((t) => ({
            ...t,
            courses: t.courses.map((c) => {
              if (c.key !== key) return c;
              const has = c[field].includes(crn);
              const next = { ...c, [field]: has ? c[field].filter((x) => x !== crn) : [...c[field], crn] };
              // locking and excluding are mutually exclusive
              const other = field === 'lockedCrns' ? 'excludedCrns' : 'lockedCrns';
              if (!has) next[other] = c[other].filter((x) => x !== crn);
              return next;
            }),
          })),
        setFilters: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } })),
        setProf: (name, pref) =>
          set((s) => {
            const profs = { ...s.filters.profs };
            if (pref) profs[name] = pref;
            else delete profs[name];
            return { filters: { ...s.filters, profs } };
          }),
        setBlocked: (blocked) => set((s) => ({ filters: { ...s.filters, blocked } })),
        setPreset: (preset) => set({ preset }),
        setCustom: (key, v) => set((s) => ({ custom: { ...s.custom, [key]: v } })),
        setSeparator: (separator) => set({ separator }),
        setCrnSort: (crnSort) => set({ crnSort }),
        saveSlot: (crns, name) => {
          const term = get().term!;
          const slots = get().terms[term]?.slots ?? [];
          const slot: Slot = { id: Math.random().toString(36).slice(2, 10), name: name ?? slotName(slots), crns, createdAt: Date.now() };
          patchTerm((t) => ({ ...t, slots: [...t.slots, slot] }));
          return slot;
        },
        renameSlot: (id, name) => patchTerm((t) => ({ ...t, slots: t.slots.map((s) => (s.id === id ? { ...s, name } : s)) })),
        setSlotCrns: (id, crns) => patchTerm((t) => ({ ...t, slots: t.slots.map((s) => (s.id === id ? { ...s, crns } : s)) })),
        deleteSlot: (id) => patchTerm((t) => ({ ...t, slots: t.slots.filter((s) => s.id !== id) })),
        moveSlot: (id, dir) =>
          patchTerm((t) => {
            const i = t.slots.findIndex((s) => s.id === id);
            const j = i + dir;
            if (i < 0 || j < 0 || j >= t.slots.length) return t;
            const slots = [...t.slots];
            [slots[i], slots[j]] = [slots[j], slots[i]];
            return { ...t, slots };
          }),
      };
    },
    {
      name: 'lau-scheduler',
      version: 1,
      partialize: (s) => ({ theme: s.theme, term: s.term, terms: s.terms, filters: s.filters, preset: s.preset, custom: s.custom, separator: s.separator, crnSort: s.crnSort, dismissedTerm: s.dismissedTerm }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<State>;
        const terms: Record<string, TermState> = {};
        for (const [k, t] of Object.entries(p.terms ?? {})) terms[k] = { ...emptyTerm(), ...t };
        return { ...current, ...p, terms, filters: { ...DEFAULT_FILTERS, ...(p.filters ?? {}) }, custom: { ...DEFAULT_CUSTOM, ...(p.custom ?? {}) } };
      },
    },
  ),
);

const EMPTY: TermState = emptyTerm();
export const useTermState = () => useStore((s) => (s.term ? s.terms[s.term] ?? EMPTY : EMPTY));

export const joinCrns = (crns: string[], sep: Separator) => crns.join(sep === 'space' ? ' ' : sep === 'comma' ? ', ' : '\n');
