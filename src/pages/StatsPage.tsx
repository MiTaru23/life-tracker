import { useMemo } from 'react'
import type { Bodyweight, Habit, HabitCheck, JournalEntry, Session, Workout } from '../lib/db'
import { useAlive } from '../lib/hooks'
import { computeAnalytics, type WeekBucket } from '../lib/analytics'
import { Bars, Compare, Line } from '../ui-charts'
import { Empty } from '../ui'

export default function StatsPage() {
  const journal = useAlive<JournalEntry>('journal')
  const workouts = useAlive<Workout>('workouts')
  const sessions = useAlive<Session>('sessions')
  const habits = useAlive<Habit>('habits')
  const habitChecks = useAlive<HabitCheck>('habitChecks')
  const bodyweights = useAlive<Bodyweight>('bodyweights')

  const loaded = [journal, workouts, sessions, habits, habitChecks, bodyweights].every((x) => x !== undefined)

  const a = useMemo(() => {
    if (!loaded) return null
    return computeAnalytics({
      journal: journal!,
      workouts: workouts!,
      sessions: sessions!,
      habits: habits!,
      habitChecks: habitChecks!,
      bodyweights: bodyweights!,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, journal, workouts, sessions, habits, habitChecks, bodyweights])

  if (!a) return null

  const w = a.weeks
  const series = (pick: (b: WeekBucket) => number | undefined) =>
    w.map((b) => ({ label: b.label, value: pick(b) ?? 0, date: b.week }))
  const hasAny = (pick: (b: WeekBucket) => number | undefined) => w.some((b) => (pick(b) ?? 0) > 0)

  const nothing =
    !hasAny((b) => b.sportMin) &&
    !hasAny((b) => b.learnMin) &&
    !hasAny((b) => b.hobbyMin) &&
    !a.bodyweight.length &&
    !w.some((b) => b.avgMood != null)

  if (nothing) {
    return (
      <section>
        <Empty>no data to chart yet — log some journal entries, workouts or habits and they'll show up here.</Empty>
      </section>
    )
  }

  return (
    <section className="stats">
      <div className="eyebrow">last {w.length} weeks</div>

      {a.moodOnTraining != null && a.moodOffTraining != null && a.moodSampleOn >= 2 && a.moodSampleOff >= 2 && (
        <div className="card">
          <h2>mood · training vs rest days</h2>
          <Compare
            a={{ label: 'training days', value: a.moodOnTraining }}
            b={{ label: 'other days', value: a.moodOffTraining }}
          />
        </div>
      )}

      {a.moodDaily.length >= 2 && (
        <div className="card">
          <h2>mood · daily</h2>
          <Line data={a.moodDaily} unit="/10" max={10} dp={0} />
        </div>
      )}
      {a.energyDaily.length >= 2 && (
        <div className="card">
          <h2>energy · daily</h2>
          <Line data={a.energyDaily} unit="/10" max={10} dp={0} />
        </div>
      )}

      {hasAny((b) => b.sportMin) && (
        <div className="card">
          <h2>sport min / week</h2>
          <Bars data={series((b) => b.sportMin)} unit="min" />
        </div>
      )}
      {hasAny((b) => b.volumeKg) && (
        <div className="card">
          <h2>gym volume / week</h2>
          <Bars data={series((b) => b.volumeKg)} unit="kg" />
        </div>
      )}
      {hasAny((b) => b.learnMin) && (
        <div className="card">
          <h2>learning min / week</h2>
          <Bars data={series((b) => b.learnMin)} unit="min" />
        </div>
      )}
      {hasAny((b) => b.hobbyMin) && (
        <div className="card">
          <h2>hobby min / week</h2>
          <Bars data={series((b) => b.hobbyMin)} unit="min" />
        </div>
      )}

      {w.some((b) => b.habitRate != null) && (
        <div className="card">
          <h2>habit completion / week</h2>
          <Bars data={w.map((b) => ({ label: b.label, value: Math.round((b.habitRate ?? 0) * 100) }))} unit="%" max={100} />
        </div>
      )}

      {a.bodyweight.length >= 2 && (
        <div className="card">
          <h2>bodyweight</h2>
          <Line data={a.bodyweight} unit="kg" dp={1} />
        </div>
      )}
    </section>
  )
}
