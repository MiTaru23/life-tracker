import { useMemo, useState, type FormEvent } from 'react'
import type { Task } from '../lib/db'
import { useAlive } from '../lib/hooks'
import { create, remove, update } from '../lib/repo'
import { Empty } from '../ui'

export default function TasksPage() {
  const tasks = useAlive<Task>('tasks')
  const [text, setText] = useState('')
  const [showDone, setShowDone] = useState(false)

  const { open, done } = useMemo(() => {
    const all = tasks ?? []
    const open = all
      .filter((t) => !t.done)
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a.createdAt - b.createdAt)
    const done = all.filter((t) => t.done).sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0))
    return { open, done }
  }, [tasks])

  async function add(e: FormEvent) {
    e.preventDefault()
    const v = text.trim()
    if (!v) return
    await create<Task>('tasks', { text: v, done: false })
    setText('')
  }

  async function toggle(t: Task) {
    await update<Task>('tasks', t.id, { done: !t.done, doneAt: t.done ? undefined : Date.now() })
  }

  if (!tasks) return null

  return (
    <section>
      <form className="form-row" onSubmit={add}>
        <input
          className="grow"
          placeholder="new task…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="New task"
          autoFocus
        />
        <button>+ add</button>
      </form>

      <div className="eyebrow">queue · {open.length} open</div>
      {!open.length && <Empty>inbox zero — nothing queued</Empty>}
      <ul className="tasklist">
        {open.map((t) => (
          <Row key={t.id} t={t} onToggle={() => toggle(t)} />
        ))}
      </ul>

      {done.length > 0 && (
        <>
          <button className="link" onClick={() => setShowDone((s) => !s)}>
            {showDone ? '▾' : '▸'} done · {done.length}
          </button>
          {showDone && (
            <ul className="tasklist done-list">
              {done.map((t) => (
                <Row key={t.id} t={t} onToggle={() => toggle(t)} />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  )
}

function Row({ t, onToggle }: { t: Task; onToggle: () => void }) {
  return (
    <li className={`task-row${t.done ? ' is-done' : ''}`}>
      <button className="box" onClick={onToggle} aria-pressed={t.done} aria-label={t.done ? 'Mark open' : 'Mark done'}>
        {t.done ? '[x]' : '[ ]'}
      </button>
      {t.priority ? <span className="star">★</span> : null}
      <span className="task-text grow">{t.text}</span>
      {!t.done && (
        <button
          className="link star-btn"
          title={t.priority ? 'Unstar' : 'Star'}
          onClick={() => update<Task>('tasks', t.id, { priority: t.priority ? 0 : 1 })}
        >
          {t.priority ? '☆' : '★'}
        </button>
      )}
      <button className="x" onClick={() => remove('tasks', t.id)} aria-label="Delete task">×</button>
    </li>
  )
}
