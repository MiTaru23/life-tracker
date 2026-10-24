import { db } from './db'
import { today } from './repo'

/**
 * Optional plain-JSON backups into a folder on this device (File System Access
 * API, Chromium desktop only). The folder handle is kept in `meta` (not synced).
 */

type Perm = 'granted' | 'denied' | 'prompt'
interface DirHandle {
  name: string
  queryPermission(o: { mode: 'readwrite' }): Promise<Perm>
  requestPermission(o: { mode: 'readwrite' }): Promise<Perm>
  getFileHandle(name: string, o: { create: boolean }): Promise<{
    createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>
  }>
}
type Picker = (o?: { id?: string; mode?: 'readwrite' }) => Promise<DirHandle>

export const backupSupported = typeof window !== 'undefined' && 'showDirectoryPicker' in window

export async function chooseBackupDir(): Promise<string> {
  const handle = await (window as unknown as { showDirectoryPicker: Picker }).showDirectoryPicker({
    id: 'lifeos-backup',
    mode: 'readwrite',
  })
  await db.meta.put({ key: 'backupDir', value: handle })
  return handle.name
}

export async function forgetBackupDir() {
  await db.meta.delete('backupDir')
}

export async function backupDirName(): Promise<string | undefined> {
  return ((await db.meta.get('backupDir'))?.value as DirHandle | undefined)?.name
}

/**
 * Ask for write permission. Must run inside a user gesture (e.g. right at the
 * start of a click handler), before any slow async work.
 */
export async function ensureBackupPermission(): Promise<boolean> {
  const handle = (await db.meta.get('backupDir'))?.value as DirHandle | undefined
  if (!handle) return false
  if ((await handle.queryPermission({ mode: 'readwrite' })) === 'granted') return true
  return (await handle.requestPermission({ mode: 'readwrite' })) === 'granted'
}

/** Write today's backup file (overwrites earlier runs of the same day). Returns the file name. */
export async function writeBackup(data: unknown): Promise<string | undefined> {
  const handle = (await db.meta.get('backupDir'))?.value as DirHandle | undefined
  if (!handle || (await handle.queryPermission({ mode: 'readwrite' })) !== 'granted') return undefined
  const name = `life-backup-${today()}.json`
  const file = await handle.getFileHandle(name, { create: true })
  const w = await file.createWritable()
  await w.write(JSON.stringify(data, null, 2))
  await w.close()
  return `${handle.name}/${name}`
}
