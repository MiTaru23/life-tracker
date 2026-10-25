import { db, getDeviceId, type Bodyweight, type Habit, type HabitCheck, type JournalEntry, type Task, type Workout } from './db'
import { daysBetween, streak, today } from './repo'

export interface LifeStats {
  node: string
  since?: string
  daysLogged: number
  journalEntries: number
  journalStreak: number
  workouts: number
  gymHours: number
  topExercise?: string
  longestStreak: number
  longestStreakHabit?: string
  bodyweightKg?: number
  tasksOpen: number
  tasksDone: number
}

const alive = <T extends { deleted?: boolean }>(rows: T[]) => rows.filter((r) => !r.deleted)

/** Compute a one-screen "about me" summary from the local data. */
export async function computeStats(): Promise<LifeStats> {
  const [journal, workouts, habits, checks, bw, tasks] = await Promise.all([
    db.journal.toArray(),
    db.workouts.toArray(),
    db.habits.toArray(),
    db.habitChecks.toArray(),
    db.bodyweights.toArray(),
    db.tasks.toArray(),
  ])
  const j = alive(journal as JournalEntry[])
  const w = alive(workouts as Workout[])
  const h = alive(habits as Habit[])
  const c = alive(checks as HabitCheck[])
  const b = alive(bw as Bodyweight[])
  const t = alive(tasks as Task[])
  const now = today()

  // Earliest dated record across journal, workouts, bodyweight.
  const dates = [...j.map((x) => x.date), ...w.map((x) => x.date), ...b.map((x) => x.date)].filter(Boolean).sort()
  const since = dates[0]

  const daysLogged = new Set([...j.map((x) => x.date), ...w.map((x) => x.date)]).size

  // Journal streak ending today/yesterday.
  const jDays = new Set(j.map((x) => x.date))
  let js = 0
  for (let d = jDays.has(now) ? now : shift(now, -1); jDays.has(d); d = shift(d, -1)) js++

  // Gym hours.
  const gymMin = w.reduce((s, x) => s + (x.durationMin || 0), 0)

  // Most frequent exercise.
  const exCount = new Map<string, number>()
  for (const wk of w) for (const ex of wk.exercises ?? []) exCount.set(ex.name, (exCount.get(ex.name) ?? 0) + 1)
  const topExercise = [...exCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]

  // Longest current habit streak.
  const doneSet = new Set(c.map((x) => `${x.habitId}|${x.date}`))
  let longestStreak = 0
  let longestStreakHabit: string | undefined
  for (const habit of h.filter((x) => !x.archived)) {
    const s = streak(habit.id, doneSet, now)
    if (s > longestStreak) {
      longestStreak = s
      longestStreakHabit = habit.name
    }
  }

  const latestBw = b.sort((a, b) => a.date.localeCompare(b.date))[b.length - 1]

  return {
    node: (await getDeviceId()).slice(0, 8),
    since,
    daysLogged,
    journalEntries: j.length,
    journalStreak: js,
    workouts: w.length,
    gymHours: Math.round(gymMin / 60),
    topExercise,
    longestStreak,
    longestStreakHabit,
    bodyweightKg: latestBw?.kg,
    tasksOpen: t.filter((x) => !x.done).length,
    tasksDone: t.filter((x) => x.done).length,
  }
}

/** Build the neofetch lines: info rows, to be rendered beside the avatar. */
export function statsLines(s: LifeStats): string[] {
  const rows: [string, string][] = [
    ['OS', 'LIFE/OS v0.3.0'],
    ['Kernel', '6.6.6-opsec'],
    ['Shell', 'lsh 1.0'],
    ['Uptime', s.since ? `${daysBetween(s.since, today())} days` : 'day one'],
    ['Logged', `${s.daysLogged} days`],
    ['Journal', `${s.journalEntries} entries · ${s.journalStreak}d streak`],
    ['Workouts', `${s.workouts} · ${s.gymHours}h total`],
  ]
  if (s.topExercise) rows.push(['Top lift', s.topExercise])
  if (s.longestStreakHabit) rows.push(['Best habit', `${s.longestStreakHabit} (${s.longestStreak}d)`])
  if (s.bodyweightKg) rows.push(['Bodyweight', `${s.bodyweightKg} kg`])
  rows.push(['Tasks', `${s.tasksOpen} open · ${s.tasksDone} done`])
  rows.push(['Crypto', 'AES-256-GCM'])

  const label = Math.max(...rows.map((r) => r[0].length))
  const head = `operator@node-${s.node}`
  return [head, '-'.repeat(head.length), ...rows.map(([k, v]) => `${k.padEnd(label)} : ${v}`)]
}

function shift(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const dt = new Date(y, m - 1, d + n)
  const p = (x: number) => String(x).padStart(2, '0')
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`
}
