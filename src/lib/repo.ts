import { db, type BaseRecord, type Goal, type GoalArea, type HabitCheck, type Suggestion, type SyncedTable } from './db'

type NewRecord<T extends BaseRecord> = Omit<T, keyof BaseRecord> & Partial<Pick<T, 'id'>>

/** Insert a new record, stamping id and timestamps. */
export async function create<T extends BaseRecord>(table: SyncedTable, data: NewRecord<T>): Promise<T> {
  const now = Date.now()
  const record = { ...data, id: data.id ?? crypto.randomUUID(), createdAt: now, updatedAt: now } as T
  await db.table(table).put(record)
  return record
}

/** Patch an existing record and bump `updatedAt` so it wins the next merge. */
export async function update<T extends BaseRecord>(table: SyncedTable, id: string, patch: Partial<T>) {
  await db.table(table).update(id, { ...patch, updatedAt: Date.now() })
}

/** Soft delete (tombstone), so the deletion also propagates to other devices. */
export async function remove(table: SyncedTable, id: string) {
  await db.table(table).update(id, { deleted: true, updatedAt: Date.now() })
}

/** Today's date in local time as YYYY-MM-DD. */
export function today(): string {
  return toDateStr(new Date())
}

export function toDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(date: string, n: number): string {
  const d = parseDate(date)
  d.setDate(d.getDate() + n)
  return toDateStr(d)
}

/** Monday of the week containing `date`. */
export function weekStart(date = today()): string {
  const d = parseDate(date)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return toDateStr(d)
}

/** Whole days from `a` to `b` (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86_400_000)
}

export function parseTags(s: string): string[] {
  return [...new Set(s.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))]
}

/** Set the weekly target for an area, reusing the existing goal record. */
export async function setGoal(area: GoalArea, perWeek: number) {
  const existing = (await db.goals.where('area').equals(area).toArray()).find((g) => !g.deleted)
  if (existing) await update<Goal>('goals', existing.id, { perWeek })
  else await create<Goal>('goals', { area, perWeek })
}

/**
 * Check or uncheck a habit for a day. Runs in one transaction so rapid clicks
 * can't create duplicates; reuses tombstoned rows so ids stay stable across devices.
 */
export async function toggleHabit(habitId: string, date: string) {
  await db.transaction('rw', db.habitChecks, async () => {
    const rows = await db.habitChecks.where('[habitId+date]').equals([habitId, date]).toArray()
    const live = rows.filter((r) => !r.deleted)
    if (live.length) {
      for (const r of live) await remove('habitChecks', r.id)
    } else if (rows[0]) {
      await update<HabitCheck>('habitChecks', rows[0].id, { deleted: false })
    } else {
      await create<HabitCheck>('habitChecks', { habitId, date })
    }
  })
}

/** Consecutive checked days ending today (or yesterday, if today isn't checked yet). */
export function streak(habitId: string, done: Set<string>, t: string): number {
  let d = done.has(`${habitId}|${t}`) ? t : addDays(t, -1)
  let n = 0
  while (done.has(`${habitId}|${d}`)) {
    n++
    d = addDays(d, -1)
  }
  return n
}

/**
 * Persist feedback or dismissal for a suggestion. For rule-generated hits this
 * materialises the hit into the `suggestions` table (keyed by its stable id) so
 * the state syncs across devices; createdAt is preserved on update.
 */
export async function setSuggestionState(
  hit: { id: string; area: Suggestion['area']; title: string; body: string; source?: Suggestion['source'] },
  patch: { feedback?: 'up' | 'down'; dismissed?: boolean },
) {
  const existing = await db.suggestions.get(hit.id)
  await db.suggestions.put({
    id: hit.id,
    area: hit.area,
    title: hit.title,
    body: hit.body,
    source: existing?.source ?? hit.source ?? 'rule',
    week: existing?.week,
    createdAt: existing?.createdAt ?? Date.now(),
    updatedAt: Date.now(),
    feedback: 'feedback' in patch ? patch.feedback : existing?.feedback,
    dismissed: 'dismissed' in patch ? patch.dismissed : existing?.dismissed,
  })
}
