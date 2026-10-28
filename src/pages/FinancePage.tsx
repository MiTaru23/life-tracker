import { useMemo, useState, type FormEvent } from 'react'
import type { SavingsGoal, Transaction, TxType } from '../lib/db'
import { useAlive } from '../lib/hooks'
import { create, remove, today, update } from '../lib/repo'
import {
  DEFAULT_EXPENSE_CATS,
  DEFAULT_INCOME_CATS,
  money,
  monthLabel,
  monthOf,
  shiftMonth,
  summarizeMonth,
  thisMonth,
} from '../lib/finance'
import { Empty, Tabs } from '../ui'

const TABS = ['overview', 'transactions', 'savings'] as const
type Tab = (typeof TABS)[number]

export default function FinancePage() {
  const [tab, setTab] = useState<Tab>('overview')
  const [month, setMonth] = useState(thisMonth)
  const txs = useAlive<Transaction>('transactions')

  return (
    <div>
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      {tab !== 'savings' && (
        <div className="date-nav month-nav">
          <button className="secondary" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month">‹</button>
          <span className="month-label">{monthLabel(month)}</span>
          <button className="secondary" onClick={() => setMonth(shiftMonth(month, 1))} disabled={month >= thisMonth()} aria-label="Next month">›</button>
        </div>
      )}
      {tab === 'overview' && <Overview txs={txs} month={month} />}
      {tab === 'transactions' && <Transactions txs={txs} month={month} />}
      {tab === 'savings' && <Savings txs={txs} />}
    </div>
  )
}

function Overview({ txs, month }: { txs?: Transaction[]; month: string }) {
  const s = useMemo(() => summarizeMonth(txs ?? [], month), [txs, month])
  if (!txs) return null
  return (
    <>
      <div className="grid fin-grid">
        <Tile label="income" value={money(s.income)} cls="ok" />
        <Tile label="expenses" value={money(s.expense)} cls="warn" />
        <Tile label="net" value={money(s.net)} cls={s.net >= 0 ? 'ok' : 'bad'} />
      </div>
      <div className="card">
        <h2>expenses by category</h2>
        {s.byCategory.length ? (
          <div className="catlist">
            {s.byCategory.map((c) => (
              <div className="cat-row" key={c.category}>
                <span className="cat-name">{c.category}</span>
                <div className="cat-track">
                  <div className="cat-fill" style={{ width: `${(c.amount / s.byCategory[0].amount) * 100}%` }} />
                </div>
                <span className="cat-amt">{money(c.amount)}</span>
              </div>
            ))}
          </div>
        ) : (
          <Empty>no expenses this month</Empty>
        )}
      </div>
    </>
  )
}

function Transactions({ txs, month }: { txs?: Transaction[]; month: string }) {
  const [type, setType] = useState<TxType>('out')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('')
  const [date, setDate] = useState(today)
  const [note, setNote] = useState('')

  const list = useMemo(
    () =>
      (txs ?? [])
        .filter((t) => monthOf(t.date) === month)
        .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt),
    [txs, month],
  )
  const pastCats = useMemo(() => [...new Set((txs ?? []).map((t) => t.category).filter(Boolean))], [txs])
  const cats = [...new Set([...(type === 'out' ? DEFAULT_EXPENSE_CATS : DEFAULT_INCOME_CATS), ...pastCats])]

  async function submit(e: FormEvent) {
    e.preventDefault()
    const amt = Math.round(Number(amount.replace(',', '.')) * 100) / 100
    if (!(amt > 0) || !category.trim()) return
    await create<Transaction>('transactions', { date, amount: amt, type, category: category.trim(), note: note.trim() || undefined })
    setAmount('')
    setNote('')
  }

  return (
    <>
      <form className="card form" onSubmit={submit}>
        <div className="seg">
          <button type="button" className={type === 'out' ? 'on' : ''} onClick={() => setType('out')}>− expense</button>
          <button type="button" className={type === 'in' ? 'on' : ''} onClick={() => setType('in')}>+ income</button>
        </div>
        <div className="form-row">
          <label className="field">
            <span>amount €</span>
            <input inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} required className="num" />
          </label>
          <label className="field grow">
            <span>category</span>
            <input list="fin-cats" value={category} onChange={(e) => setCategory(e.target.value)} required />
            <datalist id="fin-cats">{cats.map((c) => <option key={c} value={c} />)}</datalist>
          </label>
          <label className="field">
            <span>date</span>
            <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>
        <div className="form-row">
          <input className="grow" placeholder="note (optional)" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Note" />
          <button>+ add</button>
        </div>
      </form>

      <div className="card">
        <h2>{monthLabel(month)}</h2>
        {txs && !list.length && <Empty>no transactions this month</Empty>}
        <table className="tbl">
          <tbody>
            {list.map((t) => (
              <tr key={t.id}>
                <td className="dim">{t.date.slice(8)}.{t.date.slice(5, 7)}</td>
                <td>{t.category}</td>
                <td className="dim ellipsis">{t.note}</td>
                <td className={`r ${t.type === 'in' ? 'ok' : ''}`}>{t.type === 'in' ? '+' : '−'}{money(t.amount)}</td>
                <td className="r"><button className="x" onClick={() => remove('transactions', t.id)} aria-label="Delete">×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function Savings({ txs }: { txs?: Transaction[] }) {
  const goals = useAlive<SavingsGoal>('savingsGoals')
  const [name, setName] = useState('')
  const [target, setTarget] = useState('')

  const savedThisMonth = useMemo(() => {
    const s = summarizeMonth(txs ?? [], thisMonth())
    return s.net
  }, [txs])
  const active = (goals ?? []).filter((g) => !g.archived)

  async function addGoal(e: FormEvent) {
    e.preventDefault()
    const t = Math.round(Number(target.replace(',', '.')) * 100) / 100
    if (!name.trim() || !(t > 0)) return
    await create<SavingsGoal>('savingsGoals', { name: name.trim(), target: t, saved: 0 })
    setName('')
    setTarget('')
  }

  async function contribute(g: SavingsGoal) {
    const v = prompt(`Add to "${g.name}" (€). Use a negative number to withdraw.`)
    if (v == null) return
    const n = Math.round(Number(v.replace(',', '.')) * 100) / 100
    if (!n) return
    await update<SavingsGoal>('savingsGoals', g.id, { saved: Math.max(0, Math.round((g.saved + n) * 100) / 100) })
  }

  return (
    <>
      <div className="card">
        <div className="eyebrow">this month's net (what you saved)</div>
        <div className={`tile-value ${savedThisMonth >= 0 ? 'ok' : 'bad'}`}>{money(savedThisMonth)}</div>
      </div>

      <form className="card form-row" onSubmit={addGoal}>
        <input className="grow" placeholder="new goal (e.g. New laptop)" value={name} onChange={(e) => setName(e.target.value)} aria-label="Goal name" />
        <input inputMode="decimal" className="num" placeholder="target €" value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Target" />
        <button>+ goal</button>
      </form>

      {goals && !active.length && <Empty>no savings goals yet</Empty>}
      {active.map((g) => {
        const pct = Math.min(100, Math.round((g.saved / g.target) * 100))
        return (
          <div className="card" key={g.id}>
            <div className="item-head">
              <strong className="grow">{g.name}</strong>
              <span className="dim">{money(g.saved)} / {money(g.target)}</span>
            </div>
            <div className="cmp-track goal-track"><div className={`cmp-fill ${pct >= 100 ? 'up' : 'dim'}`} style={{ width: `${pct}%` }} /></div>
            <div className="row" style={{ marginTop: 8 }}>
              <button className="secondary" onClick={() => contribute(g)}>± contribute</button>
              <button className="link danger" onClick={() => confirm(`Delete goal "${g.name}"?`) && remove('savingsGoals', g.id)}>delete</button>
              {pct >= 100 && <span className="ok">✓ reached</span>}
            </div>
          </div>
        )
      })}
    </>
  )
}

function Tile({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <div className="card tile">
      <div className={`tile-value ${cls ?? ''}`}>{value}</div>
      <div className="tile-label">{label}</div>
    </div>
  )
}
