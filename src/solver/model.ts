import type { Section } from '../data/types.ts';

export type ProfPref = 'avoid' | 'prefer';

export interface CourseConfig {
  key: string; // "PHY 111"
  /** schedule types the user switched off for this course (e.g. take the Lecture only) */
  skipTypes: string[];
  excludedCrns: string[];
  /** at most one locked CRN per schedule type */
  lockedCrns: string[];
  /** optional courses may be dropped if they don't fit */
  optional: boolean;
}

/** "Pick any N courses of this subject" — e.g. 2 LAS electives, chosen to fit the rest of the schedule. */
export interface PoolConfig {
  id: string;
  subj: string;
  count: number;
  honors: 'regular' | 'honors' | 'either';
  /** course keys the user doesn't want (already taken, not interested) */
  excluded: string[];
}

export interface TimeBlock {
  /** day index 0=Mon..6=Sun */
  day: number;
  s: number;
  e: number;
}

export interface Filters {
  /** allowed campuses; empty = any */
  campuses: string[];
  /** minutes from midnight, null = no limit */
  earliest: number | null;
  latest: number | null;
  /** day bitmask of days that must stay free */
  daysOff: number;
  /** 0 = no limit */
  maxDays: number;
  blocked: TimeBlock[];
  profs: Record<string, ProfPref>;
  /** when true, sections without any meeting time are excluded */
  hideUnscheduled: boolean;
  /** allow Beirut and Byblos sections in one schedule (online always mixes) */
  mixCampuses?: boolean;
}

export interface SolveInput {
  sections: Section[];
  courses: CourseConfig[];
  pools?: PoolConfig[];
  filters: Filters;
  customWeights: Weights;
  maxNodes?: number;
  keepPerPreset?: number;
}

/** A group = one schedule type of one course; exactly one candidate is picked from each (or skipped if optional). */
export interface Group {
  course: string;
  type: string;
  title: string;
  optional: boolean;
  candidates: number[];
  /** set for "pick N" elective slots */
  pool?: { id: string; subj: string; slot: number; count: number };
}

/** One or more equivalent sections (same times, instructors and campus). */
export interface Candidate {
  id: number;
  group: number;
  /** indexes into SolveInput.sections; the first is the representative */
  sections: number[];
  crns: string[];
  /** pool candidates: position of this time slot in the pool (slots are picked in increasing order) */
  ord?: number;
  /** pool candidates: topic id of each entry in `sections` */
  topics?: number[];
}

export interface Features {
  courses: number; // how many courses are included
  missing: number; // optional courses dropped
  credits: number;
  days: number;
  gaps: number; // idle minutes between classes
  spread: number; // avg deviation of daily start + end (minutes)
  earliness: number; // Σ per day minutes before 10:00 the first class starts
  lateness: number; // Σ per day minutes after 16:00 the last class ends
  noLunch: number; // days without a ≥30 min break between 11:30 and 14:30 (only days spanning that window)
  b2b: number; // consecutive classes with < 15 min between them
  onCampus: number; // Σ per day (last end - first start)
  longestDay: number;
  start: number; // earliest start in week
  end: number; // latest end in week
  preferred: number; // sections taught by a preferred professor
  unscheduled: number; // sections with no fixed time
}

export type Weights = Partial<Record<keyof Features, number>>;

export interface Schedule {
  /** candidate id per group, -1 = skipped (optional course) */
  picks: number[];
  f: Features;
  /** dayMask of occupied days */
  dayMask: number;
  /** pool groups: CRN of the section (topic) assigned to that slot */
  poolPick?: Record<number, string>;
}

export interface Diagnosis {
  kind: 'empty-group' | 'pair-conflict' | 'no-fit' | 'nothing';
  message: string;
}

export interface SolveResult {
  groups: Group[];
  candidates: Candidate[];
  /** unique schedules (union of all preset top lists) */
  schedules: Schedule[];
  /** per preset id, ordered indexes into schedules */
  rankings: Record<string, number[]>;
  total: number;
  nodes: number;
  truncated: boolean;
  ms: number;
  diagnosis?: Diagnosis;
  /** per group: how many sections were removed by filters */
  filtered: { group: number; before: number; after: number }[];
}
