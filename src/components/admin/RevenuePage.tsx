import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { RevenueEntry } from '../../types'
import { useStore } from '../../store/AppStore'
import { bucketIndex, bucketsFor, inRange, rangeFromPreset, rangeLabel, type DateRange } from '../../lib/dates'
import { COLLECTED, platformSummary } from '../../lib/finance'
import { fmtAmount, fmtCompact, fmtDate, fmtKES, fmtPct } from '../../lib/format'
import { DataTable, type Column } from '../shared/DataTable'
import { DateRangeFilter } from '../shared/DateRangeFilter'
import { axisProps, ChartCard, ChartTooltip, Legend, useChartColors } from '../shared/charts'
import { Badge, Card, Notice, PageHeader, StatCard } from '../shared/ui'

export function RevenuePage() {
  const { data } = useStore()
  const c = useChartColors()
  const [range, setRange] = useState<DateRange>(rangeFromPreset('90d'))
  const s = useMemo(() => platformSummary(data.transactions, data.payouts, data.expenses, data.revenue, range), [data, range])
  const subs = data.revenue.filter((r) => r.category === 'Subscription' && inRange(r.date, range)).reduce((a, r) => a + r.amount, 0)
  
  const series = useMemo(() => {
    const b = bucketsFor(range)
    const rows = b.map((x) => ({ label: x.label, fees: 0, sms: 0, payout: 0, other: 0 }))
    for (const t of data.transactions) {
      if (!COLLECTED.includes(t.status) || !t.merchantId || !inRange(t.confirmedAt, range)) continue
      const i = bucketIndex(b, t.confirmedAt!)
      if (i >= 0) { rows[i].fees += t.fee; rows[i].sms += t.smsFee }
    }
    for (const p of data.payouts) if (p.status === 'Completed' && inRange(p.completedAt, range)) { const i = bucketIndex(b, p.completedAt!); if (i >= 0) rows[i].payout += p.fee }
    for (const r of data.revenue) if (inRange(r.date, range)) { const i = bucketIndex(b, r.date); if (i >= 0) rows[i].other += r.amount }
    return rows
  }, [data, range])

  const byMerchant = useMemo(() => data.merchants.map((m) => {
    const ms = platformSummary(data.transactions, data.payouts, [], data.revenue, range, m.id)
    return { id: m.id, name: m.name, rate: m.pricing.percentRate, volume: ms.processed, fees: ms.txFees, sms: ms.smsFees, payoutFees: ms.payoutFees, other: ms.otherRevenue, total: ms.revenue, providerCost: ms.providerCharges + ms.smsCosts + ms.payoutCosts }
  }), [data, range])
  type Row = (typeof byMerchant)[number]

  const cols: Column<Row>[] = [
    { key: 'n', header: 'Merchant', cell: (r) => r.name },
    { key: 'v', header: 'Volume processed', align: 'right', cell: (r) => fmtAmount(r.volume), sort: (r) => r.volume, hideBelow: 'md' },
    { key: 'f', header: 'Transaction fees', align: 'right', cell: (r) => fmtAmount(r.fees), sort: (r) => r.fees },
    { key: 's', header: 'SMS alerts', align: 'right', cell: (r) => fmtAmount(r.sms), sort: (r) => r.sms, hideBelow: 'lg' },
    { key: 'p', header: 'Payout fees', align: 'right', cell: (r) => fmtAmount(r.payoutFees), hideBelow: 'lg' },
    { key: 'o', header: 'Subscriptions & other', align: 'right', cell: (r) => fmtAmount(r.other), hideBelow: 'lg' },
    { key: 't', header: 'Total revenue', align: 'right', cell: (r) => <span className="font-medium">{fmtAmount(r.total)}</span>, sort: (r) => r.total },
    { key: 'tr', header: 'Take rate', align: 'right', cell: (r) => fmtPct(r.volume ? (r.total / r.volume) * 100 : 0, 2), hideBelow: 'sm' },
    { key: 'gm', header: 'Gross margin', align: 'right', cell: (r) => fmtAmount(r.total - r.providerCost), sort: (r) => r.total - r.providerCost, hideBelow: 'xl' },
  ]
  const entryCols: Column<RevenueEntry>[] = [
    { key: 'id', header: 'Entry', cell: (r) => <span className="mono">{r.id}</span> },
    { key: 'cat', header: 'Category', cell: (r) => <Badge tone="primary">{r.category}</Badge> },
    { key: 'd', header: 'Description', cell: (r) => r.description, hideBelow: 'md' },
    { key: 'm', header: 'Merchant', cell: (r) => data.merchants.find((m) => m.id === r.merchantId)?.name ?? '-', hideBelow: 'sm' },
    { key: 'a', header: 'Amount', align: 'right', cell: (r) => fmtAmount(r.amount) },
    { key: 'dt', header: 'Date', cell: (r) => <span className="text-muted">{fmtDate(r.date)}</span> },
  ]
  const legend = [{ label: 'Transaction fees', color: c.series[0] }, { label: 'SMS alerts', color: c.series[3] }, { label: 'Payout fees', color: c.series[1] }, { label: 'Subscriptions & other', color: c.series[2] }]

  return (
    <>
      <PageHeader title="Revenue" description={`Income earned by Oryne Network for ${rangeLabel(range).toLowerCase()}. Merchant collections are excluded - they are funds held on behalf of merchants.`} actions={<DateRangeFilter value={range} onChange={setRange} />} />
      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total revenue" value={fmtKES(s.revenue)} hint={`${fmtPct(s.processed ? (s.revenue / s.processed) * 100 : 0, 2)} of volume`} />
        <StatCard label="Transaction fees" value={fmtKES(s.txFees)} hint={`on ${fmtKES(s.processed)} processed`} />
        <StatCard label="SMS alerts" value={fmtKES(s.smsFees)} hint={`${s.smsCount.toLocaleString()} payments alerted`} />
        <StatCard label="Payouts & plans" value={fmtKES(s.payoutFees + subs)} hint={`${fmtKES(s.payoutFees)} payout fees · ${fmtKES(subs)} plans`} />
      </div>
      <ChartCard title="Revenue by source" subtitle={fmtKES(s.revenue)} legend={<Legend items={legend} />} height={260} className="mb-6" empty={s.revenue === 0 && 'Revenue appears as fees are earned on payments, SMS alerts and payouts.'}>
        <ResponsiveContainer>
          <BarChart data={series} margin={{ top: 4, right: 16, left: 4, bottom: 0 }} barCategoryGap="22%">
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" {...axisProps(c.axis)} interval={series.length > 16 ? Math.ceil(series.length / 8) - 1 : 0} />
            <YAxis {...axisProps(c.axis)} tickFormatter={fmtCompact} width={44} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: c.grid, opacity: 0.6 }} />
            <Bar dataKey="fees" name="Transaction fees" stackId="r" fill={c.series[0]} stroke={c.surface} strokeWidth={1} />
            <Bar dataKey="sms" name="SMS alerts" stackId="r" fill={c.series[3]} stroke={c.surface} strokeWidth={1} />
            <Bar dataKey="payout" name="Payout fees" stackId="r" fill={c.series[1]} stroke={c.surface} strokeWidth={1} />
            <Bar dataKey="other" name="Subscriptions & other" stackId="r" fill={c.series[2]} stroke={c.surface} strokeWidth={1} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
      <Card flush title="Revenue by merchant" className="mb-6"><DataTable columns={cols} rows={byMerchant} rowKey={(r) => r.id} /></Card>
      <Card flush title="Subscription and other revenue entries" subtitle="Non-transactional income recorded in the ledger">
        <DataTable columns={entryCols} rows={data.revenue.filter((r) => inRange(r.date, range))} rowKey={(r) => r.id} pageSize={10} />
      </Card>
      <div className="mt-6"><Notice>Revenue is recognised when a fee is earned: on payment confirmation for transaction and SMS alert fees, on completion for payout fees, and on the billing date for subscriptions.</Notice></div>
    </>
  )
}
