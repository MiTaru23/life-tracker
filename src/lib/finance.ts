import type { Transaction } from './db'
import { today } from './repo'

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
