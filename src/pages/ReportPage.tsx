import { useMemo, useState } from 'react'
import type { Suggestion } from '../lib/db'
import { useAlive } from '../lib/hooks'
import { setSuggestionState } from '../lib/repo'
import { Empty } from '../ui'

const AREA_GLYPH: Record<string, string> = { sport: '▦', learning: '◈', hobby: '♪', journal: '✎', general: '◆' }

export default function ReportPage() {
  const stored = useAlive<Suggestion>('suggestions')
  const [week, setWeek] = useState<string | null>(null)

  const byWeek = useMemo(() => {
    const ai = (stored ?? []).filter((s) => s.source === 'ai' && !s.deleted)
    const weeks = new Map<string, { review?: Suggestion; items: Suggestion[] }>()
    for (const s of ai) {
      const w = s.week ?? 'unknown'
      if (!weeks.has(w)) weeks.set(w, { items: [] })
      const g = weeks.get(w)!
      if (s.id.endsWith('-review')) g.review = s
      else g.items.push(s)
    }
    return weeks
  }, [stored])

  const weeks = [...byWeek.keys()].sort((a, b) => b.localeCompare(a))
  const current = week && byWeek.has(week) ? week : weeks[0]

  if (!stored) return null
  if (!weeks.length) {
    return (
      <section>
        <Empty>no report yet — run the PC upload (import-liftoff.cmd) to generate your first weekly review, then sync.</Empty>
      </section>
    )
  }

  const g = byWeek.get(current!)!

  return (
    <section className="report">
      <div className="report-head">
        <div className="eyebrow">weekly report</div>
        {weeks.length > 1 && (
          <select value={current} onChange={(e) => setWeek(e.target.value)} aria-label="Week">
            {weeks.map((w) => (
              <option key={w} value={w}>week of {w}</option>
            ))}
          </select>
        )}
      </div>

      {g.review && (
        <div className="card report-review">
          <div className="report-title">// week of {current}</div>
          <p>{g.review.body}</p>
        </div>
      )}

      <div className="eyebrow">suggestions · {g.items.length}</div>
      {g.items.map((s) => (
        <div className="card intel" key={s.id}>
          <div className="intel-head">
            <span className="intel-glyph">{AREA_GLYPH[s.area] ?? '◆'}</span>
            <strong className="grow">{s.title}</strong>
          </div>
          <p className="intel-body">{s.body}</p>
          <div className="intel-foot">
            <button
              className={`vote${s.feedback === 'up' ? ' on' : ''}`}
              onClick={() => setSuggestionState(s, { feedback: s.feedback === 'up' ? undefined : 'up' })}
            >
              👍 helpful
            </button>
            <button
              className={`vote${s.feedback === 'down' ? ' on down' : ''}`}
              onClick={() => setSuggestionState(s, { feedback: s.feedback === 'down' ? undefined : 'down' })}
            >
              👎 not useful
            </button>
          </div>
        </div>
      ))}
    </section>
  )
}
