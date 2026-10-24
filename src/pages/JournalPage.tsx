import { useEffect, useMemo, useRef, useState } from 'react'
import type { JournalEntry } from '../lib/db'
import { useAlive } from '../lib/hooks'
import { addDays, create, parseTags, remove, today, update } from '../lib/repo'
import { fmtDate } from '../lib/format'
import { Empty, Scale } from '../ui'

export default function JournalPage() {
  const entries = useAlive<JournalEntry>('journal')
  const [date, setDate] = useState(today)
  const [q, setQ] = useState('')

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (entries ?? [])
      .filter((e) => !needle || e.text.toLowerCase().includes(needle) || e.tags.some((t) => t.includes(needle)))
      .sort((a, b) => b.date.localeCompare(a.date))
  }, [entries, q])

  const entry = entries?.find((e) => e.date === date)

  return (
    <div className="split">
      <aside className="split-list">
        <input
          type="search"
          placeholder="grep entries…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search journal"
        />
        <button className="secondary full" onClick={() => setDate(today())}>
          + today
        </button>
        {entries && !list.length && <Empty>{q ? 'no match' : 'no entries yet'}</Empty>}
        <ul className="list">
          {list.map((e) => (
            <li key={e.id}>
              <button className={`list-item${e.date === date ? ' on' : ''}`} onClick={() => setDate(e.date)}>
                <span className="list-top">
                  <span>{fmtDate(e.date)}</span>
                  {e.mood !== undefined && <span className="dim">m{e.mood}</span>}
                </span>
                <span className="list-sub">{e.text.split('\n')[0] || '…'}</span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="split-main">
        <div className="date-nav">
          <button className="secondary" onClick={() => setDate(addDays(date, -1))} aria-label="Previous day">‹</button>
          <input type="date" value={date} max={today()} onChange={(e) => e.target.value && setDate(e.target.value)} />
          <button
            className="secondary"
            onClick={() => setDate(addDays(date, 1))}
            disabled={date >= today()}
            aria-label="Next day"
          >
            ›
          </button>
        </div>
        {/* key: remount the editor per day so its draft starts from that day's entry */}
        {entries && <Editor key={date} date={date} entry={entry} />}
      </section>
    </div>
  )
}

interface Draft {
  mood?: number
  energy?: number
  text: string
  tags: string
}

function Editor({ date, entry }: { date: string; entry?: JournalEntry }) {
  const [draft, setDraft] = useState<Draft>({
    mood: entry?.mood,
    energy: entry?.energy,
    text: entry?.text ?? '',
    tags: entry?.tags.join(', ') ?? '',
  })
  const [status, setStatus] = useState<'idle' | 'pending' | 'saved'>('idle')
  const idRef = useRef(entry?.id)
  const pending = useRef<Draft | null>(null)

  async function save(d: Draft) {
    pending.current = null
    const data = { date, mood: d.mood, energy: d.energy, text: d.text, tags: parseTags(d.tags) }
    if (idRef.current) {
      await update<JournalEntry>('journal', idRef.current, data)
    } else if (d.text.trim() || d.mood !== undefined || d.energy !== undefined) {
      idRef.current = (await create<JournalEntry>('journal', data)).id
    }
    setStatus('saved')
  }

  // Autosave 600ms after the last change.
  useEffect(() => {
    if (!pending.current) return
    const t = setTimeout(() => pending.current && save(pending.current), 600)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft])

  // Flush an unsaved draft when switching days or closing the window.
  useEffect(
    () => () => {
      if (pending.current) save(pending.current)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  function change(p: Partial<Draft>) {
    const next = { ...draft, ...p }
    pending.current = next
    setStatus('pending')
    setDraft(next)
  }

  async function onDelete() {
    if (!idRef.current || !confirm(`Delete the entry for ${fmtDate(date)}?`)) return
    pending.current = null
    await remove('journal', idRef.current)
    idRef.current = undefined
    setDraft({ text: '', tags: '' })
    setStatus('idle')
  }

  return (
    <div className="editor">
      <label className="field">
        <span>mood</span>
        <Scale label="Mood" max={10} value={draft.mood} onChange={(mood) => change({ mood })} />
      </label>
      <label className="field">
        <span>energy</span>
        <Scale label="Energy" max={10} value={draft.energy} onChange={(energy) => change({ energy })} />
      </label>
      <textarea
        className="journal-text"
        placeholder={`> field log ${date}\n> what happened, what did you learn, what's on your mind?`}
        value={draft.text}
        onChange={(e) => change({ text: e.target.value })}
        aria-label="Journal text"
      />
      <label className="field">
        <span>tags</span>
        <input
          placeholder="work, family, idea"
          value={draft.tags}
          onChange={(e) => change({ tags: e.target.value })}
        />
      </label>
      <div className="editor-foot">
        <span className={`save-state ${status}`}>
          {status === 'pending' ? '● writing…' : status === 'saved' ? '✓ saved to /dev/lifedb' : entry ? '✓ on disk' : '○ new entry'}
        </span>
        {idRef.current && (
          <button className="link danger" onClick={onDelete}>
            rm entry
          </button>
        )}
      </div>
    </div>
  )
}
