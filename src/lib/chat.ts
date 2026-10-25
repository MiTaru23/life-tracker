import { db, type ChatMessage, type JournalEntry, type Workout } from './db'
import { create, today, update, weekStart } from './repo'
import { computeStats, statsLines } from './stats'

/** Local-only helper URL (per device, not synced). Default = PC on localhost. */
const DEFAULT_HELPER = 'http://localhost:8787'

export async function getHelperUrl(): Promise<string> {
  return ((await db.meta.get('helperUrl'))?.value as string) || DEFAULT_HELPER
}
export async function setHelperUrl(url: string) {
  await db.meta.put({ key: 'helperUrl', value: url.trim().replace(/\/$/, '') })
}

/** Is the PC live-chat helper reachable right now? Short timeout so the UI stays snappy. */
export async function pingHelper(url: string): Promise<boolean> {
  try {
    const ctl = AbortSignal.timeout(1500)
    const res = await fetch(`${url}/ping`, { signal: ctl })
    return res.ok
  } catch {
    return false
  }
}

/** A compact snapshot of the user's current data, given to Claude as context. */
export async function buildChatContext(): Promise<string> {
  const stats = statsLines(await computeStats()).join('\n')
  const week = weekStart(today())
  const journal = (await db.journal.toArray()) as JournalEntry[]
  const workouts = (await db.workouts.toArray()) as Workout[]
  const recentJournal = journal
    .filter((e) => !e.deleted)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5)
    .map((e) => `  ${e.date} (mood ${e.mood ?? '-'}): ${(e.text || '').replace(/\s+/g, ' ').slice(0, 160)}`)
    .join('\n')
  const weekWorkouts = workouts.filter((w) => !w.deleted && w.date >= week).length
  return `Operator stats:\n${stats}\nWorkouts this week: ${weekWorkouts}\nRecent journal:\n${recentJournal || '  (none)'}`
}

/** Add a user message (pending until answered). */
export async function sendUserMessage(text: string): Promise<ChatMessage> {
  return create<ChatMessage>('chat', { role: 'user', text: text.trim(), pending: true })
}

export async function addAssistant(text: string, via: ChatMessage['via']) {
  await create<ChatMessage>('chat', { role: 'assistant', text, via })
}

/** Mark every pending user message as answered. */
export async function clearPending(via: ChatMessage['via']) {
  const pend = (await db.chat.toArray()).filter((m) => m.role === 'user' && m.pending && !m.deleted)
  for (const m of pend) await update<ChatMessage>('chat', m.id, { pending: false, via })
}

export interface LiveReply {
  reply: string
}

/** Ask the PC helper for a live reply. Throws if unreachable / errored. */
export async function askLive(url: string, history: ChatMessage[]): Promise<string> {
  const context = await buildChatContext()
  const messages = history.filter((m) => !m.deleted).map((m) => ({ role: m.role, text: m.text }))
  const res = await fetch(`${url}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ context, messages }),
    signal: AbortSignal.timeout(120_000),
  })
  if (!res.ok) throw new Error(`helper ${res.status}`)
  const data = (await res.json()) as LiveReply
  if (!data.reply) throw new Error('empty reply')
  return data.reply
}
