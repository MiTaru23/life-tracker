import { db, type BaseRecord, type SyncedTable } from './db'

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
