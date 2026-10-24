import { useSyncExternalStore } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getDeviceId, SYNCED_TABLES, type BaseRecord } from './db'
import { ConflictError, readFile, writeFile, type Remote } from './github'
import { exportSnapshot, mergeSnapshot, type MergeResult, type Snapshot } from './snapshot'
import { seal, unseal, type Envelope } from './vault'
import { ensureBackupPermission, writeBackup } from './backupDir'

/** Device-local uplink settings. Lives in `meta`, which is never synced. */
export interface UplinkConfig {
  repo: string
  token: string
  passphrase: string
}

export interface LastSync {
  at: number
  pulled: MergeResult | null
  pushed: boolean
  backup?: string
}

const VAULT_PATH = 'vault/snapshot.enc'

export async function getUplink(): Promise<UplinkConfig | undefined> {
  return (await db.meta.get('uplink'))?.value as UplinkConfig | undefined
}
export async function setUplink(cfg: UplinkConfig | undefined) {
  if (cfg) await db.meta.put({ key: 'uplink', value: cfg })
  else await db.meta.delete('uplink')
}

export function useUplink() {
  return useLiveQuery(async () => ({
    config: await getUplink(),
    last: (await db.meta.get('lastSync'))?.value as LastSync | undefined,
  }))
}

/* ---- tiny shared store so the tray, terminal and settings show the same sync state ---- */

type SyncState = { running: boolean; step: string; error: string | null }
let state: SyncState = { running: false, step: '', error: null }
const listeners = new Set<() => void>()
function set(p: Partial<SyncState>) {
  state = { ...state, ...p }
  listeners.forEach((l) => l())
}
export function useSyncState(): SyncState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
}

/** True if the local DB has anything the remote snapshot doesn't (new or newer records). */
function hasLocalChanges(local: Snapshot, remote: Snapshot | null): boolean {
  if (!remote) return true
  return SYNCED_TABLES.some((t) => {
    const theirs = new Map((remote.tables[t] ?? []).map((r: BaseRecord) => [r.id, r.updatedAt]))
    return local.tables[t].some((r) => (theirs.get(r.id) ?? -1) < r.updatedAt)
  })
}

/**
 * Pull the vault, merge it into the local DB, then push the merged state back.
 * Pull happens first so nothing from another device is ever overwritten.
 * If the vault can't be decrypted, we stop before writing anything.
 */
export async function syncNow(override?: UplinkConfig): Promise<LastSync> {
  if (state.running) throw new Error('Sync already running.')
  const cfg = override ?? (await getUplink())
  if (!cfg) throw new Error('Uplink not configured. Open SYSTEM → Uplink.')
  const remote: Remote = { repo: cfg.repo, token: cfg.token, path: VAULT_PATH }
  const deviceId = await getDeviceId()

  set({ running: true, error: null, step: 'connecting' })
  try {
    for (let attempt = 1; ; attempt++) {
      set({ step: 'pulling vault' })
      const file = await readFile(remote)
      let pulled: MergeResult | null = null
      let remoteSnap: Snapshot | null = null
      if (file) {
        set({ step: 'decrypting' })
        remoteSnap = await unseal<Snapshot>(JSON.parse(file.text) as Envelope, cfg.passphrase)
        set({ step: 'merging' })
        pulled = await mergeSnapshot(remoteSnap)
      }

      const local = await exportSnapshot()
      let pushed = false
      if (hasLocalChanges(local, remoteSnap)) {
        set({ step: 'encrypting' })
        const env = await seal(local, cfg.passphrase, deviceId)
        set({ step: 'pushing vault' })
        try {
          await writeFile(remote, JSON.stringify(env), file?.sha, `sync from node-${deviceId.slice(0, 8)}`)
        } catch (e) {
          // Another device pushed in between: pull again and re-merge.
          if (e instanceof ConflictError && attempt < 3) continue
          throw e
        }
        pushed = true
      }

      set({ step: 'local backup' })
      const backup = await writeBackup(local).catch(() => undefined)

      const result: LastSync = { at: Date.now(), pulled, pushed, backup }
      await db.meta.put({ key: 'lastSync', value: result })
      set({ running: false, step: '' })
      return result
    }
  } catch (e) {
    set({ running: false, step: '', error: (e as Error).message })
    throw e
  }
}

export function describeSync(r: LastSync): string {
  const p = r.pulled
  const pulled = p ? `${p.added} new, ${p.updated} updated from vault` : 'vault created'
  return `${pulled} · ${r.pushed ? 'pushed' : 'nothing to push'}${r.backup ? ` · backup ${r.backup}` : ''}`
}

export function ago(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

/** Entry point for buttons: grabs the backup-folder permission while the click still counts as a user gesture. */
export async function startSync(override?: UplinkConfig): Promise<LastSync> {
  await ensureBackupPermission().catch(() => false)
  return syncNow(override)
}
