import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { ChatMessage } from '../lib/db'
import { db } from '../lib/db'
import { useAlive } from '../lib/hooks'
import { remove } from '../lib/repo'
import { addAssistant, askLive, clearPending, getHelperUrl, pingHelper, sendUserMessage } from '../lib/chat'
import { Empty } from '../ui'

export default function ChatPage() {
  const msgs = useAlive<ChatMessage>('chat')
  const [input, setInput] = useState('')
  const [live, setLive] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  const sorted = (msgs ?? []).slice().sort((a, b) => a.createdAt - b.createdAt)
  const pendingCount = sorted.filter((m) => m.role === 'user' && m.pending).length

  // Probe the PC helper on mount and every 20s.
  useEffect(() => {
    let alive = true
    const check = async () => {
      const ok = await pingHelper(await getHelperUrl())
      if (alive) setLive(ok)
    }
    check()
    const t = setInterval(check, 20_000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [])

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [sorted.length, busy])

  async function send(e: FormEvent) {
    e.preventDefault()
    const text = input.trim()
    if (!text || busy) return
    setErr('')
    setInput('')
    await sendUserMessage(text)

    const url = await getHelperUrl()
    if (!(await pingHelper(url))) {
      setLive(false)
      return // stays pending → answered on next PC sync
    }
    setLive(true)
    setBusy(true)
    try {
      const history = (await db.chat.toArray()).sort((a, b) => a.createdAt - b.createdAt)
      const reply = await askLive(url, history)
      await addAssistant(reply, 'live')
      await clearPending('live')
    } catch (e) {
      setErr(`live reply failed (${(e as Error).message}); it will be answered on the next PC sync.`)
      setLive(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="chat">
      <div className="chat-status">
        <span className={live ? 'ok' : 'warn'}>{live == null ? '…' : live ? '● live (pc online)' : '○ message mode (pc offline)'}</span>
        {pendingCount > 0 && <span className="dim"> · {pendingCount} awaiting pc sync</span>}
      </div>

      <div className="chat-log">
        {msgs && !sorted.length && (
          <Empty>ask claude anything — it knows your tracker data. replies come live when your pc is on, otherwise on the next sync.</Empty>
        )}
        {sorted.map((m) => (
          <div key={m.id} className={`msg ${m.role}`}>
            <div className="msg-role">{m.role === 'user' ? 'you' : 'claude'}{m.via ? <span className="dim"> · {m.via}</span> : null}</div>
            <div className="msg-text">{m.text}</div>
            {m.role === 'user' && m.pending && <div className="msg-pending">○ waiting for a reply…</div>}
            <button className="x msg-del" onClick={() => remove('chat', m.id)} aria-label="Delete message">×</button>
          </div>
        ))}
        {busy && <div className="msg assistant"><div className="msg-role">claude</div><div className="msg-text dim">thinking…</div></div>}
        <div ref={endRef} />
      </div>

      {err && <p className="note err">{err}</p>}

      <form className="chat-input" onSubmit={send}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={live ? 'message claude…' : 'message claude (answered on next pc sync)…'}
          aria-label="Message"
          autoFocus
        />
        <button disabled={busy}>{busy ? '…' : 'send'}</button>
      </form>
    </div>
  )
}
