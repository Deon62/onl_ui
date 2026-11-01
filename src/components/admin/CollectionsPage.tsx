import { useMemo, useState } from 'react'
import { ArrowRight, Check, Copy, Fingerprint, Link2, Play, Radio, ShieldCheck, Hash } from 'lucide-react'
import type { CallbackEvent, Transaction } from '../../types'
import { useActions, useStore } from '../../store/AppStore'
import { deriveCallbacks, LIFECYCLE, lifecycleStage } from '../../lib/attribution'
import { fmtAmount, fmtDateTime, fmtInt, fmtKES, fmtTime, maskPhone } from '../../lib/format'
import { DAY } from '../../lib/dates'
import { DataTable, type Column } from '../shared/DataTable'
import { TransactionDrawer } from '../shared/TransactionDrawer'
import { Badge, Button, Card, cx, Field, Input, Mono, Notice, PageHeader, SearchInput, Select, StatusBadge, Tabs, Toggle } from '../shared/ui'
import { useChartColors } from '../shared/charts'

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

      <div className="mb-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
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
        <AttributionSimulator />
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

/** Demonstrates two merchants collecting through the same Till at the same moment. */
function AttributionSimulator() {
  const { data } = useStore()
  const actions = useActions()
  const c = useChartColors()
  const active = data.merchants.filter((m) => m.status === 'Active')
  const [a, setA] = useState({ merchantId: active[0]?.id ?? '', amount: '5000' })
  const [b, setB] = useState({ merchantId: active[1]?.id ?? '', amount: '2500' })
  const [dup, setDup] = useState(true)
  const [failSecond, setFailSecond] = useState(false)
  const [ids, setIds] = useState<string[]>([])
  const txs = ids.map((id) => data.transactions.find((t) => t.id === id)).filter(Boolean) as Transaction[]

  const run = () => {
    const first = actions.simulatePayment(a.merchantId, Number(a.amount), '254712' + String(Math.floor(100000 + Math.random() * 899999)), 'success', dup)
    const second = actions.simulatePayment(b.merchantId, Number(b.amount), '254798' + String(Math.floor(100000 + Math.random() * 899999)), failSecond ? 'failure' : 'success')
    setIds([first, second])
  }
  const valid = a.merchantId && b.merchantId && Number(a.amount) > 0 && Number(b.amount) > 0

  return (
    <Card
      title="Concurrent payment simulator"
      subtitle={`Two merchants, one Till (${data.config.tillNumberMasked}). Runs locally - no STK push is sent.`}
      actions={<Badge tone="warning" icon={Radio}>Simulation</Badge>}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {[[a, setA, 'Payment A'], [b, setB, 'Payment B']].map(([v, set, label]) => {
          const val = v as typeof a
          const setter = set as typeof setA
          return (
            <div key={label as string} className="rounded-md border border-line bg-surface p-3">
              <div className="mb-2 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted">{label as string}</div>
              <div className="space-y-2.5">
                <Select value={val.merchantId} onChange={(e) => setter({ ...val, merchantId: e.target.value })} aria-label={`${label} merchant`}>
                  {active.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </Select>
                <Field label="Amount (KES)"><Input type="number" min={1} value={val.amount} onChange={(e) => setter({ ...val, amount: e.target.value })} /></Field>
              </div>
            </div>
          )
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12.5px] text-muted">
        <label className="flex items-center gap-2"><Toggle checked={dup} onChange={setDup} label="Duplicate callback" /> Send a duplicate callback for A</label>
        <label className="flex items-center gap-2"><Toggle checked={failSecond} onChange={setFailSecond} label="Fail payment B" /> Payment B fails</label>
        <Button variant="primary" icon={Play} disabled={!valid} onClick={run} className="ml-auto">Initiate both</Button>
      </div>

      {txs.length > 0 && (
        <div className="mt-4 space-y-2 border-t border-line-soft pt-4">
          {txs.map((t) => {
            const m = data.merchants.find((x) => x.id === t.merchantId)
            const stage = t.status === 'Initiated' ? 0 : t.status === 'Pending' ? 1 : t.status === 'Successful' ? 3 : -1
            return (
              <div key={t.id} className="rounded-md border border-line bg-surface px-3.5 py-3 text-[12.5px]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2 font-medium text-ink">
                    <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: c.merchantColor(t.merchantId) }} />
                    {m?.name} · {fmtKES(t.amount)}
                  </span>
                  <StatusBadge status={t.status} />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1">
                  {['Initiated', 'STK sent', 'Callback', 'Credited'].map((s, i) => (
                    <span key={s} className="flex items-center gap-1">
                      <span className={cx('inline-flex items-center gap-1 rounded-[4px] px-1.5 py-0.5 text-[11px]', stage >= i ? 'bg-success-soft text-success' : stage === -1 && i >= 2 ? 'bg-error-soft text-error' : 'bg-subtle text-faint')}>
                        {stage >= i && <Check size={10} strokeWidth={3} />}{s}
                      </span>
                      {i < 3 && <ArrowRight size={11} className="text-faint" />}
                    </span>
                  ))}
                </div>
                <div className="mt-2 grid gap-x-4 gap-y-0.5 text-muted sm:grid-cols-2">
                  <span>Reference <Mono>{t.reference}</Mono></span>
                  <span>Receipt <Mono>{t.mpesaReceipt ?? '...'}</Mono></span>
                  <span>Origin {t.domain} · {m?.id}</span>
                  <span>{t.confirmedAt ? `Confirmed ${fmtTime(t.confirmedAt)}` : `Initiated ${fmtTime(t.initiatedAt)}`}{t.duplicateCallbacks ? ' · 1 duplicate ignored' : ''}</span>
                </div>
              </div>
            )
          })}
          <p className="flex items-center gap-1.5 pt-1 text-[12px] text-muted"><Copy size={12} /> Same Till, independent references - each payment lands only in its own merchant's ledger.</p>
        </div>
      )}
    </Card>
  )
}
