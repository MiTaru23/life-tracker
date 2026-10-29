import { db, type Transaction } from './db'
import { create, today } from './repo'

export const CURRENCY = 'EUR'
const nf = new Intl.NumberFormat('de-DE', { style: 'currency', currency: CURRENCY, maximumFractionDigits: 2 })

export function money(n: number): string {
  return nf.format(n)
}

/** "YYYY-MM" for a date string. */
export function monthOf(date: string): string {
  return date.slice(0, 7)
}

export function thisMonth(): string {
  return today().slice(0, 7)
}

/** Shift a "YYYY-MM" key by n months. */
export function shiftMonth(key: string, n: number): string {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

export interface MonthSummary {
  income: number
  expense: number
  net: number
  byCategory: { category: string; amount: number }[]
}

export function summarizeMonth(txs: Transaction[], month: string): MonthSummary {
  const live = txs.filter((t) => !t.deleted && monthOf(t.date) === month)
  const income = live.filter((t) => t.type === 'in').reduce((a, t) => a + t.amount, 0)
  const expense = live.filter((t) => t.type === 'out').reduce((a, t) => a + t.amount, 0)
  const cat = new Map<string, number>()
  for (const t of live.filter((t) => t.type === 'out')) cat.set(t.category, (cat.get(t.category) ?? 0) + t.amount)
  const byCategory = [...cat.entries()].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount)
  return { income, expense, net: income - expense, byCategory }
}

/** Default category suggestions (editable; past categories get merged in). */
export const DEFAULT_EXPENSE_CATS = ['Food', 'Groceries', 'Rent', 'Transport', 'Fun', 'Shopping', 'Health', 'Subscriptions', 'Other']
export const DEFAULT_INCOME_CATS = ['Salary', 'Allowance', 'Gift', 'Refund', 'Other']

/* ---------- recurring transactions ---------- */

function daysInMonth(key: string): number {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

function monthOfMs(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/**
 * Generate transactions for every recurring rule that is due and not yet
 * applied. Stable ids (`rec-<ruleId>-<YYYY-MM>`) keep it idempotent across
 * devices and reloads; a deleted generated entry is not resurrected.
 */
export async function applyDueRecurring(): Promise<number> {
  const recs = (await db.recurring.toArray()).filter((r) => !r.deleted && r.active)
  if (!recs.length) return 0
  const cur = thisMonth()
  const curDay = Number(today().slice(8, 10))
  let made = 0
  for (const r of recs) {
    const start = r.lastApplied ? shiftMonth(r.lastApplied, 1) : monthOfMs(r.createdAt)
    let last = r.lastApplied
    for (let m = start; m <= cur; m = shiftMonth(m, 1)) {
      if (m === cur && curDay < r.dayOfMonth) break
      const day = Math.min(r.dayOfMonth, daysInMonth(m))
      const id = `rec-${r.id}-${m}`
      if (!(await db.transactions.get(id))) {
        await create<Transaction>('transactions', {
          id,
          date: `${m}-${String(day).padStart(2, '0')}`,
          amount: r.amount,
          type: r.type,
          category: r.category,
          note: r.note,
        })
        made++
      }
      last = m
    }
    if (last && last !== r.lastApplied) {
      await db.recurring.update(r.id, { lastApplied: last, updatedAt: Date.now() })
    }
  }
  return made
}
