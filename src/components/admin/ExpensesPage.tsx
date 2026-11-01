import { useMemo, useState } from 'react'
import { Download, Pencil, Plus, Trash2 } from 'lucide-react'
import type { Expense, ExpenseCategory } from '../../types'
import { useActions, useStore } from '../../store/AppStore'
import { inRange, rangeFromPreset, rangeLabel, toInputDate, type DateRange } from '../../lib/dates'
import { platformSummary } from '../../lib/finance'
import { exportCsv } from '../../lib/csv'
import { fmtAmount, fmtDate, fmtKES } from '../../lib/format'
import { DataTable, type Column } from '../shared/DataTable'
import { DateRangeFilter } from '../shared/DateRangeFilter'
import { useChartColors } from '../shared/charts'
import { Button, Card, Field, IconButton, Input, Modal, Notice, PageHeader, SearchInput, Select, StatCard, StatusBadge } from '../shared/ui'

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'PayHero transaction charges', 'PayHero token costs', 'Safaricom / Daraja', 'Hosting & infrastructure', 'Software services',
  'SMS & notifications', 'Refunds & reversals', 'Operational', 'Other',
]

export function ExpensesPage() {
  const { data } = useStore()
  const actions = useActions()
  const c = useChartColors()
  const [range, setRange] = useState<DateRange>(rangeFromPreset('90d'))
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [editing, setEditing] = useState<Partial<Expense> | null>(null)
  const [deleting, setDeleting] = useState<Expense | null>(null)

  const s = useMemo(() => platformSummary(data.transactions, data.payouts, data.expenses, data.revenue, range), [data, range])
  const rows = useMemo(() => {
    const n = q.toLowerCase()
    return data.expenses.filter((e) => inRange(e.date, range) && (!cat || e.category === cat) && (!n || `${e.id} ${e.description} ${e.provider}`.toLowerCase().includes(n)))
  }, [data.expenses, range, cat, q])

  const byCat = useMemo(() => {
    const m = new Map<string, number>()
    m.set('Provider charges (per transaction)', s.providerCharges)
    m.set('Payout transfer costs', s.payoutCosts)
    m.set('SMS sending (per alert)', s.smsCosts)
    for (const e of data.expenses) if (inRange(e.date, range)) m.set(e.category, (m.get(e.category) ?? 0) + e.amount)
    const total = [...m.values()].reduce((a, b) => a + b, 0)
    return { items: [...m.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]), total }
  }, [data.expenses, range, s.providerCharges, s.payoutCosts, s.smsCosts])

  const unpaid = rows.filter((e) => e.status !== 'Paid')

  const cols: Column<Expense>[] = [
    { key: 'id', header: 'Expense ID', cell: (e) => <span className="mono">{e.id}</span>, sort: (e) => e.id },
    { key: 'cat', header: 'Category', cell: (e) => e.category, sort: (e) => e.category, hideBelow: 'md' },
    { key: 'd', header: 'Description', cell: (e) => <div className="max-w-[320px] truncate" title={e.description}>{e.description}</div> },
    { key: 'p', header: 'Provider', cell: (e) => <span className="text-muted">{e.provider}</span>, hideBelow: 'lg' },
    { key: 'a', header: 'Amount', align: 'right', cell: (e) => fmtAmount(e.amount), sort: (e) => e.amount },
    { key: 'dt', header: 'Date', cell: (e) => <span className="text-muted">{fmtDate(e.date)}</span>, sort: (e) => e.date, hideBelow: 'sm' },
    { key: 's', header: 'Status', cell: (e) => <StatusBadge status={e.status} /> },
    {
      key: 'x', header: '', align: 'right', cell: (e) => (
        <span className="inline-flex">
          <IconButton icon={Pencil} label="Edit expense" onClick={(ev) => { ev.stopPropagation(); setEditing(e) }} />
          <IconButton icon={Trash2} label="Delete expense" onClick={(ev) => { ev.stopPropagation(); setDeleting(e) }} />
        </span>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Expenses"
        description={`Costs incurred by Oryne Network for ${rangeLabel(range).toLowerCase()}. Provider expenses are tracked separately from merchant funds.`}
        actions={
          <>
            <DateRangeFilter value={range} onChange={setRange} />
            <Button variant="primary" icon={Plus} onClick={() => setEditing({ category: 'Hosting & infrastructure', status: 'Paid', date: new Date().toISOString() })}>Add expense</Button>
          </>
        }
      />
      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total operating costs" value={fmtKES(s.operatingCosts)} hint="all categories" />
        <StatCard label="Provider charges" value={fmtKES(s.providerCharges)} hint="auto-recorded per transaction" />
        <StatCard label="Recorded expenses" value={fmtKES(s.expenses)} hint={`${rows.length} entries`} />
        <StatCard label="Unpaid" value={fmtKES(unpaid.reduce((a, e) => a + e.amount, 0))} hint={`${unpaid.length} pending or overdue`} />
      </div>

      <div className="mb-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Card title="Cost breakdown" subtitle={fmtKES(byCat.total)}>
          <div className="space-y-3">
            {byCat.items.map(([k, v]) => (
              <div key={k}>
                <div className="mb-1 flex justify-between gap-3 text-[12.5px]"><span className="text-ink">{k}</span><span className="num text-muted">{fmtKES(v)}</span></div>
                <div className="h-1.5 overflow-hidden rounded-full bg-subtle"><div className="h-full rounded-full" style={{ width: `${(v / byCat.total) * 100}%`, background: k.startsWith('Provider') || k.startsWith('Payout') || k.startsWith('SMS sending') ? c.series[1] : c.series[0] }} /></div>
              </div>
            ))}
          </div>
          <div className="mt-5"><Notice>Per-transaction provider charges and SMS sending costs are captured automatically from each payment. Use "PayHero transaction charges" only for invoice adjustments not already captured, to avoid double counting.</Notice></div>
        </Card>
        <Card flush title="Expense ledger" actions={
          <Button size="sm" icon={Download} onClick={() => exportCsv('oryne-expenses.csv', rows, [
            { header: 'Expense ID', value: (e) => e.id }, { header: 'Category', value: (e) => e.category }, { header: 'Description', value: (e) => e.description },
            { header: 'Amount', value: (e) => e.amount.toFixed(2) }, { header: 'Provider', value: (e) => e.provider }, { header: 'Date', value: (e) => e.date.slice(0, 10) }, { header: 'Status', value: (e) => e.status },
          ])}>Export</Button>
        }>
          <div className="flex flex-col gap-2.5 border-b border-line-soft px-5 py-3 sm:flex-row">
            <SearchInput value={q} onChange={setQ} placeholder="Search description, provider, ID" className="sm:w-[280px]" />
            <Select value={cat} onChange={(e) => setCat(e.target.value)} className="sm:w-[220px]" aria-label="Category filter">
              <option value="">All categories</option>
              {EXPENSE_CATEGORIES.map((x) => <option key={x}>{x}</option>)}
            </Select>
          </div>
          <DataTable columns={cols} rows={rows} rowKey={(e) => e.id} onRowClick={setEditing} pageSize={10} emptyTitle="No expenses in this period" emptyDescription="Record provider, hosting and other operating costs to track net profit." />
        </Card>
      </div>

      {editing && <ExpenseModal expense={editing} onClose={() => setEditing(null)} onSave={(e) => { actions.saveExpense(e); setEditing(null) }} />}
      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        size="sm"
        title="Delete expense?"
        footer={<><Button onClick={() => setDeleting(null)}>Cancel</Button><Button variant="danger" onClick={() => { actions.deleteExpense(deleting!.id); setDeleting(null) }}>Delete</Button></>}
      >
        <p className="text-[13px] text-muted">{deleting?.id} - {deleting?.description} ({deleting && fmtKES(deleting.amount)}) will be removed from the ledger.</p>
      </Modal>
    </>
  )
}

function ExpenseModal({ expense, onClose, onSave }: { expense: Partial<Expense>; onClose: () => void; onSave: (e: Omit<Expense, 'id'> & { id?: string }) => void }) {
  const [f, setF] = useState({
    category: expense.category ?? 'Other', description: expense.description ?? '', amount: expense.amount?.toString() ?? '',
    provider: expense.provider ?? '', date: toInputDate(new Date(expense.date ?? Date.now())), status: expense.status ?? 'Paid',
  })
  const amount = Number(f.amount)
  const valid = f.description.trim() && f.provider.trim() && amount > 0 && f.date
  return (
    <Modal
      open
      onClose={onClose}
      title={expense.id ? `Edit ${expense.id}` : 'Add expense'}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!valid} onClick={() => onSave({ id: expense.id, category: f.category as ExpenseCategory, description: f.description.trim(), amount, provider: f.provider.trim(), date: new Date(f.date + 'T12:00:00').toISOString(), status: f.status as Expense['status'] })}>{expense.id ? 'Save changes' : 'Add expense'}</Button></>}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Category">
          <Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as ExpenseCategory })}>{EXPENSE_CATEGORIES.map((x) => <option key={x}>{x}</option>)}</Select>
        </Field>
        <Field label="Provider"><Input value={f.provider} onChange={(e) => setF({ ...f, provider: e.target.value })} placeholder="e.g. PayHero" /></Field>
        <Field label="Description" className="sm:col-span-2"><Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="What was this cost for?" /></Field>
        <Field label="Amount (KES)"><Input type="number" min={0} step="0.01" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
        <Field label="Date"><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Payment status">
          <Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as Expense['status'] })}><option>Paid</option><option>Pending</option><option>Overdue</option></Select>
        </Field>
      </div>
    </Modal>
  )
}
