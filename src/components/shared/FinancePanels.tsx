import { useMemo, useState, type ReactNode } from "react"
import { Download } from 'lucide-react'
import type { ActivityLog, Payout } from '../../types'
import type { MerchantLedger } from '../../lib/finance'
import { automatedRail, isMobileMoney } from '../../lib/settlement'
import { useActions, useStore } from "../../store/AppStore"
import { exportCsv } from '../../lib/csv'
import { fmtAmount, fmtDateTime, fmtKES, fmtPhone, fmtRelative } from '../../lib/format'
import { DataTable, type Column } from './DataTable'
import { Button, Drawer, IconButton, KeyValue, Mono, Select, Statement, StatusBadge } from './ui'

export function BalanceStatement({ ledger }: { ledger: MerchantLedger }) {
  return (
    <Statement
      lines={[
        { label: 'Total successful collections', value: fmtKES(ledger.grossCollections), note: `${ledger.collectionCount.toLocaleString()} payments received` },
        { label: 'Oryne transaction fees', value: fmtKES(ledger.fees), kind: 'less' },
        { label: 'Refunds and reversals', value: fmtKES(ledger.refunds), kind: 'less' },
        { label: 'Net collections earned', value: fmtKES(ledger.netEarned), kind: 'subtotal' },
        { label: 'Pending settlement', value: fmtKES(ledger.pendingSettlement), kind: 'less', note: 'Confirmed collections inside the settlement window' },
        { label: 'Previous payouts', value: fmtKES(ledger.paidOut), kind: 'less', note: `${fmtKES(ledger.paidOutNet)} received + ${fmtKES(ledger.payoutFees)} payout fees` },
        { label: 'Payouts in progress', value: fmtKES(ledger.payoutsInProgress), kind: 'less' },
        ...(ledger.smsTopUpsFromBalance > 0 ? [{ label: 'SMS credit bought from balance', value: fmtKES(ledger.smsTopUpsFromBalance), kind: 'less' as const }] : []),
        { label: 'Available merchant balance', value: fmtKES(ledger.available), kind: 'total' },
      ]}
    />
  )
}

function destinationLabel(p: Payout) {
  return p.method === 'M-Pesa' ? fmtPhone(p.destination).replace(/(\d{3}) (\d{3})$/, '*** $2') : p.destination
}

export function PayoutsTable({ payouts, showMerchant, admin, pageSize = 12 }: { payouts: Payout[]; showMerchant?: boolean; admin?: boolean; pageSize?: number }) {
  const { data } = useStore()
  const [status, setStatus] = useState('')
  const [selected, setSelected] = useState<Payout | null>(null)
  const names = useMemo(() => Object.fromEntries(data.merchants.map((m) => [m.id, m.name])), [data.merchants])
  const rows = useMemo(() => payouts.filter((p) => !status || p.status === status), [payouts, status])
  const sel = selected ? data.payouts.find((p) => p.id === selected.id) ?? selected : null

  const cols: Column<Payout>[] = [
    { key: 'ref', header: 'Payout reference', cell: (p) => <Mono>{p.reference}</Mono> },
    ...(showMerchant ? [{ key: 'm', header: 'Merchant', cell: (p: Payout) => names[p.merchantId], sort: (p: Payout) => names[p.merchantId] }] : []),
    { key: 'amount', header: 'Amount', align: 'right', cell: (p) => fmtAmount(p.amount), sort: (p) => p.amount },
    { key: 'fee', header: 'Fee', align: 'right', cell: (p) => fmtAmount(p.fee), hideBelow: 'lg' },
    { key: 'net', header: 'Net sent', align: 'right', cell: (p) => fmtAmount(p.netAmount), sort: (p) => p.netAmount, hideBelow: 'sm' },
    { key: 'dest', header: 'Destination', cell: (p) => <span className="text-muted">{destinationLabel(p)}</span>, hideBelow: 'lg' },
    { key: 'date', header: 'Date', cell: (p) => <span className="text-muted">{fmtDateTime(p.requestedAt)}</span>, sort: (p) => p.requestedAt, hideBelow: 'md' },
    { key: 'status', header: 'Status', cell: (p) => <StatusBadge status={p.status} /> },
  ]

  return (
    <>
      <div className="flex items-center justify-end gap-2 border-b border-line-soft px-5 py-3">
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-[150px]" aria-label="Payout status filter">
          <option value="">All statuses</option><option>Pending</option><option>Processing</option><option>Completed</option><option>Failed</option>
        </Select>
        <IconButton
          icon={Download}
          label="Export payouts CSV"
          onClick={() => exportCsv('payouts.csv', rows, [
            { header: 'Reference', value: (p) => p.reference }, { header: 'Merchant ID', value: (p) => p.merchantId },
            { header: 'Amount', value: (p) => p.amount.toFixed(2) }, { header: 'Fee', value: (p) => p.fee.toFixed(2) }, { header: 'Net', value: (p) => p.netAmount.toFixed(2) },
            { header: 'Method', value: (p) => p.method }, { header: 'Destination', value: (p) => destinationLabel(p) }, { header: 'Status', value: (p) => p.status },
            { header: 'Requested', value: (p) => p.requestedAt }, { header: 'Completed', value: (p) => p.completedAt },
          ])}
        />
      </div>
      <DataTable columns={cols} rows={rows} rowKey={(p) => p.id} pageSize={pageSize} onRowClick={setSelected} emptyTitle={status ? `No ${status.toLowerCase()} payouts` : 'No payouts yet'} emptyDescription={status ? undefined : admin ? 'Payout requests from merchants will appear here.' : 'Once you have an available balance, request a payout and it will appear here.'} />
      {sel && <PayoutDrawer payout={sel} onClose={() => setSelected(null)} admin={admin} merchantName={names[sel.merchantId]} />}
    </>
  )
}

function PayoutDrawer({ payout: p, onClose, admin, merchantName }: { payout: Payout; onClose: () => void; admin?: boolean; merchantName: string }) {
  return (
    <Drawer
      open
      onClose={onClose}
      title={<span className="flex items-center gap-2.5">{fmtKES(p.netAmount)} <StatusBadge status={p.status} /></span>}
      subtitle={<Mono className="text-muted">{p.reference}</Mono>}
      footer={admin ? <PayoutAdminActions payout={p} /> : undefined}
    >
      <KeyValue
        rows={[
          ['Merchant', merchantName],
          ['Amount debited from balance', <span className="num">{fmtKES(p.amount)}</span>],
          ['Payout fee', <span className="num">{fmtKES(p.fee)}</span>],
          ['Net amount sent', <span className="num font-medium">{fmtKES(p.netAmount)}</span>],
          ...(admin ? [['Provider transfer cost (Oryne)', <span className="num">{fmtKES(p.providerCost)}</span>]] as [string, ReactNode][] : []),
          ['Method', p.method],
          ['Remittance', p.remittance === 'B2C' ? `M-Pesa ${automatedRail(p.method) ?? 'B2C'} (automated)` : p.remittance === 'Manual' ? 'Manual transfer by Oryne' : 'Not yet remitted'],
          ['Destination', destinationLabel(p)],
          ['Initiated by', p.initiatedBy],
          ['Requested', fmtDateTime(p.requestedAt)],
          ['Completed', p.completedAt ? fmtDateTime(p.completedAt) : '-'],
          ...(p.failureReason ? [['Failure reason', <span className="text-error">{p.failureReason}</span>]] as [string, ReactNode][] : []),
        ]}
      />
      {p.status === 'Failed' && <p className="mt-4 text-[12.5px] text-muted">Failed payouts are not deducted from the merchant balance. The funds remain available.</p>}
    </Drawer>
  )
}

function PayoutAdminActions({ payout }: { payout: Payout }) {
  const actions = useActions()
  if (payout.status === 'Pending') {
    return (
      <>
        <Button variant="danger" onClick={() => actions.setPayoutStatus(payout.id, 'Failed', 'Rejected by Oryne operations')}>Reject</Button>
        <Button onClick={() => actions.remitPayout(payout.id, 'Manual')}>Record manual remittance</Button>
        {isMobileMoney(payout.method) && <Button variant="primary" onClick={() => actions.remitPayout(payout.id, 'B2C')}>Send via M-Pesa {automatedRail(payout.method)}</Button>}
      </>
    )
  }
  if (payout.status === 'Processing') {
    return (
      <>
        <Button variant="danger" onClick={() => actions.setPayoutStatus(payout.id, 'Failed', 'Transfer failed at provider')}>Mark failed</Button>
        <Button variant="primary" onClick={() => actions.setPayoutStatus(payout.id, 'Completed')}>Mark completed</Button>
      </>
    )
  }
  return null
}

export function ActivityList({ items, showMerchant = true }: { items: ActivityLog[]; showMerchant?: boolean }) {
  const { data } = useStore()
  const names = Object.fromEntries(data.merchants.map((m) => [m.id, m.name]))
  return (
    <ul className="divide-y divide-line-soft">
      {items.map((a) => (
        <li key={a.id} className="flex items-start gap-3 px-5 py-3 text-[13px]">
          <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${a.role === 'admin' ? 'bg-primary' : a.role === 'system' ? 'bg-faint' : 'bg-success'}`} />
          <div className="min-w-0 flex-1">
            <div className="text-ink">{a.action} <span className="text-muted">· {a.target}</span></div>
            <div className="mt-0.5 text-[12px] text-muted">
              {a.actor}{showMerchant && a.merchantId && names[a.merchantId] ? ` · ${names[a.merchantId]}` : ''}
            </div>
          </div>
          <span className="shrink-0 text-[12px] text-faint" title={fmtDateTime(a.at)}>{fmtRelative(a.at)}</span>
        </li>
      ))}
      {items.length === 0 && <li className="px-5 py-10 text-center text-[13px] text-muted">No activity recorded.</li>}
    </ul>
  )
}
