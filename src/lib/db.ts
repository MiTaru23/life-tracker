import Dexie, { type EntityTable } from 'dexie'

/**
 * Every synced record carries these fields. Records are never hard-deleted:
 * `deleted` is a tombstone so a deletion on one device wins over an older
 * copy on another device during merge (last write wins on `updatedAt`).
 */
export interface BaseRecord {
  id: string
  createdAt: number
  updatedAt: number
  deleted?: boolean
}

/** ISO calendar date, e.g. "2026-10-16" */
export type DateStr = string

export interface JournalEntry extends BaseRecord {
  date: DateStr
  mood?: number // 1-10
  energy?: number // 1-10
  text: string
  tags: string[]
}

/** One set within an exercise. Fields used depend on the exercise kind. */
export interface ExerciseSet {
  weightKg?: number
  reps?: number
  seconds?: number // for timed holds (e.g. plank, dead hang)
  warmup?: boolean
}

export interface Exercise {
  name: string
  externalId?: string // e.g. Liftoff exerciseId
  notes?: string
  sets: ExerciseSet[]
}

export interface Workout extends BaseRecord {
  date: DateStr
  type: string // e.g. "Running", "Gym", "Climbing"
  durationMin: number
  intensity?: number // 1-5
  notes?: string
  /** Where this record came from. Absent = manually logged. */
  source?: 'liftoff'
  /** Stable id from the source app, so re-imports update instead of duplicating. */
  externalId?: string
  /** Per-exercise detail (strength training). Absent for simple cardio logs. */
  exercises?: Exercise[]
  /** Number of personal records hit in this session (from the source app). */
  prCount?: number
}

/** A bodyweight measurement. */
export interface Bodyweight extends BaseRecord {
  date: DateStr
  kg: number
  source?: 'liftoff'
}

export type LearningKind = 'book' | 'course' | 'topic' | 'video' | 'other'
export type LearningStatus = 'planned' | 'active' | 'done' | 'dropped'

export interface LearningItem extends BaseRecord {
  title: string
  kind: LearningKind
  status: LearningStatus
  notes?: string
  tags: string[]
}

export interface Hobby extends BaseRecord {
  name: string
  notes?: string
  archived?: boolean
}

/** One logged block of time for a learning item or a hobby. */
export interface Session extends BaseRecord {
  date: DateStr
  area: 'learning' | 'hobby'
  refId: string // LearningItem.id or Hobby.id
  minutes: number
  notes?: string
}

export interface Habit extends BaseRecord {
  name: string
  archived?: boolean
}

export interface HabitCheck extends BaseRecord {
  habitId: string
  date: DateStr
}

export type GoalArea = 'sport' | 'learning' | 'hobby' | 'journal'

export interface Goal extends BaseRecord {
  area: GoalArea
  /** Target minutes per week (sport/learning/hobby) or entries per week (journal). */
  perWeek: number
}

export interface Suggestion extends BaseRecord {
  area: GoalArea | 'general'
  title: string
  body: string
  source: 'rule' | 'ai'
  feedback?: 'up' | 'down'
}

/** Local-only key/value store (device id, last sync time, ...). Not synced. */
export interface Meta {
  key: string
  value: unknown
}

export const SYNCED_TABLES = [
  'journal',
  'workouts',
  'learning',
  'hobbies',
  'sessions',
  'habits',
  'habitChecks',
  'goals',
  'suggestions',
  'bodyweights',
] as const
export type SyncedTable = (typeof SYNCED_TABLES)[number]

export const db = new Dexie('life-tracker') as Dexie & {
  journal: EntityTable<JournalEntry, 'id'>
  workouts: EntityTable<Workout, 'id'>
  learning: EntityTable<LearningItem, 'id'>
  hobbies: EntityTable<Hobby, 'id'>
  sessions: EntityTable<Session, 'id'>
  habits: EntityTable<Habit, 'id'>
  habitChecks: EntityTable<HabitCheck, 'id'>
  goals: EntityTable<Goal, 'id'>
  suggestions: EntityTable<Suggestion, 'id'>
  bodyweights: EntityTable<Bodyweight, 'id'>
  meta: EntityTable<Meta, 'key'>
}

db.version(1).stores({
  journal: 'id, date, updatedAt',
  workouts: 'id, date, type, updatedAt',
  learning: 'id, status, updatedAt',
  hobbies: 'id, updatedAt',
  sessions: 'id, date, area, refId, updatedAt',
  habits: 'id, updatedAt',
  habitChecks: 'id, habitId, date, [habitId+date], updatedAt',
  goals: 'id, area, updatedAt',
  suggestions: 'id, area, updatedAt',
  meta: 'key',
})

// v2: strength-training detail on workouts + bodyweight log (Liftoff import).
db.version(2).stores({
  workouts: 'id, date, type, externalId, updatedAt',
  bodyweights: 'id, date, updatedAt',
})

export async function getDeviceId(): Promise<string> {
  const row = await db.meta.get('deviceId')
  if (row) return row.value as string
  const id = crypto.randomUUID()
  await db.meta.put({ key: 'deviceId', value: id })
  return id
}
