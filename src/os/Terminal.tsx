import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { APPS, APP_IDS, type AppId, type AppProps } from './apps'
import { useWm } from './wm'
import { db, getDeviceId, SYNCED_TABLES } from '../lib/db'
import { downloadJson, exportSnapshot } from '../lib/snapshot'
import { today } from '../lib/repo'
import { describeSync, startSync } from '../lib/sync'
import { computeStats, statsLines } from '../lib/stats'
import { AVATAR_LEVELS, AVATAR_PIXELS } from '../lib/avatar'

type Line = { kind: 'in' | 'out' | 'err'; text: string; node?: ReactNode }

const BOOTED = Date.now()

const HELP = `available commands:
  help              show this list
  ls                list installed apps
  open <app>        launch an app (e.g. open journal)
  stats             record counts per table
  sync              pull + push the encrypted vault
  export            download a JSON backup
  whoami            operator identity
  neofetch          system info
  date | uptime     time
  clear             clear screen
  exit              close terminal`

export default function Terminal({ close }: AppProps) {
  const { open } = useWm()
  const [lines, setLines] = useState<Line[]>([{ kind: 'out', text: 'LIFE/OS tty1 · type "help"' }])
  const [input, setInput] = useState('')
  const [history, setHistory] = useState<string[]>([])
  const [hIdx, setHIdx] = useState(-1)
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [lines])

  const print = (text: string, kind: Line['kind'] = 'out') => setLines((l) => [...l, { kind, text }])

  async function run(raw: string) {
    const cmd = raw.trim()
    setLines((l) => [...l, { kind: 'in', text: cmd }])
    if (!cmd) return
    setHistory((h) => [cmd, ...h].slice(0, 50))
    setHIdx(-1)
    const [name, ...args] = cmd.split(/\s+/)

    switch (name.toLowerCase()) {
      case 'help':
        return print(HELP)
      case 'ls':
        return print(APP_IDS.map((id) => `${APPS[id].glyph.padEnd(3)} ${id.padEnd(10)} ${APPS[id].title}`).join('\n'))
      case 'open': {
        const id = args[0]?.toLowerCase() as AppId
        if (!id || !(id in APPS)) return print(`open: unknown app "${args[0] ?? ''}" · try "ls"`, 'err')
        open(id)
        return print(`[ OK ] spawned ${id}`)
      }
      case 'stats': {
        const rows: string[] = []
        for (const t of SYNCED_TABLES) {
          rows.push(`${t.padEnd(12)} ${await db.table(t).filter((r) => !r.deleted).count()}`)
        }
        return print(rows.join('\n'))
      }
      case 'sync': {
        print('[ .. ] establishing uplink')
        try {
          return print(`[ OK ] ${describeSync(await startSync())}`)
        } catch (e) {
          return print(`[FAIL] ${(e as Error).message}`, 'err')
        }
      }
      case 'export':
        downloadJson(await exportSnapshot(), `life-backup-${today()}.json`)
        return print('[ OK ] backup written to downloads')
      case 'whoami':
        return print(`operator@node-${(await getDeviceId()).slice(0, 8)}`)
      case 'date':
        return print(new Date().toString())
      case 'uptime': {
        const m = Math.floor((Date.now() - BOOTED) / 60000)
        return print(`up ${Math.floor(m / 60)}h ${m % 60}m`)
      }
      case 'neofetch': {
        const info = statsLines(await computeStats())
        setLines((l) => [...l, { kind: 'out', text: '', node: <Neofetch info={info} /> }])
        return
      }
      case 'sudo':
        return print('operator is not in the sudoers file. this incident will be reported.', 'err')
      case 'clear':
        return setLines([])
      case 'exit':
        return close()
      default:
        return print(`lsh: command not found: ${name}`, 'err')
    }
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      run(input)
      setInput('')
    } else if (e.key === 'ArrowUp' && history.length) {
      e.preventDefault()
      const i = Math.min(hIdx + 1, history.length - 1)
      setHIdx(i)
      setInput(history[i])
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      const i = hIdx - 1
      setHIdx(Math.max(i, -1))
      setInput(i >= 0 ? history[i] : '')
    }
  }

  return (
    <div className="term" onClick={() => inputRef.current?.focus()}>
      {lines.map((l, i) =>
        l.node ? (
          <div key={i}>{l.node}</div>
        ) : (
          <pre key={i} className={`term-${l.kind}`}>
            {l.kind === 'in' ? `$ ${l.text}` : l.text}
          </pre>
        ),
      )}
      <div className="term-prompt">
        <span>$</span>
        <input
          ref={inputRef}
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          aria-label="Terminal input"
        />
      </div>
      <div ref={endRef} />
    </div>
  )
}

/** neofetch body: shaded green pixel avatar (real tonal steps) beside the stats. */
function Neofetch({ info }: { info: string[] }) {
  const cols = AVATAR_PIXELS[0]?.length ?? 0
  return (
    <div className="neofetch">
      <div
        className="avatar"
        role="img"
        aria-label="operator avatar"
        style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
      >
        {AVATAR_PIXELS.flatMap((row, y) =>
          row.map((v, x) => (
            // opacity carries the shade; 0 = background, max = brightest.
            <span key={`${y}-${x}`} style={{ opacity: v / (AVATAR_LEVELS - 1) }} />
          )),
        )}
      </div>
      <pre className="neofetch-info">{info.join('\n')}</pre>
    </div>
  )
}
