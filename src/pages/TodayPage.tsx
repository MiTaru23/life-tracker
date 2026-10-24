import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { today } from '../lib/repo'

export default function TodayPage() {
  const date = today()
  const counts = useLiveQuery(async () => {
    const live = <T extends { deleted?: boolean }>(rows: T[]) => rows.filter((r) => !r.deleted).length
    return {
      journal: live(await db.journal.where('date').equals(date).toArray()),
      workouts: live(await db.workouts.where('date').equals(date).toArray()),
      sessions: live(await db.sessions.where('date').equals(date).toArray()),
      habits: live(await db.habitChecks.where('date').equals(date).toArray()),
    }
  }, [date])

  const pretty = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <section>
      <div className="eyebrow">{pretty}</div>
      <div className="grid">
        <Tile label="Journal" value={counts?.journal} />
        <Tile label="Workouts" value={counts?.workouts} />
        <Tile label="Learning / hobby sessions" value={counts?.sessions} />
        <Tile label="Habits done" value={counts?.habits} />
      </div>
    </section>
  )
}

function Tile({ label, value }: { label: string; value?: number }) {
  return (
    <div className="card tile">
      <div className="tile-value">{value ?? '–'}</div>
      <div className="tile-label">{label}</div>
    </div>
  )
}
