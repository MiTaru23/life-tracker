import { useMemo, useState, type FormEvent } from 'react'
import type {
  Bodyweight,
  ExerciseSet,
  Habit,
  HabitCheck,
  Hobby,
  LearningItem,
  LearningKind,
  LearningStatus,
  Session,
  Workout,
} from '../lib/db'
import { useAlive } from '../lib/hooks'
import { addDays, create, daysBetween, remove, streak, toggleHabit, today, update, weekStart } from '../lib/repo'
import { fmtDate, fmtMin } from '../lib/format'
import { Empty, GoalMeter, Scale, Sparkline, Tabs } from '../ui'

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

      <BodyweightPanel />

      <div className="card">
        <h2>history</h2>
        {workouts && !sorted.length && <Empty>no workouts logged</Empty>}
        <ul className="wlist">
          {sorted.slice(0, 60).map((w) => (
            <WorkoutRow key={w.id} w={w} />
          ))}
        </ul>
      </div>
    </>
  )
}

/** One workout: compact line, expandable to exercises + sets for imported gym sessions. */
function WorkoutRow({ w }: { w: Workout }) {
  const [open, setOpen] = useState(false)
  const hasDetail = !!w.exercises?.length
  return (
    <li className="witem">
      <div className="wrow">
        <button
          className={`wmain${hasDetail ? ' expandable' : ''}`}
          onClick={() => hasDetail && setOpen((o) => !o)}
          aria-expanded={hasDetail ? open : undefined}
        >
          <span className="dim wdate">{fmtDate(w.date)}</span>
          {hasDetail && <span className="caret">{open ? '▾' : '▸'}</span>}
          <span className="wtype grow">
            {w.type}
            {w.source === 'liftoff' && <span className="src">liftoff</span>}
          </span>
          {w.prCount ? <span className="pr">★{w.prCount} PR</span> : null}
          {w.intensity ? <span className="dim">{'▮'.repeat(w.intensity)}</span> : null}
          <span className="dim r wdur">{fmtMin(w.durationMin)}</span>
        </button>
        <button className="x" onClick={() => confirm('Delete this workout?') && remove('workouts', w.id)} aria-label="Delete workout">×</button>
      </div>
      {!hasDetail && w.notes && <div className="wnote dim">{w.notes}</div>}
      {open && hasDetail && (
        <div className="wdetail">
          {w.notes && <div className="wnote dim">{w.notes}</div>}
          {w.exercises!.map((ex, i) => (
            <div className="exrow" key={i}>
              <div className="exname">
                {ex.name}
                {ex.notes && <span className="dim exnote"> — {ex.notes}</span>}
              </div>
              <div className="sets">
                {ex.sets.map((s, j) => (
                  <span key={j} className={`set${s.warmup ? ' warm' : ''}`}>{fmtSet(s)}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </li>
  )
}

function fmtSet(s: ExerciseSet): string {
  if (s.seconds) return s.seconds >= 60 ? `${Math.floor(s.seconds / 60)}:${String(s.seconds % 60).padStart(2, '0')}` : `${s.seconds}s`
  if (s.weightKg && s.reps != null) return `${s.weightKg}×${s.reps}`
  if (s.weightKg) return `${s.weightKg}kg`
  if (s.reps != null) return `×${s.reps}`
  return '—'
}

/** Bodyweight: latest value, 30-day trend, sparkline, manual entry. */
function BodyweightPanel() {
  const rows = useAlive<Bodyweight>('bodyweights')
  const [kg, setKg] = useState('')
  const sorted = useMemo(() => [...(rows ?? [])].sort((a, b) => a.date.localeCompare(b.date)), [rows])
  if (!rows) return null

  const latest = sorted[sorted.length - 1]
  const monthAgo = addDays(today(), -30)
  const prior = [...sorted].reverse().find((r) => r.date <= monthAgo)
  const delta = latest && prior ? Math.round((latest.kg - prior.kg) * 10) / 10 : undefined

  async function add(e: FormEvent) {
    e.preventDefault()
    const v = Number(kg)
    if (!(v > 0)) return
    const d = today()
    // One record per day; overwrite if present (same id scheme as imports).
    await create<Bodyweight>('bodyweights', { id: `bw-${d}`, date: d, kg: Math.round(v * 10) / 10 })
    setKg('')
  }

  return (
    <div className="card">
      <h2>bodyweight</h2>
      {latest ? (
        <div className="bw">
          <span className="bw-now">{latest.kg}<span className="dim"> kg</span></span>
          {delta !== undefined && (
            <span className={delta > 0 ? 'warn' : delta < 0 ? 'ok' : 'dim'}>
              {delta > 0 ? '▲' : delta < 0 ? '▼' : '='} {Math.abs(delta)} kg / 30d
            </span>
          )}
          <Sparkline values={sorted.slice(-60).map((r) => r.kg)} />
        </div>
      ) : (
        <Empty>no bodyweight logged — import from Liftoff or add below</Empty>
      )}
      <form className="form-row log" onSubmit={add}>
        <input type="number" step="0.1" min={1} placeholder="kg today" value={kg} onChange={(e) => setKg(e.target.value)} className="num" aria-label="Bodyweight kg" />
        <button className="secondary">+ log</button>
      </form>
    </div>
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
