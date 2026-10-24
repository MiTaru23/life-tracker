import { useCallback, useEffect, useReducer, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { APPS, APP_IDS, type AppId } from './apps'
import { focusedId, loadWm, saveWm, useWm, WmContext, wmReducer } from './wm'
import Window from './Window'
import Boot from './Boot'
import { db, getDeviceId } from '../lib/db'
import { today } from '../lib/repo'

function useMobile() {
  const q = '(max-width: 700px)'
  const [m, setM] = useState(() => window.matchMedia(q).matches)
  useEffect(() => {
    const mq = window.matchMedia(q)
    const on = () => setM(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return m
}

function useClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return now
}

function bootedThisSession() {
  try {
    return sessionStorage.getItem('lifeos.booted') === '1'
  } catch {
    return false
  }
}

export default function Desktop() {
  const [state, dispatch] = useReducer(wmReducer, undefined, loadWm)
  const [booting, setBooting] = useState(() => !bootedThisSession())
  const [startOpen, setStartOpen] = useState(false)
  const mobile = useMobile()

  useEffect(() => {
    saveWm(state)
  }, [state])

  const open = useCallback((appId: AppId) => {
    dispatch({ type: 'open', appId })
    setStartOpen(false)
  }, [])

  const endBoot = useCallback(() => {
    try {
      sessionStorage.setItem('lifeos.booted', '1')
    } catch {
      /* ignore */
    }
    setBooting(false)
  }, [])

  const active = focusedId(state)
  // On a phone only the focused window is shown, full screen.
  const shown = mobile ? state.windows.filter((w) => w.id === active) : state.windows

  return (
    <WmContext.Provider value={{ state, dispatch, open }}>
      {booting && <Boot onDone={endBoot} />}
      <div className="desktop" onPointerDown={() => setStartOpen(false)}>
        <div className="wallpaper" aria-hidden>
          <pre className="logo">{LOGO}</pre>
        </div>

        <div className="icons">
          {APP_IDS.map((id) => (
            <button key={id} className="icon" onDoubleClick={() => open(id)} onClick={() => mobile && open(id)}>
              <span className="icon-glyph">{APPS[id].glyph}</span>
              <span className="icon-label">{APPS[id].label}</span>
            </button>
          ))}
        </div>

        {!mobile && <SysMonitor />}

        {shown.map((w) => (
          <Window key={w.id} win={w} focused={w.id === active} mobile={mobile} />
        ))}
      </div>

      {startOpen && (
        <div className="start-menu" role="menu">
          <div className="start-head">LIFE/OS · operator</div>
          {APP_IDS.map((id) => (
            <button key={id} role="menuitem" onClick={() => open(id)}>
              <span className="start-glyph">{APPS[id].glyph}</span>
              {APPS[id].title}
            </button>
          ))}
          <button
            className="start-lock"
            onClick={() => {
              setStartOpen(false)
              setBooting(true)
            }}
          >
            ⏻ reboot
          </button>
        </div>
      )}

      <Taskbar mobile={mobile} startOpen={startOpen} toggleStart={() => setStartOpen((o) => !o)} />
    </WmContext.Provider>
  )
}

function Taskbar({ mobile, startOpen, toggleStart }: { mobile: boolean; startOpen: boolean; toggleStart: () => void }) {
  const now = useClock()
  const { state, dispatch } = useWm()
  const active = focusedId(state)
  return (
          <footer className="taskbar">
            <button className={`start${startOpen ? ' on' : ''}`} onClick={toggleStart}>
              ◢ LIFE/OS
            </button>
            {mobile && active && (
              <button className="task" onClick={() => dispatch({ type: 'minimizeAll' })}>
                ⌂ home
              </button>
            )}
            <div className="tasks">
              {!mobile &&
                state.windows.map((w) => (
                  <button
                    key={w.id}
                    className={`task${w.id === active ? ' on' : ''}${w.minimized ? ' min' : ''}`}
                    onClick={() =>
                      dispatch(w.id === active ? { type: 'minimize', id: w.id } : { type: 'focus', id: w.id })
                    }
                  >
                    {APPS[w.appId].glyph} {APPS[w.appId].label}
                  </button>
                ))}
            </div>
            <div className="tray">
              <span className="tray-item warn" title="Sync not set up yet (phase 4)">⇅ OFFLINE</span>
              <span className="tray-item" title="Local storage">⛁ LOCAL</span>
              <span className="clock">
                {now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: mobile ? undefined : '2-digit' })}
              </span>
            </div>
          </footer>
  )
}

/** Conky-style widget on the desktop: node info and today's counts. */
function SysMonitor() {
  const date = today()
  const [node, setNode] = useState<string>()
  useEffect(() => {
    getDeviceId().then((id) => setNode(id.slice(0, 8)))
  }, [])
  // Read-only: getDeviceId may write on first run, so it must stay out of the live query.
  const info = useLiveQuery(async () => {
    const n = async (t: 'journal' | 'workouts' | 'sessions' | 'habitChecks') =>
      db.table(t).where('date').equals(date).filter((r) => !r.deleted).count()
    return {
      journal: await n('journal'),
      workouts: await n('workouts'),
      sessions: await n('sessions'),
      habits: await n('habitChecks'),
    }
  }, [date])

  const row = (k: string, v: string | number | undefined, cls = '') => (
    <div className="mon-row">
      <span>{k}</span>
      <span className={cls}>{v ?? '…'}</span>
    </div>
  )

  return (
    <aside className="monitor" aria-label="System monitor">
      <div className="mon-head">SYS.MONITOR</div>
      {row('node', node)}
      {row('date', date)}
      {row('store', 'indexeddb')}
      {row('uplink', 'offline', 'warn')}
      {row('crypto', 'pending', 'dim')}
      <div className="mon-head">TODAY</div>
      {row('journal', info?.journal)}
      {row('workouts', info?.workouts)}
      {row('sessions', info?.sessions)}
      {row('habits', info?.habits)}
    </aside>
  )
}

const LOGO = String.raw`
 _     ___ _____ _____    __  ___  ____
| |   |_ _|  ___| ____|  / / / _ \/ ___|
| |    | || |_  |  _|   / / | | | \___ \
| |___ | ||  _| | |___ / /  | |_| |___) |
|_____|___|_|   |_____/_/    \___/|____/
`
