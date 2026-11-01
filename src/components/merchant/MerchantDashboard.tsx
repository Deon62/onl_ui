import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowRight, Banknote, Clock, Coins, Receipt, Wallet } from 'lucide-react'
import { useStore } from '../../store/AppStore'
import { useMerchantLedger, useMerchantScope } from '../../store/selectors'
import { bucketIndex, bucketsFor, inRange, rangeFromPreset, rangeLabel, type DateRange } from '../../lib/dates'
import { COLLECTED } from '../../lib/finance'
import { fmtCompact, fmtInt, fmtKES, fmtPct } from '../../lib/format'
import { DateRangeFilter } from '../shared/DateRangeFilter'
import { axisProps, ChartCard, ChartTooltip, Legend, useChartColors } from '../shared/charts'
import { BalanceStatement } from '../shared/FinancePanels'
import { TransactionsExplorer } from '../shared/TransactionsExplorer'
import { Button, Card, Notice, PageHeader, StatCard } from '../shared/ui'
import { GettingStarted } from '../shared/GettingStarted'
import { PayoutRequestModal } from '../shared/PayoutRequestModal'

export function MerchantDashboard() {
  const { data } = useStore()
  const { merchant } = useMerchantScope()
  const ledger = useMerchantLedger(merchant?.id ?? null)
  const c = useChartColors()
  const [payoutOpen, setPayoutOpen] = useState(false)
  const [range, setRange] = useState<DateRange>(rangeFromPreset('30d'))

  const mtx = useMemo(() => data.transactions.filter((t) => t.merchantId === merchant?.id), [data.transactions, merchant?.id])

  const charts = useMemo(() => {
    const b = bucketsFor(range)
    const rows = b.map((x) => ({ label: x.label, collections: 0, success: 0, failed: 0, payouts: 0 }))
    const channels: Record<string, number> = {}
    let ok = 0, bad = 0, vol = 0
    for (const t of mtx) {
      const when = t.confirmedAt ?? t.initiatedAt
      if (!inRange(when, range)) continue
      const i = bucketIndex(b, when)
      if (COLLECTED.includes(t.status)) {
        ok++; vol += t.amount
        channels[t.channel] = (channels[t.channel] ?? 0) + t.amount
        if (i >= 0) { rows[i].collections += t.amount; rows[i].success++ }
      } else if (t.status === 'Failed' || t.status === 'Cancelled') {
        bad++
        if (i >= 0) rows[i].failed++
      }
    }
    for (const p of data.payouts) {
      if (p.merchantId !== merchant?.id || p.status !== 'Completed' || !inRange(p.completedAt, range)) continue
      const i = bucketIndex(b, p.completedAt!)
      if (i >= 0) rows[i].payouts += p.netAmount
    }
    return { rows, ok, bad, vol, channels: Object.entries(channels).sort((a, b2) => b2[1] - a[1]) }
  }, [mtx, data.payouts, range, merchant?.id])

  if (!merchant || !ledger) return null
  const hasPayments = data.transactions.some((t) => t.merchantId === merchant.id && t.status === 'Successful')
  const xInterval = charts.rows.length > 16 ? Math.ceil(charts.rows.length / 8) - 1 : 0
  return (
    <>
      <PageHeader title="Dashboard" actions={<Button variant="primary" icon={Banknote} onClick={() => setPayoutOpen(true)} disabled={merchant.status !== 'Active'}>Request payout</Button>} />
      {!hasPayments && (
        <GettingStarted
          id={`merchant:${merchant.id}:${data.generatedAt}`}
          title={`Welcome to Oryne, ${merchant.contactName.split(' ')[0]}`}
          steps={[
            { title: 'Complete your business profile', description: 'Contact phone and industry, used on receipts and for support.', to: '/merchant/profile', cta: 'Complete', done: !!merchant.phone && !!merchant.industry },
            { title: 'Add your settlement account', description: 'The M-Pesa number, Till, Paybill or bank account your payouts go to.', to: '/merchant/settlement', cta: 'Add account', done: !!merchant.payoutDestination },
            { title: 'Create a payment link', description: 'Share it on WhatsApp, email or social media to get paid without a website.', to: '/merchant/payment-links', cta: 'Create link', done: data.paymentLinks.some((l) => l.merchantId === merchant.id) },
            { title: 'Turn on SMS alerts', description: 'Get a text every time a customer pays you.', to: '/merchant/sms', cta: 'Set up', done: merchant.smsAlerts.enabled, optional: true },
            { title: 'Receive your first payment', description: 'Oryne is connecting M-Pesa checkout to your website. We will notify you when it is live.', done: false },
          ]}
        />
      )}
      {merchant.status !== 'Active' && <div className="mb-6"><Notice tone="error" title={`Account ${merchant.status.toLowerCase()}`}>Collections and payouts are paused.</Notice></div>}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Total collections" icon={Coins} value={fmtKES(ledger.grossCollections)} />
        <StatCard label="Available balance" icon={Wallet} value={fmtKES(ledger.available)} accent="var(--success)" />
        <StatCard label="Pending balance" icon={Clock} value={fmtKES(ledger.pendingSettlement)} />
        <StatCard label="Total paid out" icon={Banknote} value={fmtKES(ledger.paidOutNet)} />
        <StatCard label="Transaction fees" icon={Receipt} value={fmtKES(ledger.fees)} />
      </div>

      <div className="mb-6 grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <ChartCard
          title="Collections over time"
          empty={charts.ok + charts.bad === 0 && 'Your collections will appear here after your first payment.'}
          subtitle={`${fmtKES(charts.vol)} · ${rangeLabel(range)}`}
          actions={<DateRangeFilter value={range} onChange={setRange} />}
          height={280}
        >
          <ResponsiveContainer>
            <AreaChart data={charts.rows} margin={{ top: 8, right: 16, left: 4, bottom: 0 }}>
              <defs>
                <linearGradient id="mcol" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={c.primary} stopOpacity={0.14} />
                  <stop offset="100%" stopColor={c.primary} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" {...axisProps(c.axis)} interval={xInterval} />
              <YAxis {...axisProps(c.axis)} tickFormatter={fmtCompact} width={48} />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: c.baseline }} />
              <Area type="monotone" dataKey="collections" name="Collections" stroke={c.primary} strokeWidth={2} fill="url(#mcol)" activeDot={{ r: 4, strokeWidth: 2, stroke: c.surface }} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
        <Card title="Account balance" subtitle="How your available balance is calculated" actions={<Link to="/merchant/payouts" className="inline-flex items-center gap-1 text-[12.5px] font-medium text-primary hover:underline">Payouts <ArrowRight size={13} /></Link>}>
          <BalanceStatement ledger={ledger} />
        </Card>
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <ChartCard
          title="Successful vs failed"
          empty={charts.ok + charts.bad === 0 && 'No payment attempts in this period.'}
          subtitle={`${fmtPct(charts.ok + charts.bad ? (charts.ok / (charts.ok + charts.bad)) * 100 : 0)} success rate`}
          legend={<Legend items={[{ label: 'Successful', color: c.success, value: fmtInt(charts.ok) }, { label: 'Failed', color: c.error, value: fmtInt(charts.bad) }]} />}
          height={190}
        >
          <ResponsiveContainer>
            <BarChart data={charts.rows} margin={{ top: 4, right: 12, left: -12, bottom: 0 }} barCategoryGap="20%">
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" {...axisProps(c.axis)} interval={xInterval} />
              <YAxis {...axisProps(c.axis)} allowDecimals={false} width={36} />
              <Tooltip content={<ChartTooltip money={false} />} cursor={{ fill: c.grid, opacity: 0.6 }} />
              <Bar dataKey="success" name="Successful" stackId="s" fill={c.success} stroke={c.surface} strokeWidth={1} />
              <Bar dataKey="failed" name="Failed" stackId="s" fill={c.error} stroke={c.surface} strokeWidth={1} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Payment methods" subtitle="Share of collections by channel" height={190} empty={charts.channels.length === 0 && 'No collections in this period.'}>
          <div className="flex h-full flex-col justify-center gap-4 px-3">
            {charts.channels.map(([ch, v], i) => (
              <div key={ch}>
                <div className="mb-1.5 flex justify-between text-[12.5px]"><span>M-Pesa · {ch}</span><span className="num text-muted">{fmtKES(v)} <span className="text-ink">{fmtPct((v / charts.vol) * 100)}</span></span></div>
                <div className="h-1.5 overflow-hidden rounded-full bg-subtle"><div className="h-full rounded-full" style={{ width: `${(v / charts.vol) * 100}%`, background: c.series[i] }} /></div>
              </div>
            ))}
          </div>
        </ChartCard>
        <ChartCard title="Payout history" subtitle={`${fmtKES(charts.rows.reduce((s, r) => s + r.payouts, 0))} received`} height={190} empty={charts.rows.every((r) => !r.payouts) && 'Payouts you receive will appear here.'}>
          <ResponsiveContainer>
            <BarChart data={charts.rows} margin={{ top: 4, right: 12, left: -4, bottom: 0 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" {...axisProps(c.axis)} interval={xInterval} />
              <YAxis {...axisProps(c.axis)} tickFormatter={fmtCompact} width={40} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: c.grid, opacity: 0.6 }} />
              <Bar dataKey="payouts" name="Paid out" fill={c.series[2]} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <TransactionsExplorer mode="merchant" merchantId={merchant.id} title="Recent transactions" limit={5} viewAllTo="/merchant/transactions" />
      <PayoutRequestModal open={payoutOpen} merchant={merchant} onClose={() => setPayoutOpen(false)} />
    </>
  )
}
