import { useMemo, useState, type FormEvent } from 'react'
import type { Habit, HabitCheck, Hobby, LearningItem, LearningKind, LearningStatus, Session, Workout } from '../lib/db'
import { useAlive } from '../lib/hooks'
import { addDays, create, daysBetween, remove, streak, toggleHabit, today, update, weekStart } from '../lib/repo'
import { fmtDate, fmtMin } from '../lib/format'
import { Empty, GoalMeter, Scale, Tabs } from '../ui'

const TABS = ['sport', 'knowledge', 'hobbies', 'habits'] as const
type Tab = (typeof TABS)[number]

export default function TrackerPage() {
  const [tab, setTab] = useState<Tab>(() => {
    try {
      return (localStorage.getItem('lifeos.tracker.tab') as Tab) || 'sport'
    } catch {
      return 'sport'
    }
  })
  function pick(t: Tab) {
    setTab(t)
    try {
      localStorage.setItem('lifeos.tracker.tab', t)
    } catch {
      /* ignore */
    }
  }

  return (
    <div>
      <Tabs tabs={TABS} value={tab} onChange={pick} />
      {tab === 'sport' && <Sport />}
      {tab === 'knowledge' && <Knowledge />}
      {tab === 'hobbies' && <Hobbies />}
      {tab === 'habits' && <Habits />}
    </div>
  )
}

/* ---------------- sport ---------------- */

function Sport() {
  const workouts = useAlive<Workout>('workouts')
  const [date, setDate] = useState(today)
  const [type, setType] = useState('')
  const [minutes, setMinutes] = useState('30')
  const [intensity, setIntensity] = useState<number | undefined>(3)
  const [notes, setNotes] = useState('')

  const sorted = useMemo(
    () => [...(workouts ?? [])].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt),
    [workouts],
  )
  const types = useMemo(() => [...new Set(sorted.map((w) => w.type))], [sorted])
  const week = weekStart()
  const weekMin = sorted.filter((w) => w.date >= week).reduce((s, w) => s + w.durationMin, 0)
  const last = sorted[0]

  async function submit(e: FormEvent) {
    e.preventDefault()
    const durationMin = Number(minutes)
    if (!type.trim() || !(durationMin > 0)) return
    await create<Workout>('workouts', { date, type: type.trim(), durationMin, intensity, notes: notes.trim() || undefined })
    setNotes('')
  }

  return (
    <>
      <div className="card">
        <GoalMeter area="sport" value={weekMin} />
        {last && (
          <p className={`small ${daysBetween(last.date, today()) >= 3 ? 'warn' : 'dim'}`}>
            last session: {last.type}, {daysAgo(last.date)}
          </p>
        )}
      </div>

      <form className="card form" onSubmit={submit}>
        <h2>log workout</h2>
        <div className="form-row">
          <label className="field grow">
            <span>type</span>
            <input list="workout-types" placeholder="run, gym, climbing…" value={type} onChange={(e) => setType(e.target.value)} required />
            <datalist id="workout-types">
              {types.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </label>
          <label className="field">
            <span>minutes</span>
            <input type="number" min={1} value={minutes} onChange={(e) => setMinutes(e.target.value)} required className="num" />
          </label>
          <label className="field">
            <span>date</span>
            <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>
        <label className="field">
          <span>intensity</span>
          <Scale label="Intensity" max={5} value={intensity} onChange={setIntensity} />
        </label>
        <div className="form-row">
          <input className="grow" placeholder="notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} aria-label="Notes" />
          <button>+ log</button>
        </div>
      </form>

      <div className="card">
        <h2>history</h2>
        {workouts && !sorted.length && <Empty>no workouts logged</Empty>}
        <table className="tbl">
          <tbody>
            {sorted.slice(0, 40).map((w) => (
              <tr key={w.id}>
                <td className="dim">{fmtDate(w.date)}</td>
                <td>{w.type}</td>
                <td className="r">{fmtMin(w.durationMin)}</td>
                <td className="dim">{w.intensity ? '▮'.repeat(w.intensity) : ''}</td>
                <td className="dim ellipsis">{w.notes}</td>
                <td className="r">
                  <button className="x" onClick={() => remove('workouts', w.id)} aria-label="Delete workout">×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

/* ---------------- knowledge ---------------- */

const KINDS: LearningKind[] = ['book', 'course', 'topic', 'video', 'other']
const STATUSES: LearningStatus[] = ['active', 'planned', 'done', 'dropped']
const FILTERS = ['active', 'planned', 'done', 'all'] as const

function Knowledge() {
  const items = useAlive<LearningItem>('learning')
  const sessions = useAlive<Session>('sessions')
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('active')
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<LearningKind>('book')

  const learnSessions = (sessions ?? []).filter((s) => s.area === 'learning')
  const week = weekStart()
  const weekMin = learnSessions.filter((s) => s.date >= week).reduce((a, s) => a + s.minutes, 0)
  const shown = (items ?? [])
    .filter((i) => filter === 'all' || i.status === filter)
    .sort((a, b) => b.updatedAt - a.updatedAt)

  async function add(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    await create<LearningItem>('learning', { title: title.trim(), kind, status: 'active', tags: [] })
    setTitle('')
    setFilter('active')
  }

  return (
    <>
      <div className="card">
        <GoalMeter area="learning" value={weekMin} />
      </div>

      <form className="card form-row" onSubmit={add}>
        <input className="grow" placeholder="new book, course, topic…" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Title" />
        <select value={kind} onChange={(e) => setKind(e.target.value as LearningKind)} aria-label="Kind">
          {KINDS.map((k) => (
            <option key={k}>{k}</option>
          ))}
        </select>
        <button>+ add</button>
      </form>

      <Tabs tabs={FILTERS} value={filter} onChange={setFilter} />
      {items && !shown.length && <Empty>nothing here</Empty>}
      {shown.map((item) => {
        const own = learnSessions.filter((s) => s.refId === item.id)
        const total = own.reduce((a, s) => a + s.minutes, 0)
        const lastDate = own.reduce((m, s) => (s.date > m ? s.date : m), '')
        return (
          <div className="card item" key={item.id}>
            <div className="item-head">
              <span className="badge">{item.kind}</span>
              <strong className="grow">{item.title}</strong>
              <select
                value={item.status}
                onChange={(e) => update<LearningItem>('learning', item.id, { status: e.target.value as LearningStatus })}
                aria-label="Status"
              >
                {STATUSES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="item-meta">
              <span>total {fmtMin(total)}</span>
              {lastDate && <span>last {daysAgo(lastDate)}</span>}
            </div>
            <Notes
              value={item.notes}
              onSave={(notes) => update<LearningItem>('learning', item.id, { notes })}
              onDelete={() => confirm(`Delete "${item.title}"?`) && remove('learning', item.id)}
            />
            {item.status !== 'done' && item.status !== 'dropped' && <LogTime area="learning" refId={item.id} />}
          </div>
        )
      })}
    </>
  )
}

/* ---------------- hobbies ---------------- */

function Hobbies() {
  const hobbies = useAlive<Hobby>('hobbies')
  const sessions = useAlive<Session>('sessions')
  const [name, setName] = useState('')

  const hobbySessions = (sessions ?? []).filter((s) => s.area === 'hobby')
  const week = weekStart()
  const weekMin = hobbySessions.filter((s) => s.date >= week).reduce((a, s) => a + s.minutes, 0)
  const active = (hobbies ?? []).filter((h) => !h.archived)

  async function add(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    await create<Hobby>('hobbies', { name: name.trim() })
    setName('')
  }

  return (
    <>
      <div className="card">
        <GoalMeter area="hobby" value={weekMin} label="hobbies" />
      </div>
      <form className="card form-row" onSubmit={add}>
        <input className="grow" placeholder="new hobby…" value={name} onChange={(e) => setName(e.target.value)} aria-label="Hobby name" />
        <button>+ add</button>
      </form>
      {hobbies && !active.length && <Empty>no hobbies yet</Empty>}
      {active.map((h) => {
        const own = hobbySessions.filter((s) => s.refId === h.id)
        const total = own.reduce((a, s) => a + s.minutes, 0)
        const thisWeek = own.filter((s) => s.date >= week).reduce((a, s) => a + s.minutes, 0)
        const lastDate = own.reduce((m, s) => (s.date > m ? s.date : m), '')
        const stale = !lastDate || daysBetween(lastDate, today()) > 7
        return (
          <div className="card item" key={h.id}>
            <div className="item-head">
              <strong className="grow">{h.name}</strong>
              <button className="link" onClick={() => update<Hobby>('hobbies', h.id, { archived: true })}>archive</button>
            </div>
            <div className="item-meta">
              <span>week {fmtMin(thisWeek)}</span>
              <span>total {fmtMin(total)}</span>
              <span className={stale ? 'warn' : ''}>{lastDate ? `last ${daysAgo(lastDate)}` : 'never done'}</span>
            </div>
            <LogTime area="hobby" refId={h.id} />
          </div>
        )
      })}
    </>
  )
}

/* ---------------- habits ---------------- */

function Habits() {
  const habits = useAlive<Habit>('habits')
  const checks = useAlive<HabitCheck>('habitChecks')
  const [name, setName] = useState('')
  const t = today()
  const days = Array.from({ length: 7 }, (_, i) => addDays(t, i - 6))
  const done = useMemo(() => new Set((checks ?? []).map((c) => `${c.habitId}|${c.date}`)), [checks])
  const active = (habits ?? []).filter((h) => !h.archived).sort((a, b) => a.createdAt - b.createdAt)

  async function add(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    await create<Habit>('habits', { name: name.trim() })
    setName('')
  }

  return (
    <>
      <form className="card form-row" onSubmit={add}>
        <input className="grow" placeholder="new habit (read 20 min, no sugar…)" value={name} onChange={(e) => setName(e.target.value)} aria-label="Habit name" />
        <button>+ add</button>
      </form>
      {habits && !active.length && <Empty>no habits yet</Empty>}
      {active.length > 0 && (
        <div className="card scroll-x">
          <table className="habit-grid">
            <thead>
              <tr>
                <th />
                {days.map((d) => (
                  <th key={d} className={d === t ? 'today' : ''}>
                    {fmtDate(d).slice(0, 2)}
                  </th>
                ))}
                <th>streak</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {active.map((h) => (
                <tr key={h.id}>
                  <td className="habit-name">{h.name}</td>
                  {days.map((d) => {
                    const on = done.has(`${h.id}|${d}`)
                    return (
                      <td key={d}>
                        <button
                          className={`check${on ? ' on' : ''}`}
                          onClick={() => toggleHabit(h.id, d)}
                          aria-pressed={on}
                          aria-label={`${h.name} ${d}`}
                        >
                          {on ? '■' : '·'}
                        </button>
                      </td>
                    )
                  })}
                  <td className="r">{streak(h.id, done, t)}</td>
                  <td className="r">
                    <button className="x" onClick={() => update<Habit>('habits', h.id, { archived: true })} aria-label="Archive habit">×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

/* ---------------- shared bits ---------------- */

function LogTime({ area, refId }: { area: Session['area']; refId: string }) {
  const [min, setMin] = useState('')
  async function submit(e: FormEvent) {
    e.preventDefault()
    const minutes = Number(min)
    if (!(minutes > 0)) return
    await create<Session>('sessions', { date: today(), area, refId, minutes })
    setMin('')
  }
  return (
    <form className="form-row log" onSubmit={submit}>
      <input type="number" min={1} placeholder="min" value={min} onChange={(e) => setMin(e.target.value)} className="num" aria-label="Minutes" />
      <button className="secondary">+ log time</button>
      {[15, 30, 60].map((m) => (
        <button
          key={m}
          type="button"
          className="secondary chip"
          onClick={() => create<Session>('sessions', { date: today(), area, refId, minutes: m })}
        >
          +{m}
        </button>
      ))}
    </form>
  )
}

function Notes({ value, onSave, onDelete }: { value?: string; onSave: (v: string) => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="notes">
      <div className="row">
        <button className="link" onClick={() => setOpen((o) => !o)}>{open ? '▾ notes' : `▸ notes${value ? ' ·' : ''}`}</button>
        <button className="link danger" onClick={onDelete}>rm</button>
      </div>
      {open && <textarea defaultValue={value} onBlur={(e) => e.target.value !== (value ?? '') && onSave(e.target.value)} aria-label="Notes" />}
    </div>
  )
}

function daysAgo(date: string): string {
  const n = daysBetween(date, today())
  return n === 0 ? 'today' : n === 1 ? 'yesterday' : `${n} days ago`
}
