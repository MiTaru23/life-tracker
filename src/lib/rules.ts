import type {
  Bodyweight,
  Goal,
  GoalArea,
  Habit,
  HabitCheck,
  Hobby,
  JournalEntry,
  LearningItem,
  Session,
  Workout,
} from './db'
import { daysBetween, streak, today, weekStart } from './repo'

/** A recommendation candidate produced by the rule engine. */
export interface RuleHit {
  id: string // stable, so feedback/dismissal sticks across recomputes
  area: GoalArea | 'general'
  title: string
  body: string
  /** Higher = more important; used for ordering. */
  priority: number
}

export interface RuleInput {
  journal: JournalEntry[]
  workouts: Workout[]
  learning: LearningItem[]
  hobbies: Hobby[]
  sessions: Session[]
  habits: Habit[]
  habitChecks: HabitCheck[]
  goals: Goal[]
  bodyweights: Bodyweight[]
}

function goalFor(goals: Goal[], area: GoalArea): number | undefined {
  return goals.find((g) => g.area === area && !g.deleted)?.perWeek
}

function daysAgoLabel(n: number): string {
  return n === 0 ? 'today' : n === 1 ? 'yesterday' : `${n} days ago`
}

/**
 * Pure, deterministic rule engine. Reads the current data and returns nudges
 * and insights for today. Same input + same day => same output (stable ids),
 * so a 👍/👎 or dismissal recorded against an id stays attached.
 */
export function computeRules(d: RuleInput): RuleHit[] {
  const t = today()
  const week = weekStart(t)
  const dow = new Date().getDay() // 0 = Sun
  const out: RuleHit[] = []

  /* ---- sport ---- */
  const workouts = d.workouts.filter((w) => !w.deleted).sort((a, b) => b.date.localeCompare(a.date))
  const lastWorkout = workouts[0]
  const sinceSport = lastWorkout ? daysBetween(lastWorkout.date, t) : Infinity
  if (sinceSport >= 3) {
    out.push({
      id: 'rule:no-sport',
      area: 'sport',
      title: lastWorkout ? `No training in ${sinceSport} days` : 'No workouts logged yet',
      body: lastWorkout
        ? `Your last session was ${daysAgoLabel(sinceSport)} (${lastWorkout.type}). A short session today keeps the streak alive.`
        : 'Log your first workout to start tracking your sport.',
      priority: Math.min(60 + sinceSport * 3, 90),
    })
  }

  const sportGoal = goalFor(d.goals, 'sport')
  const sportWeek = workouts.filter((w) => w.date >= week).reduce((s, w) => s + w.durationMin, 0)
  // From Thursday on, flag if less than ~60% of the weekly target is done.
  if (sportGoal && dow >= 4 && sportWeek < sportGoal * 0.6) {
    out.push({
      id: 'rule:sport-behind',
      area: 'sport',
      title: 'Behind on your weekly sport goal',
      body: `${sportWeek} of ${sportGoal} min done this week. ${sportGoal - sportWeek} min left with the weekend ahead.`,
      priority: 55,
    })
  }

  /* ---- learning ---- */
  const learnSessions = d.sessions.filter((s) => !s.deleted && s.area === 'learning')
  const learnGoal = goalFor(d.goals, 'learning')
  const learnWeek = learnSessions.filter((s) => s.date >= week).reduce((a, s) => a + s.minutes, 0)
  if (learnGoal && dow >= 5 && learnWeek < learnGoal * 0.6) {
    out.push({
      id: 'rule:learning-behind',
      area: 'learning',
      title: 'Learning time is low this week',
      body: `${learnWeek} of ${learnGoal} min this week. Even 20 focused minutes moves the needle.`,
      priority: 45,
    })
  }

  // Active learning item with no session in 14+ days.
  for (const item of d.learning.filter((i) => !i.deleted && i.status === 'active')) {
    const own = learnSessions.filter((s) => s.refId === item.id)
    const last = own.reduce((m, s) => (s.date > m ? s.date : m), '')
    const gap = last ? daysBetween(last, t) : daysBetween(item.createdAt ? toDate(item.createdAt) : t, t)
    if (gap >= 14) {
      out.push({
        id: `rule:learn-stale:${item.id}`,
        area: 'learning',
        title: `"${item.title}" has stalled`,
        body: last ? `No progress in ${gap} days. Pick it back up or park it as planned.` : 'You added this but haven\'t logged time yet.',
        priority: 35,
      })
    }
  }

  /* ---- hobbies ---- */
  const hobbySessions = d.sessions.filter((s) => !s.deleted && s.area === 'hobby')
  for (const h of d.hobbies.filter((x) => !x.deleted && !x.archived)) {
    const own = hobbySessions.filter((s) => s.refId === h.id)
    const last = own.reduce((m, s) => (s.date > m ? s.date : m), '')
    const gap = last ? daysBetween(last, t) : Infinity
    if (gap >= 10) {
      out.push({
        id: `rule:hobby-neglect:${h.id}`,
        area: 'hobby',
        title: `${h.name}: ${last ? `${gap} days` : 'a while'} untouched`,
        body: last ? `Last time was ${daysAgoLabel(gap)}. Carve out a little time for it this week.` : 'You added this hobby but haven\'t logged any time yet.',
        priority: 30,
      })
    }
  }

  /* ---- journal ---- */
  const journal = d.journal.filter((e) => !e.deleted).sort((a, b) => b.date.localeCompare(a.date))
  const lastEntry = journal[0]
  const sinceEntry = lastEntry ? daysBetween(lastEntry.date, t) : Infinity
  if (sinceEntry >= 2) {
    out.push({
      id: 'rule:journal-gap',
      area: 'journal',
      title: lastEntry ? `No journal for ${sinceEntry} days` : 'Start your journal',
      body: 'A couple of lines about today is enough. Future you will thank you.',
      priority: 40,
    })
  }

  /* ---- habits: a broken streak worth saving ---- */
  const done = new Set(d.habitChecks.filter((c) => !c.deleted).map((c) => `${c.habitId}|${c.date}`))
  for (const h of d.habits.filter((x) => !x.deleted && !x.archived)) {
    const yday = shift(t, -1)
    const doneToday = done.has(`${h.id}|${t}`)
    const st = streak(h.id, done, yday) // streak as of yesterday
    if (!doneToday && st >= 3) {
      out.push({
        id: `rule:habit-save:${h.id}`,
        area: 'general',
        title: `Keep your ${st}-day streak: ${h.name}`,
        body: `You've done "${h.name}" ${st} days running. Check it off today to keep it going.`,
        priority: 50 + Math.min(st, 20),
      })
    }
  }

  /* ---- insight: mood on training days ---- */
  const workoutDays = new Set(workouts.map((w) => w.date))
  const withMood = journal.filter((e) => typeof e.mood === 'number')
  if (withMood.length >= 8) {
    const on = withMood.filter((e) => workoutDays.has(e.date)).map((e) => e.mood as number)
    const off = withMood.filter((e) => !workoutDays.has(e.date)).map((e) => e.mood as number)
    if (on.length >= 3 && off.length >= 3) {
      const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
      const diff = avg(on) - avg(off)
      if (diff >= 1) {
        out.push({
          id: 'rule:mood-sport',
          area: 'general',
          title: 'You feel better on training days',
          body: `Your mood averages ${avg(on).toFixed(1)} on days you train vs ${avg(off).toFixed(1)} otherwise. Worth remembering on a low day.`,
          priority: 25,
        })
      }
    }
  }

  /* ---- insight: bodyweight trend ---- */
  const bw = d.bodyweights.filter((b) => !b.deleted).sort((a, b) => a.date.localeCompare(b.date))
  if (bw.length >= 2) {
    const latest = bw[bw.length - 1]
    const monthAgo = shift(t, -30)
    const prior = [...bw].reverse().find((r) => r.date <= monthAgo)
    if (prior && latest.date >= shift(t, -7)) {
      const delta = Math.round((latest.kg - prior.kg) * 10) / 10
      if (Math.abs(delta) >= 1) {
        out.push({
          id: 'rule:bodyweight-trend',
          area: 'general',
          title: `Bodyweight ${delta > 0 ? 'up' : 'down'} ${Math.abs(delta)} kg in a month`,
          body: `From ${prior.kg} to ${latest.kg} kg. ${delta > 0 ? 'Trending up' : 'Trending down'} — in line with your goal?`,
          priority: 20,
        })
      }
    }
  }

  return out.sort((a, b) => b.priority - a.priority)
}

function shift(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const dt = new Date(y, m - 1, d + n)
  const p = (x: number) => String(x).padStart(2, '0')
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`
}

function toDate(ms: number): string {
  const dt = new Date(ms)
  const p = (x: number) => String(x).padStart(2, '0')
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`
}
