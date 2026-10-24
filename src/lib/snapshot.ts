import { db, getDeviceId, SYNCED_TABLES, type BaseRecord, type SyncedTable } from './db'

/**
 * A full copy of all synced data. Used for JSON export/import now and as the
 * (encrypted) payload uploaded to the cloud in phase 4.
 */
export interface Snapshot {
  app: 'life-tracker'
  version: 1
  exportedAt: number
  deviceId: string
  tables: Record<SyncedTable, BaseRecord[]>
}

export async function exportSnapshot(): Promise<Snapshot> {
  const tables = {} as Record<SyncedTable, BaseRecord[]>
  for (const name of SYNCED_TABLES) {
    tables[name] = await db.table(name).toArray()
  }
  return { app: 'life-tracker', version: 1, exportedAt: Date.now(), deviceId: await getDeviceId(), tables }
}

export interface MergeResult {
  added: number
  updated: number
  unchanged: number
}

/**
 * Merge a snapshot into the local DB. Per record, the newer `updatedAt` wins;
 * tombstones are kept so deletions propagate. Never removes local-only data.
 */
export async function mergeSnapshot(snap: Snapshot): Promise<MergeResult> {
  if (snap?.app !== 'life-tracker' || snap.version !== 1) {
    throw new Error('Not a Life Tracker snapshot (or unsupported version).')
  }
  const result: MergeResult = { added: 0, updated: 0, unchanged: 0 }
  await db.transaction('rw', SYNCED_TABLES.map((t) => db.table(t)), async () => {
    for (const name of SYNCED_TABLES) {
      const incoming = snap.tables[name] ?? []
      const table = db.table<BaseRecord, string>(name)
      const local = new Map((await table.bulkGet(incoming.map((r) => r.id))).map((r, i) => [incoming[i].id, r]))
      const toWrite: BaseRecord[] = []
      for (const rec of incoming) {
        const existing = local.get(rec.id)
        if (!existing) {
          toWrite.push(rec)
          result.added++
        } else if (rec.updatedAt > existing.updatedAt) {
          toWrite.push(rec)
          result.updated++
        } else {
          result.unchanged++
        }
      }
      await table.bulkPut(toWrite)
    }
  })
  return result
}

export function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
