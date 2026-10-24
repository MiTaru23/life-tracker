import { useMemo } from 'react'
import type { Habit, HabitCheck, JournalEntry, Session, Workout } from '../lib/db'
import { useAlive } from '../lib/hooks'
import { streak, today, toggleHabit, weekStart } from '../lib/repo'
import { useWm } from '../os/wm'
import { fmtMin } from '../lib/format'
import { GoalMeter } from '../ui'

export default function TodayPage() {
  const { open } = useWm()
  const t = today()
  const week = weekStart(t)
  const journal = useAlive<JournalEntry>('journal')
  const workouts = useAlive<Workout>('workouts')
  const sessions = useAlive<Session>('sessions')
  const habits = useAlive<Habit>('habits')
  const checks = useAlive<HabitCheck>('habitChecks')

  const done = useMemo(() => new Set((checks ?? []).map((c) => `${c.habitId}|${c.date}`)), [checks])
  const activeHabits = (habits ?? []).filter((h) => !h.archived).sort((a, b) => a.createdAt - b.createdAt)
  const entry = journal?.find((e) => e.date === t)

  const sum = <T,>(rows: T[] | undefined, pick: (r: T) => boolean, val: (r: T) => number) =>
    (rows ?? []).filter(pick).reduce((a, r) => a + val(r), 0)

  const sportToday = sum(workouts, (w) => w.date === t, (w) => w.durationMin)
  const focusToday = sum(sessions, (s) => s.date === t, (s) => s.minutes)
  const habitsToday = activeHabits.filter((h) => done.has(`${h.id}|${t}`)).length

  const pretty = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <section>
      <div className="eyebrow">sitrep · {pretty}</div>
      <div className="grid">
        <Tile label="mood" value={entry?.mood ?? '–'} sub={entry ? 'logged' : 'no entry'} warn={!entry} />
        <Tile label="sport today" value={fmtMin(sportToday)} />
        <Tile label="learn + hobby" value={fmtMin(focusToday)} />
        <Tile label="habits" value={`${habitsToday}/${activeHabits.length}`} />
      </div>

      <div className="row actions">
        <button onClick={() => open('journal')}>{entry ? '✎ edit journal' : '✎ write journal'}</button>
        <button className="secondary" onClick={() => open('tracker')}>▦ log activity</button>
      </div>

      {activeHabits.length > 0 && (
        <div className="card">
          <h2>habits · today</h2>
          <ul className="checklist">
            {activeHabits.map((h) => {
              const on = done.has(`${h.id}|${t}`)
              return (
                <li key={h.id}>
                  <button className={`check-row${on ? ' on' : ''}`} onClick={() => toggleHabit(h.id, t)} aria-pressed={on}>
                    <span className="box">{on ? '[x]' : '[ ]'}</span>
                    <span className="grow">{h.name}</span>
                    <span className="dim">{streak(h.id, done, t)}d</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <div className="card">
        <h2>weekly targets</h2>
        <GoalMeter area="sport" value={sum(workouts, (w) => w.date >= week, (w) => w.durationMin)} />
        <GoalMeter area="learning" value={sum(sessions, (s) => s.area === 'learning' && s.date >= week, (s) => s.minutes)} />
        <GoalMeter area="hobby" value={sum(sessions, (s) => s.area === 'hobby' && s.date >= week, (s) => s.minutes)} label="hobbies" />
        <GoalMeter area="journal" value={(journal ?? []).filter((e) => e.date >= week).length} />
      </div>
    </section>
  )
}

function Tile({ label, value, sub, warn }: { label: string; value: string | number; sub?: string; warn?: boolean }) {
  return (
    <div className="card tile">
      <div className="tile-value">{value}</div>
      <div className="tile-label">
        {label}
        {sub && <span className={warn ? ' warn' : ''}> · {sub}</span>}
      </div>
    </div>
  )
}
