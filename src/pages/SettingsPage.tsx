import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getDeviceId, SYNCED_TABLES } from '../lib/db'
import { downloadJson, exportSnapshot, mergeSnapshot } from '../lib/snapshot'
import { today } from '../lib/repo'

export default function SettingsPage() {
  const [deviceId, setDeviceId] = useState('')
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const [msg, setMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    getDeviceId().then(setDeviceId)
    navigator.storage?.persisted?.().then(setPersisted)
  }, [])

  const totals = useLiveQuery(async () => {
    const out: Record<string, number> = {}
    for (const t of SYNCED_TABLES) out[t] = await db.table(t).filter((r) => !r.deleted).count()
    return out
  })

  async function onExport() {
    downloadJson(await exportSnapshot(), `life-backup-${today()}.json`)
    setMsg('Backup downloaded.')
  }

  async function onImport(file: File) {
    try {
      const r = await mergeSnapshot(JSON.parse(await file.text()))
      setMsg(`Imported: ${r.added} new, ${r.updated} updated, ${r.unchanged} unchanged.`)
    } catch (e) {
      setMsg(`Import failed: ${(e as Error).message}`)
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function onPersist() {
    setPersisted((await navigator.storage?.persist?.()) ?? false)
  }

  return (
    <section>
      <h1>Settings</h1>

      <div className="card">
        <h2>Backup</h2>
        <p className="muted">Export all data as a JSON file, or merge a backup back in (newer entries win).</p>
        <div className="row">
          <button onClick={onExport}>Export JSON</button>
          <button className="secondary" onClick={() => fileRef.current?.click()}>Import JSON</button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            hidden
            onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])}
          />
        </div>
        {msg && <p className="note">{msg}</p>}
      </div>

      <div className="card">
        <h2>Storage</h2>
        <p className="muted">
          Data lives in this browser on this device.{' '}
          {persisted ? 'Storage is protected from automatic cleanup.' : 'Ask the browser to never auto-delete it:'}
        </p>
        {!persisted && <button onClick={onPersist}>Protect storage</button>}
        <table className="counts">
          <tbody>
            {totals &&
              Object.entries(totals).map(([k, v]) => (
                <tr key={k}>
                  <td>{k}</td>
                  <td>{v}</td>
                </tr>
              ))}
          </tbody>
        </table>
        <p className="muted small">Device ID: {deviceId}</p>
      </div>

      <div className="card muted">
        <h2>Sync</h2>
        <p>Upload / load via GitHub (encrypted) comes in phase 4.</p>
      </div>
    </section>
  )
}
