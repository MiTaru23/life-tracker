import { useState, type ReactNode } from 'react'
import type { GoalArea } from './lib/db'
import { useGoal } from './lib/hooks'
import { setGoal } from './lib/repo'

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: readonly T[]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t} role="tab" aria-selected={t === value} className={t === value ? 'on' : ''} onClick={() => onChange(t)}>
          {t}
        </button>
      ))}
    </div>
  )
}

/** Row of numbered buttons, e.g. mood 1-10. Clicking the active value clears it. */
export function Scale({ value, max, onChange, label }: { value?: number; max: number; onChange: (v?: number) => void; label: string }) {
  return (
    <div className="scale" role="group" aria-label={label}>
      {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          className={value !== undefined && n <= value ? 'on' : ''}
          aria-pressed={n === value}
          onClick={() => onChange(n === value ? undefined : n)}
        >
          {n}
        </button>
      ))}
    </div>
  )
}

/** ASCII progress bar: [████████░░░░] */
export function Meter({ value, max, unit, width = 16 }: { value: number; max?: number; unit: string; width?: number }) {
  if (!max) return <span className="meter dim">{value} {unit} · no target</span>
  const ratio = Math.min(value / max, 1)
  const filled = Math.round(ratio * width)
  return (
    <span className={`meter${value >= max ? ' done' : ''}`}>
      [{'█'.repeat(filled)}
      <span className="dim">{'░'.repeat(width - filled)}</span>] {value}/{max} {unit}
    </span>
  )
}

const GOAL_UNIT: Record<GoalArea, string> = { sport: 'min', learning: 'min', hobby: 'min', journal: 'entry(s)' }

/** Weekly target meter with inline editing. */
export function GoalMeter({ area, value, label }: { area: GoalArea; value: number; label?: string }) {
  const goal = useGoal(area)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  return (
    <div className="goal">
      <span className="goal-label">{label ?? area} · this week</span>
      <Meter value={value} max={goal?.perWeek} unit={GOAL_UNIT[area]} />
      {editing ? (
        <form
          className="inline"
          onSubmit={async (e) => {
            e.preventDefault()
            const n = Number(draft)
            if (n > 0) await setGoal(area, n)
            setEditing(false)
          }}
        >
          <input type="number" min={1} value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus aria-label="Weekly target" />
          <button>set</button>
        </form>
      ) : (
        <button
          className="link"
          onClick={() => {
            setDraft(String(goal?.perWeek ?? ''))
            setEditing(true)
          }}
        >
          {goal ? 'edit target' : 'set target'}
        </button>
      )}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>
}
