import { useMemo, useState } from 'react'
import { ArrowRight, Fingerprint, Link2, ShieldCheck, Hash } from 'lucide-react'
import type { CallbackEvent, Transaction } from '../../types'
import { useStore } from '../../store/AppStore'
import { deriveCallbacks, LIFECYCLE, lifecycleStage } from '../../lib/attribution'
import { fmtAmount, fmtDateTime, fmtInt, fmtKES, maskPhone } from '../../lib/format'
import { DAY } from '../../lib/dates'
import { DataTable, type Column } from '../shared/DataTable'
import { TransactionDrawer } from '../shared/TransactionDrawer'
import { Badge, Card, Mono, Notice, PageHeader, SearchInput, StatusBadge, Tabs } from '../shared/ui'

type View = 'all' | 'unmatched' | 'duplicates' | 'failed' | 'callbacks'

export function CollectionsPage() {
  const { data } = useStore()
  const [view, setView] = useState<View>('all')
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<Transaction | null>(null)
  const names = useMemo(() => Object.fromEntries(data.merchants.map((m) => [m.id, m.name])), [data.merchants])
  const callbacks = useMemo(() => deriveCallbacks(data.transactions.slice(0, 1500)), [data.transactions])

  // Lifecycle distribution over the last 7 days
  const stages = useMemo(() => {
    const counts = LIFECYCLE.map(() => 0)
    const lastPayout: Record<string, string> = {}
    for (const p of data.payouts) if (p.status === 'Completed' && p.completedAt && (!lastPayout[p.merchantId] || p.completedAt > lastPayout[p.merchantId])) lastPayout[p.merchantId] = p.completedAt
    const since = Date.now() - 7 * DAY
    let failed = 0
    for (const t of data.transactions) {
      if (new Date(t.initiatedAt).getTime() < since) continue
      if (t.status === 'Failed' || t.status === 'Cancelled') { failed++; continue }
      if (t.status === 'Refunded' || t.status === 'Reversed') continue
      const s = lifecycleStage(t, data.config.settlementHours, t.merchantId ? lastPayout[t.merchantId] ?? null : null)
      counts[s]++
    }
    return { counts, failed }
  }, [data.transactions, data.payouts, data.config.settlementHours])

  const unmatched = data.transactions.filter((t) => t.status === 'Unmatched')
  const dupTx = data.transactions.filter((t) => t.duplicateCallbacks > 0)

  const rows = useMemo(() => {
    const n = q.trim().toLowerCase()
    let base: Transaction[]
    switch (view) {
      case 'unmatched': base = unmatched; break
      case 'duplicates': base = dupTx; break
      case 'failed': base = data.transactions.filter((t) => t.status === 'Failed' || t.status === 'Cancelled'); break
      default: base = data.transactions
    }
    return n ? base.filter((t) => `${t.reference} ${t.mpesaReceipt} ${t.id} ${t.domain} ${t.merchantId ? names[t.merchantId] : ''} ${t.customerPhone}`.toLowerCase().includes(n)) : base
  }, [view, q, data.transactions, unmatched, dupTx, names])

  const cols: Column<Transaction>[] = [
    { key: 'm', header: 'Merchant', cell: (t) => t.merchantId ? names[t.merchantId] : <span className="text-warning">Unattributed</span>, sort: (t) => (t.merchantId ? names[t.merchantId] : '~') },
    { key: 'domain', header: 'Domain', cell: (t) => <span className="text-muted">{t.domain ?? '-'}</span>, hideBelow: 'xl' },
    { key: 'ref', header: 'Internal reference', cell: (t) => <Mono>{t.reference || <span className="text-faint">(none)</span>}</Mono> },
    { key: 'rcpt', header: 'M-Pesa receipt', cell: (t) => <Mono className="text-muted">{t.mpesaReceipt ?? '-'}</Mono>, hideBelow: 'md' },
    { key: 'phone', header: 'Customer', cell: (t) => <span className="mono text-muted">{maskPhone(t.customerPhone)}</span>, hideBelow: 'lg' },
    { key: 'amt', header: 'Amount', align: 'right', cell: (t) => fmtAmount(t.amount), sort: (t) => t.amount },
    { key: 'status', header: 'Collection', cell: (t) => <StatusBadge status={t.status} /> },
    { key: 'attr', header: 'Attribution', cell: (t) => <span className="flex items-center gap-1.5"><StatusBadge status={t.attribution} />{t.duplicateCallbacks > 0 && <Badge tone="info">+{t.duplicateCallbacks} dup</Badge>}</span>, hideBelow: 'sm' },
    { key: 'at', header: 'Timestamp', cell: (t) => <span className="text-muted">{fmtDateTime(t.confirmedAt ?? t.initiatedAt)}</span>, sort: (t) => t.initiatedAt, hideBelow: 'md' },
  ]

  const cbCols: Column<CallbackEvent>[] = [
    { key: 'at', header: 'Received', cell: (c) => <span className="text-muted">{fmtDateTime(c.receivedAt)}</span> },
    { key: 'rcpt', header: 'M-Pesa receipt', cell: (c) => <Mono>{c.mpesaReceipt ?? '-'}</Mono> },
    { key: 'ref', header: 'AccountReference', cell: (c) => <Mono className="text-muted">{c.reference || '(none)'}</Mono>, hideBelow: 'md' },
    { key: 'code', header: 'ResultCode', align: 'right', cell: (c) => (c.resultCode < 0 ? '-' : c.resultCode), hideBelow: 'sm' },
    { key: 'amt', header: 'Amount', align: 'right', cell: (c) => fmtAmount(c.amount) },
    { key: 'res', header: 'Outcome', cell: (c) => <StatusBadge status={c.result} /> },
    { key: 'tx', header: 'Mapped to', cell: (c) => c.merchantId ? <span><Mono className="text-muted">{c.transactionId}</Mono> · {names[c.merchantId]}</span> : <span className="text-warning">Suspense</span>, hideBelow: 'lg' },
  ]

  return (
    <>
      <PageHeader
        title="Payment collections & attribution"
        description="All merchants collect through one Oryne business Till. Each payment is matched to its merchant by the reference Oryne creates before sending the STK push."
      />

      <div className="mb-6">
        <Card title="How Oryne attributes a payment" subtitle="The identifiers that establish ownership">
          <ol className="space-y-3.5 text-[13px]">
            {[
              [Link2, 'Oryne-hosted checkout', 'Customers pay through checkout pages and payment links that Oryne runs for each merchant. Merchants integrate nothing.'],
              [Hash, 'Unique payment reference', 'Oryne issues a reference (e.g. ACM-7KQ2PX) and stores it against the Merchant ID before sending the STK push as AccountReference.'],
              [Fingerprint, 'Internal transaction record', 'The callback is matched on CheckoutRequestID and reference. The M-Pesa receipt is the idempotency key - duplicates are ignored.'],
              [ShieldCheck, 'Unmatched handling', 'Direct Till payments with no valid reference are held in suspense, excluded from every merchant balance until verified.'],
            ].map(([Icon, title, body], i) => {
              const I = Icon as typeof Link2
              return (
                <li key={i} className="flex gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[5px] border border-line bg-surface"><I size={14} strokeWidth={1.75} className="text-muted" /></span>
                  <div><div className="font-medium text-ink">{title as string}</div><div className="mt-0.5 leading-relaxed text-muted">{body as string}</div></div>
                </li>
              )
            })}
          </ol>
        </Card>
      </div>

      <Card title="Payment lifecycle" subtitle="Where payments initiated in the last 7 days currently sit" className="mb-6">
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-3 xl:grid-cols-6">
          {LIFECYCLE.map((s, i) => (
            <div key={s} className="relative bg-card px-4 py-3.5">
              <div className="flex items-center gap-1.5 text-[11.5px] font-medium text-muted"><span className="num">{i + 1}</span> {s}</div>
              <div className="num mt-1.5 text-[20px] font-semibold text-ink">{fmtInt(stages.counts[i])}</div>
              {i < LIFECYCLE.length - 1 && <ArrowRight size={14} className="absolute right-2 top-1/2 hidden -translate-y-1/2 text-faint xl:block" />}
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[12.5px] text-muted">
          <span><b className="num font-medium text-error">{fmtInt(stages.failed)}</b> failed or cancelled before confirmation</span>
          <span><b className="num font-medium text-warning">{fmtInt(unmatched.length)}</b> unmatched in suspense ({fmtKES(unmatched.reduce((s, t) => s + t.amount, 0))})</span>
          <span><b className="num font-medium text-ink">{fmtInt(dupTx.reduce((s, t) => s + t.duplicateCallbacks, 0))}</b> duplicate callbacks ignored</span>
        </div>
      </Card>

      <Tabs
        value={view}
        onChange={setView}
        tabs={[
          { value: 'all', label: 'All attributions' },
          { value: 'unmatched', label: 'Unmatched', count: unmatched.length },
          { value: 'duplicates', label: 'Duplicate callbacks', count: dupTx.length },
          { value: 'failed', label: 'Failed payments' },
          { value: 'callbacks', label: 'Raw callback log' },
        ]}
      />
      {view === 'unmatched' && unmatched.length > 0 && (
        <div className="mb-4"><Notice tone="warning" title="Resolution required">Open a payment to attribute it to a merchant after verifying the payer with the merchant. Attribution applies the merchant's fee and credits their ledger.</Notice></div>
      )}
      {view === 'duplicates' && (
        <div className="mb-4"><Notice>M-Pesa may deliver the same callback more than once. Oryne processes the first and ignores repeats with the same receipt number, so merchants are never credited twice.</Notice></div>
      )}
      <Card flush>
        {view === 'callbacks' ? (
          <DataTable columns={cbCols} rows={callbacks} rowKey={(c) => c.id} pageSize={15} dense emptyTitle="No callbacks received yet" emptyDescription="M-Pesa confirmations appear here as payments complete." />
        ) : (
          <>
            <div className="border-b border-line-soft px-5 py-3"><SearchInput value={q} onChange={setQ} placeholder="Search reference, receipt, merchant, phone" className="sm:w-[340px]" /></div>
            <DataTable columns={cols} rows={rows} rowKey={(t) => t.id} onRowClick={setSelected} pageSize={15} emptyTitle="Nothing here" emptyDescription="Payments in this state will be listed here." />
          </>
        )}
      </Card>
      <TransactionDrawer tx={selected} onClose={() => setSelected(null)} mode="admin" />
    </>
  )
}

