import { useMemo, useState } from 'react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Banknote, Coins, Landmark, Receipt, TrendingUp, Wallet } from 'lucide-react'
import { useStore } from '../../store/AppStore'
import { useAllLedgers } from '../../store/selectors'
import { bucketIndex, bucketsFor, inRange, previousRange, rangeFromPreset, type DateRange } from '../../lib/dates'
import { COLLECTED, isReturned, platformSummary } from '../../lib/finance'
import { fmtCompact, fmtInt, fmtKES, fmtPct } from '../../lib/format'
import { DateRangeFilter } from '../shared/DateRangeFilter'
import { axisProps, ChartCard, ChartTooltip, Legend, useChartColors } from '../shared/charts'
import { TransactionsExplorer } from '../shared/TransactionsExplorer'
import { PageHeader, StatCard } from '../shared/ui'
import { GettingStarted } from '../shared/GettingStarted'

const pct = (cur: number, prev: number) => (prev > 0 ? ((cur - prev) / prev) * 100 : null)

export function AdminDashboard() {
  const { data } = useStore()
  const [range, setRange] = useState<DateRange>(rangeFromPreset('30d'))
  const c = useChartColors()
  const ledgers = useAllLedgers()

  const summary = useMemo(() => platformSummary(data.transactions, data.payouts, data.expenses, data.revenue, range), [data, range])
  const prev = useMemo(() => platformSummary(data.transactions, data.payouts, data.expenses, data.revenue, previousRange(range)), [data, range])
  const balances = useMemo(() => {
    const ls = Object.values(ledgers)
    return {
      owed: ls.reduce((s, l) => s + l.owed, 0),
      available: ls.reduce((s, l) => s + l.available, 0),
      pending: ls.reduce((s, l) => s + l.pendingSettlement, 0),
      inProgress: ls.reduce((s, l) => s + l.payoutsInProgress, 0),
    }
  }, [ledgers])

  const series = useMemo(() => {
    const buckets = bucketsFor(range)
    const rows = buckets.map((b) => ({
      label: b.label, volume: 0, count: 0, success: 0, failed: 0, revenue: 0, costs: 0,
      ...Object.fromEntries(data.merchants.map((m) => [`p_${m.id}`, 0])),
    })) as Record<string, number | string>[]
    const add = (i: number, k: string, v: number) => { if (i >= 0) rows[i][k] = (rows[i][k] as number) + v }
    for (const t of data.transactions) {
      const when = t.confirmedAt ?? t.initiatedAt
      if (!inRange(when, range)) continue
      const i = bucketIndex(buckets, when)
      add(i, 'count', 1)
      if (t.status === 'Successful' || isReturned(t)) { add(i, 'success', 1); add(i, 'volume', t.amount); add(i, 'revenue', t.fee + t.smsFee); add(i, 'costs', t.providerCharge + t.smsCost) }
      else if (t.status === 'Unmatched') { add(i, 'volume', t.amount); add(i, 'costs', t.providerCharge) }
      else if (t.status === 'Failed' || t.status === 'Cancelled') add(i, 'failed', 1)
    }
    for (const p of data.payouts) {
      if (p.status !== 'Completed' || !inRange(p.completedAt, range)) continue
      const i = bucketIndex(buckets, p.completedAt!)
      add(i, `p_${p.merchantId}`, p.netAmount)
      add(i, 'revenue', p.fee)
      add(i, 'costs', p.providerCost)
    }
    for (const e of data.expenses) if (inRange(e.date, range)) add(bucketIndex(buckets, e.date), 'costs', e.amount)
    for (const r of data.revenue) if (inRange(r.date, range)) add(bucketIndex(buckets, r.date), 'revenue', r.amount)
    return rows
  }, [data, range])

  const distribution = useMemo(() => {
    const totals = data.merchants.map((m) => {
      let v = 0, n = 0
      for (const t of data.transactions) {
        if (t.merchantId === m.id && COLLECTED.includes(t.status) && inRange(t.confirmedAt, range)) { v += t.amount; n++ }
      }
      return { id: m.id, name: m.name, value: v, count: n }
    })
    const total = totals.reduce((s, x) => s + x.value, 0)
    return totals.sort((a, b) => b.value - a.value).map((x) => ({ ...x, share: total ? (x.value / total) * 100 : 0 }))
  }, [data, range])

  const successRate = summary.successCount + summary.failedCount > 0 ? (summary.successCount / (summary.successCount + summary.failedCount)) * 100 : 0
  const xInterval = series.length > 16 ? Math.ceil(series.length / 8) - 1 : 0

  return (
    <>
      <PageHeader
        title="Platform overview"
        actions={<DateRangeFilter value={range} onChange={setRange} />}
      />
      {data.transactions.length === 0 && (
        <GettingStarted
          id={`admin:${data.generatedAt}`}
          title="Set up your platform"
          steps={[
            { title: 'Onboard your first merchant', description: 'Create the merchant account, or approve an access request.', to: '/admin/merchants', cta: 'Merchants', done: data.merchants.length > 0 },
            { title: 'Confirm fees and charges', description: 'Default pricing, provider costs, payout and SMS fees.', to: '/admin/fees', cta: 'Review' },
            { title: 'Record operating expenses', description: 'So revenue, costs and net profit are accurate from day one.', to: '/admin/expenses', cta: 'Add expense', done: data.expenses.length > 0 },
            { title: 'Collect the first payment', description: 'Payments appear here as soon as a merchant checkout goes live on the Till.', done: false },
          ]}
        />
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Total processed" icon={Coins} value={fmtKES(summary.processed)} delta={pct(summary.processed, prev.processed)} />
        <StatCard label="Total collected" icon={Landmark} value={fmtKES(summary.collected)} delta={pct(summary.collected, prev.collected)} />
        <StatCard label="Merchant balances" icon={Wallet} value={fmtKES(balances.owed)} />
        <StatCard label="Oryne revenue" icon={TrendingUp} value={fmtKES(summary.revenue)} delta={pct(summary.revenue, prev.revenue)} />
        <StatCard label="Operating costs" icon={Receipt} value={fmtKES(summary.operatingCosts)} delta={pct(summary.operatingCosts, prev.operatingCosts)} deltaGood={false} />
        <StatCard label="Net profit" icon={Banknote} value={fmtKES(summary.netProfit)} accent={summary.netProfit < 0 ? 'var(--error)' : undefined} delta={pct(summary.netProfit, prev.netProfit)} />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <ChartCard
          className="xl:col-span-2"
          title="Payment volume"
          empty={summary.attemptCount === 0 && 'Payments will appear here once merchants start collecting.'}
          subtitle={`Gross payments received on the collection Till · ${fmtKES(summary.processed + summary.suspense)}`}
          height={260}
        >
          <ResponsiveContainer>
            <AreaChart data={series} margin={{ top: 8, right: 16, left: 4, bottom: 0 }}>
              <defs>
                <linearGradient id="vol" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={c.primary} stopOpacity={0.14} />
                  <stop offset="100%" stopColor={c.primary} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="0" />
              <XAxis dataKey="label" {...axisProps(c.axis)} interval={xInterval} />
              <YAxis {...axisProps(c.axis)} tickFormatter={fmtCompact} width={48} />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: c.baseline }} />
              <Area type="monotone" dataKey="volume" name="Volume" stroke={c.primary} strokeWidth={2} fill="url(#vol)" activeDot={{ r: 4, strokeWidth: 2, stroke: c.surface }} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Merchant collection distribution" subtitle="Share of attributed collections" height={260} empty={distribution.every((d) => d.value === 0) && (data.merchants.length ? 'No merchant has collected in this period.' : 'Add a merchant to start collecting.')}>
          <div className="flex h-full flex-col justify-center gap-3.5 px-3">
            {distribution.map((d) => (
              <div key={d.id}>
                <div className="mb-1.5 flex items-baseline justify-between gap-2 text-[12.5px]">
                  <span className="flex items-center gap-1.5 text-ink"><span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: c.merchantColor(d.id) }} />{d.name}</span>
                  <span className="num text-muted">{fmtKES(d.value)} <span className="ml-1 text-ink">{d.share.toFixed(1)}%</span></span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-subtle">
                  <div className="h-full rounded-full" style={{ width: `${d.share}%`, background: c.merchantColor(d.id) }} />
                </div>
              </div>
            ))}
          </div>
        </ChartCard>

        <ChartCard title="Transaction count" subtitle={`${fmtInt(summary.attemptCount)} payment attempts`} height={220} empty={summary.attemptCount === 0 && 'No payment attempts in this period.'}>
          <ResponsiveContainer>
            <LineChart data={series} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" {...axisProps(c.axis)} interval={xInterval} />
              <YAxis {...axisProps(c.axis)} allowDecimals={false} width={40} />
              <Tooltip content={<ChartTooltip money={false} />} cursor={{ stroke: c.baseline }} />
              <Line type="monotone" dataKey="count" name="Attempts" stroke={c.primary} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: c.surface }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Successful vs failed"
          empty={summary.attemptCount === 0 && 'No payment attempts in this period.'}
          subtitle={`${fmtPct(successRate)} success rate`}
          legend={<Legend items={[{ label: 'Successful', color: c.success, value: fmtInt(summary.successCount) }, { label: 'Failed or cancelled', color: c.error, value: fmtInt(summary.failedCount) }]} />}
          height={200}
        >
          <ResponsiveContainer>
            <BarChart data={series} margin={{ top: 4, right: 16, left: -8, bottom: 0 }} barCategoryGap="20%">
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" {...axisProps(c.axis)} interval={xInterval} />
              <YAxis {...axisProps(c.axis)} allowDecimals={false} width={40} />
              <Tooltip content={<ChartTooltip money={false} />} cursor={{ fill: c.grid, opacity: 0.6 }} />
              <Bar dataKey="success" name="Successful" stackId="s" fill={c.success} stroke={c.surface} strokeWidth={1} />
              <Bar dataKey="failed" name="Failed or cancelled" stackId="s" fill={c.error} stroke={c.surface} strokeWidth={1} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Revenue vs operating costs"
          empty={summary.revenue === 0 && summary.operatingCosts === 0 && 'Revenue and costs appear once payments and expenses are recorded.'}
          subtitle="Oryne income against provider charges and expenses"
          legend={<Legend items={[{ label: 'Revenue', color: c.series[2], value: fmtKES(summary.revenue) }, { label: 'Operating costs', color: c.series[1], value: fmtKES(summary.operatingCosts) }]} />}
          height={200}
        >
          <ResponsiveContainer>
            <BarChart data={series} margin={{ top: 4, right: 16, left: 0, bottom: 0 }} barGap={2} barCategoryGap="25%">
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" {...axisProps(c.axis)} interval={xInterval} />
              <YAxis {...axisProps(c.axis)} tickFormatter={fmtCompact} width={44} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: c.grid, opacity: 0.6 }} />
              <Bar dataKey="revenue" name="Revenue" fill={c.series[2]} radius={[3, 3, 0, 0]} />
              <Bar dataKey="costs" name="Operating costs" fill={c.series[1]} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          className="xl:col-span-3"
          title="Merchant payout trends"
          empty={summary.payoutsCompletedNet === 0 && 'No payouts were completed in this period.'}
          subtitle={`Completed payouts sent to merchants · ${fmtKES(summary.payoutsCompletedNet)}`}
          legend={<Legend items={data.merchants.map((m) => ({ label: m.name, color: c.merchantColor(m.id) }))} />}
          height={240}
        >
          <ResponsiveContainer>
            <BarChart data={series} margin={{ top: 4, right: 16, left: 4, bottom: 0 }} barCategoryGap="22%">
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" {...axisProps(c.axis)} interval={xInterval} />
              <YAxis {...axisProps(c.axis)} tickFormatter={fmtCompact} width={48} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: c.grid, opacity: 0.6 }} />
              {data.merchants.map((m, i) => (
                <Bar key={m.id} dataKey={`p_${m.id}`} name={m.name} stackId="p" fill={c.merchantColor(m.id)} stroke={c.surface} strokeWidth={1} radius={i === data.merchants.length - 1 ? [3, 3, 0, 0] : undefined} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="mt-6">
        <TransactionsExplorer mode="admin" title="Recent transactions" limit={5} viewAllTo="/admin/transactions" />
      </div>
    </>
  )
}
