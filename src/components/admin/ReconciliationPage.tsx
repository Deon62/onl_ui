import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, XCircle } from 'lucide-react'
import { useStore } from '../../store/AppStore'
import { useAllLedgers } from '../../store/selectors'
import { tillReconciliation, type MerchantLedger } from '../../lib/finance'
import { fmtAmount, fmtDateTime, fmtKES, round2 } from '../../lib/format'
import { DataTable, type Column } from '../shared/DataTable'
import { Badge, Card, Notice, PageHeader, Statement, StatusBadge } from '../shared/ui'

export function ReconciliationPage() {
  const { data } = useStore()
  const ledgers = useAllLedgers()
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

  return (
    <>
      <PageHeader
        title="Reconciliation"
        description={`Proves that money on the shared collection account equals what Oryne owes merchants, what is held in suspense, and Oryne's own retained share. Computed ${fmtDateTime(new Date())}.`}
      />
      <div className="mb-6">
        {allBalanced
          ? <Notice tone="success" title="All ledgers reconcile">Collection account, merchant ledgers and suspense balance to the cent.</Notice>
          : <Notice tone="error" title="Reconciliation differences detected">Review the items marked below before executing payouts.</Notice>}
      </div>
      <div className="mb-6 grid gap-4 xl:grid-cols-2">
        <Card title="Collection account (Till) position" subtitle="All-time cash movements on the shared Till">
          <Statement lines={[
            { label: 'Customer payments received', value: fmtKES(till.receipts - till.smsTopUpsReceived) },
            { label: 'SMS credit top-ups received', value: fmtKES(till.smsTopUpsReceived) },
            { label: 'Refunds and reversals returned to customers', value: fmtKES(till.refundsOut), kind: 'less' },
            { label: 'Payouts sent to merchants (net)', value: fmtKES(till.payoutsSent), kind: 'less' },
            { label: 'Provider collection charges', value: fmtKES(till.providerCharges), kind: 'less' },
            { label: 'Payout transfer costs', value: fmtKES(till.payoutCosts), kind: 'less' },
            { label: 'Funds held on collection account', value: fmtKES(till.held), kind: 'total' },
          ]} />
        </Card>
        <Card title="Represented by" subtitle="Who the held funds belong to">
          <Statement lines={[
            { label: 'Merchant funds owed', value: fmtKES(till.merchantFundsOwed), note: 'Available + settling + payouts in progress - a liability, not revenue' },
            { label: 'Prepaid SMS credit held', value: fmtKES(till.smsCreditHeld), note: 'Unused SMS credit - recognised as revenue when alerts are sent' },
            { label: 'Unattributed suspense', value: fmtKES(till.suspense), note: `${unmatched.length} unmatched payments awaiting resolution` },
            { label: 'Oryne retained share', value: fmtKES(till.oryneShare), note: 'Fees and payout fees less provider charges and transfer costs' },
            { label: 'Total', value: fmtKES(till.merchantFundsOwed + till.smsCreditHeld + till.suspense + till.oryneShare), kind: 'total' },
            { label: 'Difference', value: fmtKES(till.difference), kind: 'muted' },
          ]} />
        </Card>
      </div>

      <Card flush title="Merchant ledger reconciliation" subtitle="Net earned - settling - paid out - in progress must equal available" className="mb-6">
        <DataTable columns={cols} rows={rows} rowKey={(l) => l.merchantId} />
      </Card>

      <Card flush title="Open reconciliation items">
        <ul className="divide-y divide-line-soft text-[13px]">
          {[
            { label: 'Unmatched Till payments in suspense', count: unmatched.length, amount: unmatched.reduce((s, t) => s + t.amount, 0), to: '/admin/collections', tone: unmatched.length ? 'Unmatched' : 'Matched' },
            { label: 'Payments pending for more than 30 minutes (callback not received)', count: stuck.length, amount: stuck.reduce((s, t) => s + t.amount, 0), to: '/admin/transactions', tone: stuck.length ? 'Pending' : 'Matched' },
            { label: 'Payouts pending or processing', count: pendingPayouts.length, amount: pendingPayouts.reduce((s, p) => s + p.amount, 0), to: '/admin/payouts', tone: pendingPayouts.length ? 'Processing' : 'Matched' },
            { label: 'Merchants with negative available balance', count: negative.length, amount: negative.reduce((s, l) => s + l.available, 0), to: '/admin/merchants', tone: negative.length ? 'Failed' : 'Matched' },
          ].map((i) => (
            <li key={i.label}>
              <Link to={i.to} className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-subtle/60">
                <span className="flex items-center gap-3">{i.count ? <StatusBadge status={i.tone} /> : <Badge tone="success" icon={CheckCircle2}>Clear</Badge>} {i.label}</span>
                <span className="num shrink-0 text-muted">{i.count} · {fmtKES(i.amount)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </>
  )
}
