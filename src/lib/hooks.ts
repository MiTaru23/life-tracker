import { useLiveQuery } from 'dexie-react-hooks'
import { db, type BaseRecord, type Goal, type GoalArea, type SyncedTable } from './db'

/** All non-deleted rows of a table, live. `undefined` while loading. */
export function useAlive<T extends BaseRecord>(table: SyncedTable): T[] | undefined {
  return useLiveQuery(() => db.table<T, string>(table).filter((r) => !r.deleted).toArray(), [table])
}

export function useGoal(area: GoalArea): Goal | undefined {
  return useLiveQuery(
    async () => (await db.goals.where('area').equals(area).toArray()).find((g) => !g.deleted),
    [area],
  )
}
