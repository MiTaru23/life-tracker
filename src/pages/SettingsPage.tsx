import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getDeviceId, SYNCED_TABLES } from '../lib/db'
import { downloadJson, exportSnapshot, mergeSnapshot } from '../lib/snapshot'
import { today } from '../lib/repo'
import { ago, describeSync, setUplink, startSync, useSyncState, useUplink } from '../lib/sync'
import { backupDirName, backupSupported, chooseBackupDir, forgetBackupDir } from '../lib/backupDir'

const DEFAULT_REPO = 'MiTaru23/life-data'
const TOKEN_URL =
  'https://github.com/settings/personal-access-tokens/new?name=LIFE%2FOS%20uplink&description=Read%2Fwrite%20the%20encrypted%20LIFE%2FOS%20vault&target_name=MiTaru23&expires_in=366&contents=write'

export default function SettingsPage() {
  return (
    <section>
      <Uplink />
      <LocalBackup />
      <Backup />
      <Storage />
    </section>
  )
}

/* ---------------- uplink (encrypted GitHub sync) ---------------- */

function Uplink() {
  const uplink = useUplink()
  const sync = useSyncState()
  const [msg, setMsg] = useState('')

  if (!uplink) return null
  if (!uplink.config) return <UplinkSetup />

  const { config, last } = uplink

  async function run() {
    setMsg('')
    try {
      setMsg(describeSync(await startSync()))
    } catch {
      /* error is shown from the shared sync state */
    }
  }

  return (
    <div className="card">
      <h2>uplink</h2>
      <table className="kv">
        <tbody>
          <tr><td>vault</td><td>github.com/{config.repo}</td></tr>
          <tr><td>cipher</td><td>AES-256-GCM · PBKDF2 600k</td></tr>
          <tr>
            <td>last sync</td>
            <td className={last ? '' : 'warn'}>{last ? `${ago(last.at)} · ${new Date(last.at).toLocaleString('en-GB')}` : 'never'}</td>
          </tr>
        </tbody>
      </table>
      <div className="row">
        <button onClick={run} disabled={sync.running}>{sync.running ? `⇅ ${sync.step}…` : '⇅ sync now'}</button>
        <button
          className="link danger"
          onClick={async () => {
            if (confirm('Remove token and passphrase from this device? Your data stays here and in the vault.')) await setUplink(undefined)
          }}
        >
          disconnect device
        </button>
      </div>
      {sync.error && <p className="note err">✗ {sync.error}</p>}
      {msg && !sync.error && <p className="note">✓ {msg}</p>}
    </div>
  )
}

function UplinkSetup() {
  const [repo, setRepo] = useState(DEFAULT_REPO)
  const [token, setToken] = useState('')
  const [pass, setPass] = useState('')
  const [pass2, setPass2] = useState('')
  const [err, setErr] = useState('')
  const sync = useSyncState()

  async function submit(e: FormEvent) {
    e.preventDefault()
    setErr('')
    if (pass.length < 10) return setErr('Passphrase: at least 10 characters.')
    if (pass !== pass2) return setErr('Passphrases do not match.')
    const cfg = { repo: repo.trim(), token: token.trim(), passphrase: pass }
    try {
      // Only store the config once a full sync worked (token valid, passphrase opens the vault).
      await startSync(cfg)
      await setUplink(cfg)
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  return (
    <form className="card form" onSubmit={submit}>
      <h2>uplink · setup</h2>
      <p className="muted small">
        Syncs this device with an encrypted vault in your private GitHub repo. Only devices that know the passphrase can
        read it. The first device sets the passphrase, every other device uses the same one.
      </p>
      <ol className="steps small">
        <li>
          <a href={TOKEN_URL} target="_blank" rel="noreferrer">create a GitHub token ↗</a> · Repository access: <b>Only select
          repositories → life-data</b> · Permissions: <b>Contents: Read and write</b> · Generate · copy it
        </li>
        <li>paste it below and choose a passphrase you won't forget</li>
      </ol>
      <label className="field">
        <span>vault repo</span>
        <input value={repo} onChange={(e) => setRepo(e.target.value)} required />
      </label>
      <label className="field">
        <span>github token</span>
        <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="github_pat_…" autoComplete="off" required />
      </label>
      <div className="form-row">
        <label className="field grow">
          <span>passphrase</span>
          <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="new-password" required />
        </label>
        <label className="field grow">
          <span>repeat</span>
          <input type="password" value={pass2} onChange={(e) => setPass2(e.target.value)} autoComplete="new-password" required />
        </label>
      </div>
      <p className="small warn">
        ! lose the passphrase = the vault is unreadable. Data on your devices is unaffected, but write it down somewhere safe.
      </p>
      <button disabled={sync.running}>{sync.running ? `⇅ ${sync.step}…` : 'connect + first sync'}</button>
      {err && <p className="note err">✗ {err}</p>}
    </form>
  )
}

/* ---------------- local backup folder ---------------- */

function LocalBackup() {
  const name = useLiveQuery(backupDirName)
  const [err, setErr] = useState('')
  if (!backupSupported) return null

  return (
    <div className="card">
      <h2>local backup</h2>
      <p className="muted small">On every sync, a plain JSON copy is written to a folder on this PC (one file per day).</p>
      {name ? (
        <div className="row">
          <span>⛁ {name}/</span>
          <button className="link danger" onClick={forgetBackupDir}>stop</button>
        </div>
      ) : (
        <button
          className="secondary"
          onClick={() => chooseBackupDir().then(() => setErr(''), (e: Error) => e.name !== 'AbortError' && setErr(e.message))}
        >
          choose folder
        </button>
      )}
      {err && <p className="note err">✗ {err}</p>}
    </div>
  )
}

/* ---------------- manual export/import ---------------- */

function Backup() {
  const [msg, setMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

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

  return (
    <div className="card">
      <h2>manual export</h2>
      <p className="muted small">Download all data as JSON, or merge a backup file back in (newer entries win).</p>
      <div className="row">
        <button className="secondary" onClick={onExport}>export json</button>
        <button className="secondary" onClick={() => fileRef.current?.click()}>import json</button>
        <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])} />
      </div>
      {msg && <p className="note">{msg}</p>}
    </div>
  )
}

/* ---------------- storage ---------------- */

function Storage() {
  const [deviceId, setDeviceId] = useState('')
  const [persisted, setPersisted] = useState<boolean | null>(null)

  useEffect(() => {
    getDeviceId().then(setDeviceId)
    navigator.storage?.persisted?.().then(setPersisted)
  }, [])

  const totals = useLiveQuery(async () => {
    const out: Record<string, number> = {}
    for (const t of SYNCED_TABLES) out[t] = await db.table(t).filter((r) => !r.deleted).count()
    return out
  })

  return (
    <div className="card">
      <h2>storage</h2>
      <p className="muted small">
        Data lives in this browser on this device.{' '}
        {persisted ? 'Protected from automatic cleanup.' : 'Ask the browser to never auto-delete it:'}
      </p>
      {!persisted && (
        <button className="secondary" onClick={async () => setPersisted((await navigator.storage?.persist?.()) ?? false)}>
          protect storage
        </button>
      )}
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
      <p className="muted small">node {deviceId}</p>
    </div>
  )
}
