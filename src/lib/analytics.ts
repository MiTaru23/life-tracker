import type { Bodyweight, Habit, HabitCheck, JournalEntry, Session, Workout } from './db'
import { addDays, daysBetween, today, weekStart } from './repo'

export interface WeekBucket {
  week: string // Monday ISO date
  label: string // e.g. "20 Oct"
  avgMood?: number
  avgEnergy?: number
  sportMin: number
  learnMin: number
  hobbyMin: number
  volumeKg: number // sum of weight*reps across gym sets
  habitRate?: number // 0..1 completion of active habits that week
}

export interface Point {
  label: string
  value: number
  date?: string
}

export interface Analytics {
  weeks: WeekBucket[]
  bodyweight: Point[]
  /** Daily mood/energy (last ~60 days), one point per logged day. */
  moodDaily: Point[]
  energyDaily: Point[]
  moodOnTraining?: number
  moodOffTraining?: number
  moodSampleOn: number
  moodSampleOff: number
}

const live = <T extends { deleted?: boolean }>(rows: T[]) => rows.filter((r) => !r.deleted)
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined)

function fmtLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

export function computeAnalytics(
  data: {
    journal: JournalEntry[]
    workouts: Workout[]
    sessions: Session[]
    habits: Habit[]
    habitChecks: HabitCheck[]
    bodyweights: Bodyweight[]
  },
  weeksBack = 12,
): Analytics {
  const journal = live(data.journal)
  const workouts = live(data.workouts)
  const sessions = live(data.sessions)
  const habits = live(data.habits).filter((h) => !h.archived)
  const checks = live(data.habitChecks)
  const bw = live(data.bodyweights)

  const thisWeek = weekStart(today())
  const weeks: WeekBucket[] = []
  for (let i = weeksBack - 1; i >= 0; i--) {
    const w = addDays(thisWeek, -7 * i)
    const next = addDays(w, 7)
    const inWeek = (date: string) => date >= w && date < next

    const wk = journal.filter((e) => inWeek(e.date))
    const sport = workouts.filter((x) => inWeek(x.date))
    const sess = sessions.filter((s) => inWeek(s.date))

    let volumeKg = 0
    for (const x of sport) for (const ex of x.exercises ?? []) for (const s of ex.sets) volumeKg += (s.weightKg ?? 0) * (s.reps ?? 0)

    // habit completion: checks that week / (active habits * days elapsed in week)
    const daysElapsed = Math.min(7, daysBetween(w, today()) + 1)
    const possible = habits.length * Math.max(1, daysElapsed)
    const did = checks.filter((c) => inWeek(c.date)).length
    const habitRate = habits.length ? Math.min(1, did / possible) : undefined

    weeks.push({
      week: w,
      label: fmtLabel(w),
      avgMood: avg(wk.filter((e) => typeof e.mood === 'number').map((e) => e.mood as number)),
      avgEnergy: avg(wk.filter((e) => typeof e.energy === 'number').map((e) => e.energy as number)),
      sportMin: sport.reduce((a, x) => a + (x.durationMin || 0), 0),
      learnMin: sess.filter((s) => s.area === 'learning').reduce((a, s) => a + s.minutes, 0),
      hobbyMin: sess.filter((s) => s.area === 'hobby').reduce((a, s) => a + s.minutes, 0),
      volumeKg: Math.round(volumeKg),
      habitRate,
    })
  }

  // mood on training days vs rest days (whole history with mood logged)
  const workoutDays = new Set(workouts.map((w) => w.date))
  const withMood = journal.filter((e) => typeof e.mood === 'number')
  const on = withMood.filter((e) => workoutDays.has(e.date)).map((e) => e.mood as number)
  const off = withMood.filter((e) => !workoutDays.has(e.date)).map((e) => e.mood as number)

  const bodyweight: Point[] = bw
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-90)
    .map((r) => ({ label: fmtLabel(r.date), value: r.kg, date: r.date }))

  // Daily mood/energy over the last 60 days (one point per logged day).
  const from60 = addDays(today(), -60)
  const recent = journal.filter((e) => e.date >= from60).sort((a, b) => a.date.localeCompare(b.date))
  const moodDaily: Point[] = recent
    .filter((e) => typeof e.mood === 'number')
    .map((e) => ({ label: fmtLabel(e.date), value: e.mood as number, date: e.date }))
  const energyDaily: Point[] = recent
    .filter((e) => typeof e.energy === 'number')
    .map((e) => ({ label: fmtLabel(e.date), value: e.energy as number, date: e.date }))

  return {
    weeks,
    bodyweight,
    moodDaily,
    energyDaily,
    moodOnTraining: avg(on),
    moodOffTraining: avg(off),
    moodSampleOn: on.length,
    moodSampleOff: off.length,
  }
}
