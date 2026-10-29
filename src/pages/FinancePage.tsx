import { useEffect, useMemo, useState, type FormEvent } from 'react'
import type { Account, Budget, Recurring, SavingsGoal, Transaction, TxType } from '../lib/db'
import { useAlive } from '../lib/hooks'
import { create, remove, today, update } from '../lib/repo'
import {
  accountOf,
  applyDueRecurring,
  balanceOf,
  correctBalance,
  DEFAULT_EXPENSE_CATS,
  DEFAULT_INCOME_CATS,
  MAIN,
  money,
  monthLabel,
  monthOf,
  shiftMonth,
  summarizeMonth,
  thisMonth,
  transferBetween,
} from '../lib/finance'
import { Empty, Tabs } from '../ui'

const TABS = ['overview', 'transactions', 'spaces', 'recurring', 'budgets', 'savings'] as const
type Tab = (typeof TABS)[number]

function parseAmount(s: string): number {
  return Math.round(Number(s.replace(',', '.')) * 100) / 100
}

/** [{id,name}] for all spaces: the implicit Main plus user-created ones. */
function useSpaces() {
  const accounts = useAlive<Account>('accounts')
  return useMemo(
    () => [
      { id: MAIN, name: 'Main' },
      ...(accounts ?? [])
        .filter((a) => !a.archived)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.createdAt - b.createdAt)
        .map((a) => ({ id: a.id, name: a.name })),
    ],
    [accounts],
  )
}

export default function FinancePage() {
  const [tab, setTab] = useState<Tab>('overview')
  const [month, setMonth] = useState(thisMonth)
  const [acct, setAcct] = useState<string>(MAIN)
  const txs = useAlive<Transaction>('transactions')
  const spaces = useSpaces()

  useEffect(() => {
    applyDueRecurring().catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!spaces.some((s) => s.id === acct)) setAcct(MAIN)
  }, [spaces, acct])

  const showMonthNav = tab === 'overview' || tab === 'transactions'
  const showSpacePick = (tab === 'overview' || tab === 'transactions') && spaces.length > 1

  return (
    <div>
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      {(showMonthNav || showSpacePick) && (
        <div className="fin-controls">
          {showSpacePick && (
            <select value={acct} onChange={(e) => setAcct(e.target.value)} aria-label="Space" className="space-pick">
              {spaces.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
          {showMonthNav && (
            <div className="date-nav month-nav">
              <button className="secondary" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month">‹</button>
              <span className="month-label">{monthLabel(month)}</span>
              <button className="secondary" onClick={() => setMonth(shiftMonth(month, 1))} disabled={month >= thisMonth()} aria-label="Next month">›</button>
            </div>
          )}
        </div>
      )}
      {tab === 'overview' && <Overview txs={txs} month={month} acct={acct} spaces={spaces} />}
      {tab === 'transactions' && <Transactions txs={txs} month={month} acct={acct} />}
      {tab === 'spaces' && <Spaces txs={txs} spaces={spaces} />}
      {tab === 'recurring' && <RecurringTab txs={txs} />}
      {tab === 'budgets' && <Budgets txs={txs} />}
      {tab === 'savings' && <Savings txs={txs} />}
    </div>
  )
}

/* ---------------- overview ---------------- */

function Overview({ txs, month, acct, spaces }: { txs?: Transaction[]; month: string; acct: string; spaces: { id: string; name: string }[] }) {
  const budgets = useAlive<Budget>('budgets')
  const s = useMemo(() => summarizeMonth(txs ?? [], month, acct), [txs, month, acct])
  const balance = useMemo(() => balanceOf(txs ?? [], acct), [txs, acct])
  const budgetMap = useMemo(() => new Map((budgets ?? []).filter((b) => !b.deleted).map((b) => [b.category, b.limit])), [budgets])
  if (!txs) return null
  const maxSpend = s.byCategory[0]?.amount ?? 1
  const spaceName = spaces.find((x) => x.id === acct)?.name ?? 'Main'

  async function correct() {
    const v = prompt(`Actual balance of "${spaceName}" right now (€):`, String(balance))
    if (v == null) return
    const actual = parseAmount(v)
    if (Number.isNaN(actual)) return
    await correctBalance(acct, actual, balance)
  }

  return (
    <>
      <div className="card balance-card">
        <div className="eyebrow">balance · {spaceName}</div>
        <div className="row-between">
          <div className={`balance-val ${balance >= 0 ? 'ok' : 'bad'}`}>{money(balance)}</div>
          <button className="secondary" onClick={correct}>✎ correct</button>
        </div>
      </div>

      <div className="grid fin-grid">
        <Tile label="income" value={money(s.income)} cls="ok" />
        <Tile label="expenses" value={money(s.expense)} cls="warn" />
        <Tile label="net" value={money(s.net)} cls={s.net >= 0 ? 'ok' : 'bad'} />
      </div>
      <div className="card">
        <h2>expenses by category</h2>
        {s.byCategory.length ? (
          <div className="catlist">
            {s.byCategory.map((c) => {
              const limit = budgetMap.get(c.category)
              const ratio = limit ? c.amount / limit : c.amount / maxSpend
              const over = limit != null && c.amount > limit
              const near = limit != null && !over && c.amount >= limit * 0.85
              return (
                <div className="cat-row" key={c.category}>
                  <span className="cat-name">{c.category}</span>
                  <div className="cat-track"><div className={`cat-fill${over ? ' over' : near ? ' near' : ''}`} style={{ width: `${Math.min(100, ratio * 100)}%` }} /></div>
                  <span className={`cat-amt${over ? ' bad' : ''}`}>{limit != null ? `${money(c.amount)} / ${money(limit)}` : money(c.amount)}</span>
                </div>
              )
            })}
          </div>
        ) : (
          <Empty>no expenses this month</Empty>
        )}
      </div>
    </>
  )
}

/* ---------------- transactions ---------------- */

function Transactions({ txs, month, acct }: { txs?: Transaction[]; month: string; acct: string }) {
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [type, setType] = useState<TxType>('out')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('')
  const [date, setDate] = useState(today)
  const [note, setNote] = useState('')

  function loadForEdit(t: Transaction) {
    setEditing(t); setType(t.type); setAmount(String(t.amount)); setCategory(t.category); setDate(t.date); setNote(t.note ?? '')
  }
  function reset() {
    setEditing(null); setAmount(''); setCategory(''); setNote(''); setDate(today())
  }

  const list = useMemo(
    () => (txs ?? [])
      .filter((t) => monthOf(t.date) === month && accountOf(t) === acct)
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt),
    [txs, month, acct],
  )
  const pastCats = useMemo(() => [...new Set((txs ?? []).map((t) => t.category).filter(Boolean))], [txs])
  const cats = [...new Set([...(type === 'out' ? DEFAULT_EXPENSE_CATS : DEFAULT_INCOME_CATS), ...pastCats])]

  async function submit(e: FormEvent) {
    e.preventDefault()
    const amt = parseAmount(amount)
    if (!(amt > 0) || !category.trim()) return
    const data = { date, amount: amt, type, category: category.trim(), note: note.trim() || undefined, account: acct }
    if (editing) await update<Transaction>('transactions', editing.id, data)
    else await create<Transaction>('transactions', data)
    reset()
  }

  return (
    <>
      <form className="card form" onSubmit={submit}>
        <div className="row-between">
          <div className="seg">
            <button type="button" className={type === 'out' ? 'on' : ''} onClick={() => setType('out')}>− expense</button>
            <button type="button" className={type === 'in' ? 'on' : ''} onClick={() => setType('in')}>+ income</button>
          </div>
          {editing && <span className="dim small">editing · <button type="button" className="link" onClick={reset}>cancel</button></span>}
        </div>
        <div className="form-row">
          <label className="field"><span>amount €</span><input inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} required className="num" /></label>
          <label className="field grow"><span>category</span><input list="fin-cats" value={category} onChange={(e) => setCategory(e.target.value)} required /><datalist id="fin-cats">{cats.map((c) => <option key={c} value={c} />)}</datalist></label>
          <label className="field"><span>date</span><input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} /></label>
        </div>
        <div className="form-row">
          <input className="grow" placeholder="note (optional)" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Note" />
          <button>{editing ? 'save' : '+ add'}</button>
        </div>
      </form>

      <div className="card">
        <h2>{monthLabel(month)}</h2>
        {txs && !list.length && <Empty>no transactions in this space this month</Empty>}
        <table className="tbl">
          <tbody>
            {list.map((t) => (
              <tr key={t.id} className={editing?.id === t.id ? 'editing-row' : ''}>
                <td className="dim">{t.date.slice(8)}.{t.date.slice(5, 7)}</td>
                <td>{t.category}{t.id.startsWith('rec-') && <span className="src">auto</span>}{t.transfer && <span className="src">move</span>}</td>
                <td className="dim ellipsis">{t.note}</td>
                <td className={`r ${t.type === 'in' ? 'ok' : ''}`}>{t.type === 'in' ? '+' : '−'}{money(t.amount)}</td>
                {!t.transfer ? <td className="r"><button className="link" onClick={() => loadForEdit(t)}>edit</button></td> : <td />}
                <td className="r"><button className="x" onClick={() => remove('transactions', t.id)} aria-label="Delete">×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

/* ---------------- spaces ---------------- */

function Spaces({ txs, spaces }: { txs?: Transaction[]; spaces: { id: string; name: string }[] }) {
  const [name, setName] = useState('')
  const [from, setFrom] = useState(MAIN)
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('')
  const total = useMemo(() => balanceOf(txs ?? []), [txs])

  async function addSpace(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    await create<Account>('accounts', { name: name.trim() })
    setName('')
  }

  async function doTransfer(e: FormEvent) {
    e.preventDefault()
    const amt = parseAmount(amount)
    if (!(amt > 0) || from === to || !to) return
    const fromName = spaces.find((s) => s.id === from)?.name ?? 'Main'
    const toName = spaces.find((s) => s.id === to)?.name ?? ''
    await transferBetween(from, to, amt, fromName, toName)
    setAmount('')
  }

  async function del(id: string, nm: string) {
    if (!confirm(`Delete space "${nm}"? Its transactions move to Main.`)) return
    const own = (txs ?? []).filter((t) => accountOf(t) === id && !t.deleted)
    for (const t of own) await update<Transaction>('transactions', t.id, { account: MAIN })
    await remove('accounts', id)
  }

  const others = spaces.filter((s) => s.id !== from)

  return (
    <>
      <div className="card">
        <div className="eyebrow">total across all spaces</div>
        <div className={`balance-val ${total >= 0 ? 'ok' : 'bad'}`}>{money(total)}</div>
      </div>

      <div className="card">
        <h2>spaces</h2>
        <div className="catlist">
          {spaces.map((s) => (
            <div className="cat-row" key={s.id}>
              <span className="cat-name grow">{s.name}</span>
              <span className="cat-amt">{money(balanceOf(txs ?? [], s.id))}</span>
              {s.id !== MAIN && <button className="x" onClick={() => del(s.id, s.name)} aria-label="Delete space">×</button>}
            </div>
          ))}
        </div>
        <form className="form-row" onSubmit={addSpace} style={{ marginTop: 10 }}>
          <input className="grow" placeholder="new space (e.g. Savings, Cash)" value={name} onChange={(e) => setName(e.target.value)} aria-label="Space name" />
          <button>+ space</button>
        </form>
      </div>

      {spaces.length > 1 && (
        <form className="card form" onSubmit={doTransfer}>
          <h2>move money</h2>
          <div className="form-row">
            <label className="field"><span>from</span><select value={from} onChange={(e) => setFrom(e.target.value)}>{spaces.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
            <label className="field"><span>to</span><select value={to} onChange={(e) => setTo(e.target.value)}><option value="">…</option>{others.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
            <label className="field"><span>amount €</span><input inputMode="decimal" className="num" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
            <button>move</button>
          </div>
        </form>
      )}
    </>
  )
}

/* ---------------- recurring ---------------- */

function RecurringTab({ txs }: { txs?: Transaction[] }) {
  const recs = useAlive<Recurring>('recurring')
  const [type, setType] = useState<TxType>('out')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('')
  const [day, setDay] = useState('1')
  const [note, setNote] = useState('')

  const pastCats = useMemo(() => [...new Set((txs ?? []).map((t) => t.category).filter(Boolean))], [txs])
  const cats = [...new Set([...(type === 'out' ? DEFAULT_EXPENSE_CATS : DEFAULT_INCOME_CATS), ...pastCats])]
  const active = (recs ?? []).filter((r) => !r.deleted).sort((a, b) => a.dayOfMonth - b.dayOfMonth)

  async function add(e: FormEvent) {
    e.preventDefault()
    const amt = parseAmount(amount)
    const d = Math.max(1, Math.min(31, Math.round(Number(day))))
    if (!(amt > 0) || !category.trim()) return
    await create<Recurring>('recurring', { type, amount: amt, category: category.trim(), note: note.trim() || undefined, dayOfMonth: d, active: true })
    setAmount(''); setCategory(''); setNote('')
    await applyDueRecurring().catch(() => undefined)
  }

  return (
    <>
      <form className="card form" onSubmit={add}>
        <h2>new recurring entry</h2>
        <div className="seg">
          <button type="button" className={type === 'out' ? 'on' : ''} onClick={() => setType('out')}>− expense</button>
          <button type="button" className={type === 'in' ? 'on' : ''} onClick={() => setType('in')}>+ income</button>
        </div>
        <div className="form-row">
          <label className="field"><span>amount €</span><input inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} required className="num" /></label>
          <label className="field grow"><span>category</span><input list="rec-cats" value={category} onChange={(e) => setCategory(e.target.value)} required /><datalist id="rec-cats">{cats.map((c) => <option key={c} value={c} />)}</datalist></label>
          <label className="field"><span>day of month</span><input type="number" min={1} max={31} value={day} onChange={(e) => setDay(e.target.value)} className="num" /></label>
        </div>
        <div className="form-row">
          <input className="grow" placeholder="note (optional)" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Note" />
          <button>+ add</button>
        </div>
      </form>
      <div className="card">
        <h2>recurring</h2>
        <p className="muted small">Added automatically each month on their day (day 31 → last day in short months).</p>
        {recs && !active.length && <Empty>nothing recurring yet</Empty>}
        <table className="tbl">
          <tbody>
            {active.map((r) => (
              <tr key={r.id} className={r.active ? '' : 'dim'}>
                <td className="dim">day {r.dayOfMonth}</td>
                <td>{r.category}</td>
                <td className={`r ${r.type === 'in' ? 'ok' : ''}`}>{r.type === 'in' ? '+' : '−'}{money(r.amount)}</td>
                <td className="r"><button className="link" onClick={() => update<Recurring>('recurring', r.id, { active: !r.active })}>{r.active ? 'pause' : 'resume'}</button></td>
                <td className="r"><button className="x" onClick={() => remove('recurring', r.id)} aria-label="Delete">×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

/* ---------------- budgets ---------------- */

function Budgets({ txs }: { txs?: Transaction[] }) {
  const budgets = useAlive<Budget>('budgets')
  const s = useMemo(() => summarizeMonth(txs ?? [], thisMonth()), [txs])
  const [category, setCategory] = useState('')
  const [limit, setLimit] = useState('')

  const pastCats = [...new Set((txs ?? []).filter((t) => t.type === 'out').map((t) => t.category))]
  const cats = [...new Set([...DEFAULT_EXPENSE_CATS, ...pastCats])]
  const spent = new Map(s.byCategory.map((c) => [c.category, c.amount]))
  const list = (budgets ?? []).filter((b) => !b.deleted).sort((a, b) => a.category.localeCompare(b.category))

  async function save(e: FormEvent) {
    e.preventDefault()
    const l = parseAmount(limit)
    if (!category.trim() || !(l > 0)) return
    const existing = (budgets ?? []).find((b) => !b.deleted && b.category === category.trim())
    if (existing) await update<Budget>('budgets', existing.id, { limit: l })
    else await create<Budget>('budgets', { category: category.trim(), limit: l })
    setCategory(''); setLimit('')
  }

  return (
    <>
      <form className="card form-row" onSubmit={save}>
        <label className="field grow"><span>category</span><input list="bud-cats" value={category} onChange={(e) => setCategory(e.target.value)} required /><datalist id="bud-cats">{cats.map((c) => <option key={c} value={c} />)}</datalist></label>
        <label className="field"><span>monthly €</span><input inputMode="decimal" className="num" value={limit} onChange={(e) => setLimit(e.target.value)} required /></label>
        <button>set</button>
      </form>
      <div className="card">
        <h2>budgets · {monthLabel(thisMonth())}</h2>
        {budgets && !list.length && <Empty>no budgets set — add one above to track a category</Empty>}
        <div className="catlist">
          {list.map((b) => {
            const used = spent.get(b.category) ?? 0
            const ratio = used / b.limit
            const over = used > b.limit
            const near = !over && used >= b.limit * 0.85
            return (
              <div className="cat-row" key={b.id}>
                <span className="cat-name">{b.category}</span>
                <div className="cat-track"><div className={`cat-fill${over ? ' over' : near ? ' near' : ''}`} style={{ width: `${Math.min(100, ratio * 100)}%` }} /></div>
                <span className={`cat-amt${over ? ' bad' : ''}`}>{money(used)} / {money(b.limit)}</span>
                <button className="x" onClick={() => remove('budgets', b.id)} aria-label="Delete budget">×</button>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}

/* ---------------- savings ---------------- */

function Savings({ txs }: { txs?: Transaction[] }) {
  const goals = useAlive<SavingsGoal>('savingsGoals')
  const [name, setName] = useState('')
  const [target, setTarget] = useState('')

  const savedThisMonth = useMemo(() => summarizeMonth(txs ?? [], thisMonth()).net, [txs])
  const active = (goals ?? []).filter((g) => !g.archived)

  async function addGoal(e: FormEvent) {
    e.preventDefault()
    const t = parseAmount(target)
    if (!name.trim() || !(t > 0)) return
    await create<SavingsGoal>('savingsGoals', { name: name.trim(), target: t, saved: 0 })
    setName(''); setTarget('')
  }

  async function contribute(g: SavingsGoal) {
    const v = prompt(`Add to "${g.name}" (€). Use a negative number to withdraw.`)
    if (v == null) return
    const n = parseAmount(v)
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
