import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, ChevronDown, ChevronUp, XCircle } from 'lucide-react'
import { useStore } from '../../store/AppStore'
import { useAllLedgers } from '../../store/selectors'
import { tillReconciliation, type MerchantLedger } from '../../lib/finance'
import { fmtAmount, fmtKES, round2 } from '../../lib/format'
import { DataTable, type Column } from '../shared/DataTable'
import { Badge, Button, Card, PageHeader, Statement, StatCard, StatusBadge } from '../shared/ui'

export function ReconciliationPage() {
  const { data } = useStore()
  const ledgers = useAllLedgers()
  const [open, setOpen] = useState(false)
  const till = useMemo(() => tillReconciliation(data), [data])
  const names = Object.fromEntries(data.merchants.map((m) => [m.id, m.name]))
  const rows = Object.values(ledgers)

  const check = (l: MerchantLedger) => round2(l.netEarned - l.pendingSettlement - l.paidOut - l.payoutsInProgress - l.smsTopUpsFromBalance - l.available)
  const allBalanced = rows.every((l) => Math.abs(check(l)) < 0.01) && Math.abs(till.difference) < 0.01

  const stuck = data.transactions.filter((t) => (t.status === 'Pending' || t.status === 'Initiated') && Date.now() - new Date(t.initiatedAt).getTime() > 30 * 60_000)
  const unmatched = data.transactions.filter((t) => t.status === 'Unmatched')
  const pendingPayouts = data.payouts.filter((p) => p.status === 'Pending' || p.status === 'Processing')
  const negative = rows.filter((l) => l.available < 0)

  const cols: Column<MerchantLedger>[] = [
    { key: 'm', header: 'Merchant', cell: (l) => <Link to={`/admin/merchants/${l.merchantId}`} className="hover:text-primary">{names[l.merchantId]}</Link> },
    { key: 'net', header: 'Net earned', align: 'right', cell: (l) => fmtAmount(l.netEarned) },
    { key: 'pend', header: 'Settling', align: 'right', cell: (l) => fmtAmount(l.pendingSettlement), hideBelow: 'md' },
    { key: 'paid', header: 'Paid out', align: 'right', cell: (l) => fmtAmount(l.paidOut), hideBelow: 'sm' },
    { key: 'prog', header: 'In progress', align: 'right', cell: (l) => fmtAmount(l.payoutsInProgress), hideBelow: 'lg' },
    { key: 'avail', header: 'Available', align: 'right', cell: (l) => fmtAmount(l.available) },
    { key: 'owed', header: 'Total owed', align: 'right', cell: (l) => <span className="font-medium">{fmtAmount(l.owed)}</span>, hideBelow: 'md' },
    { key: 'chk', header: 'Check', align: 'center', cell: (l) => Math.abs(check(l)) < 0.01 ? <Badge tone="success" icon={CheckCircle2}>Balanced</Badge> : <Badge tone="error" icon={XCircle}>{fmtAmount(check(l))}</Badge> },
  ]

  const items = [
    { label: 'Unmatched Till payments', count: unmatched.length, amount: unmatched.reduce((s, t) => s + t.amount, 0), to: '/admin/collections', tone: 'Unmatched' },
    { label: 'Payments pending over 30 min', count: stuck.length, amount: stuck.reduce((s, t) => s + t.amount, 0), to: '/admin/transactions', tone: 'Pending' },
    { label: 'Payouts in progress', count: pendingPayouts.length, amount: pendingPayouts.reduce((s, p) => s + p.amount, 0), to: '/admin/payouts', tone: 'Processing' },
    { label: 'Negative merchant balances', count: negative.length, amount: negative.reduce((s, l) => s + l.available, 0), to: '/admin/merchants', tone: 'Failed' },
  ].filter((i) => i.count > 0)

  return (
    <>
      <PageHeader
        title="Reconciliation"
        actions={allBalanced
          ? <Badge tone="success" icon={CheckCircle2}>All balanced</Badge>
          : <Badge tone="error" icon={XCircle}>Differences found</Badge>}
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Held on Till" value={fmtKES(till.held)} hint={Math.abs(till.difference) >= 0.01 ? `Difference ${fmtKES(till.difference)}` : undefined} accent={Math.abs(till.difference) >= 0.01 ? 'var(--error)' : undefined} />
        <StatCard label="Owed to merchants" value={fmtKES(till.merchantFundsOwed + till.smsCreditHeld)} />
        <StatCard label="Suspense" value={fmtKES(till.suspense)} />
        <StatCard label="Oryne share" value={fmtKES(till.oryneShare)} />
      </div>

      <Card
        title="Till breakdown"
        className="mb-6"
        actions={<Button size="sm" variant="ghost" iconRight={open ? ChevronUp : ChevronDown} onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Show'}</Button>}
        bodyClassName={open ? undefined : 'hidden'}
      >
        <div className="grid gap-8 xl:grid-cols-2">
          <Statement lines={[
            { label: 'Customer payments', value: fmtKES(till.receipts - till.smsTopUpsReceived) },
            { label: 'SMS top-ups', value: fmtKES(till.smsTopUpsReceived) },
            { label: 'Refunds', value: fmtKES(till.refundsOut), kind: 'less' },
            { label: 'Payouts sent', value: fmtKES(till.payoutsSent), kind: 'less' },
            { label: 'Provider charges', value: fmtKES(till.providerCharges), kind: 'less' },
            { label: 'Transfer costs', value: fmtKES(till.payoutCosts), kind: 'less' },
            { label: 'Held on Till', value: fmtKES(till.held), kind: 'total' },
          ]} />
          <Statement lines={[
            { label: 'Merchant funds', value: fmtKES(till.merchantFundsOwed) },
            { label: 'Prepaid SMS credit', value: fmtKES(till.smsCreditHeld) },
            { label: 'Suspense', value: fmtKES(till.suspense) },
            { label: 'Oryne share', value: fmtKES(till.oryneShare) },
            { label: 'Total', value: fmtKES(till.merchantFundsOwed + till.smsCreditHeld + till.suspense + till.oryneShare), kind: 'total' },
            { label: 'Difference', value: fmtKES(till.difference), kind: 'muted' },
          ]} />
        </div>
      </Card>

      <Card flush title="Merchant ledgers" className="mb-6">
        <DataTable columns={cols} rows={rows} rowKey={(l) => l.merchantId} />
      </Card>

      <Card flush title="Open items">
        {items.length === 0
          ? <p className="flex items-center gap-2 px-5 py-3.5 text-[13px] text-muted"><CheckCircle2 size={15} className="text-success" /> Nothing to resolve</p>
          : (
            <ul className="divide-y divide-line-soft text-[13px]">
              {items.map((i) => (
                <li key={i.label}>
                  <Link to={i.to} className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-subtle/60">
                    <span className="flex items-center gap-3"><StatusBadge status={i.tone} /> {i.label}</span>
                    <span className="num shrink-0 text-muted">{i.count} · {fmtKES(i.amount)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
      </Card>
    </>
  )
}
