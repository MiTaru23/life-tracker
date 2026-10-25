/**
 * Convert Liftoff (getgymbros) export JSON into LIFE/OS records.
 * Self-contained (no imports) so the PC-side uplink script reuses it in Node.
 *
 * Liftoff stores weights in POUNDS; we convert to kg.
 * `exerciseTypes` is two letters, one per set input:
 *   W = weight (lbs)   B = added weight on a bodyweight move (lbs, 0 = none)
 *   R = reps           D = duration (seconds)        N = none
 * so "WR" = weight+reps, "BR" = bodyweight reps, "ND"/"DD" = timed hold.
 *
 * Record ids are derived from the Liftoff id, so re-importing updates the
 * same record instead of creating duplicates. Timestamps come from the
 * session time (stable), so an unchanged re-import produces an identical
 * record and never triggers a needless sync push.
 */

export const LBS_TO_KG = 0.45359237

export function lbsToKg(lbs: number): number {
  return Math.round(lbs * LBS_TO_KG * 10) / 10
}

interface LoSet {
  setType?: string
  inputOne?: number
  inputTwo?: number
}
interface LoExercise {
  exerciseIndex?: number
  exerciseName: string
  exerciseId?: string
  exerciseTypes?: string
  exerciseNotes?: string
  setsData?: LoSet[]
}
export interface LoWorkout {
  id: string
  startedAt: string
  postedAt?: string
  sessionNotes?: string
  prCount?: number
  sessionDurationSeconds?: number
  exerciseData?: LoExercise[]
}
export interface LoBodyweight {
  date: string
  weight: number
}

export interface OutSet {
  weightKg?: number
  reps?: number
  seconds?: number
  warmup?: boolean
}
export interface OutExercise {
  name: string
  externalId?: string
  notes?: string
  sets: OutSet[]
}
export interface OutWorkout {
  id: string
  createdAt: number
  updatedAt: number
  date: string
  type: string
  durationMin: number
  notes?: string
  source: 'liftoff'
  externalId: string
  exercises: OutExercise[]
  prCount?: number
}
export interface OutBodyweight {
  id: string
  createdAt: number
  updatedAt: number
  date: string
  kg: number
  source: 'liftoff'
}

function convertSet(s: LoSet, types: string): OutSet {
  const [a, b] = [types[0] ?? '', types[1] ?? '']
  const out: OutSet = {}
  if ((a === 'W' || a === 'B') && typeof s.inputOne === 'number' && s.inputOne > 0) {
    out.weightKg = lbsToKg(s.inputOne)
  }
  if (b === 'R' && typeof s.inputTwo === 'number') out.reps = s.inputTwo
  else if (b === 'D' && typeof s.inputTwo === 'number') out.seconds = s.inputTwo
  if (s.setType === 'warmup') out.warmup = true
  return out
}

export function convertWorkout(w: LoWorkout): OutWorkout {
  const date = w.startedAt.slice(0, 10)
  const ts = Date.parse(w.postedAt || w.startedAt) || Date.parse(date) || 0
  const exercises: OutExercise[] = (w.exerciseData ?? [])
    .slice()
    .sort((x, y) => (x.exerciseIndex ?? 0) - (y.exerciseIndex ?? 0))
    .map((e) => ({
      name: e.exerciseName,
      externalId: e.exerciseId || undefined,
      notes: e.exerciseNotes || undefined,
      sets: (e.setsData ?? []).map((s) => convertSet(s, e.exerciseTypes ?? '')),
    }))
  return {
    id: `lo-w-${w.id}`,
    createdAt: ts,
    updatedAt: ts,
    date,
    type: 'Gym',
    durationMin: Math.round((w.sessionDurationSeconds ?? 0) / 60),
    notes: w.sessionNotes || undefined,
    source: 'liftoff',
    externalId: w.id,
    exercises,
    prCount: w.prCount || undefined,
  }
}

export function convertBodyweights(list: LoBodyweight[]): OutBodyweight[] {
  // One record per date; later entries for the same day win.
  const byDate = new Map<string, OutBodyweight>()
  for (const b of list) {
    const ts = Date.parse(b.date) || 0
    byDate.set(b.date, {
      id: `lo-bw-${b.date}`,
      createdAt: ts,
      updatedAt: ts,
      date: b.date,
      kg: lbsToKg(b.weight),
      source: 'liftoff',
    })
  }
  return [...byDate.values()]
}
