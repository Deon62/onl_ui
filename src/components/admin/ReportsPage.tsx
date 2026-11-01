import { useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import type { Transaction } from '../../types'
import { useStore } from '../../store/AppStore'
import { endOfDay, inRange, rangeFromPreset, rangeLabel, type DateRange } from '../../lib/dates'
import { allocatedCost, platformSummary } from '../../lib/finance'
import { exportCsv } from '../../lib/csv'
import { fmtAmount, fmtDateTime, fmtKES, fmtPct } from '../../lib/format'
import { DataTable, type Column } from '../shared/DataTable'
import { DateRangeFilter } from '../shared/DateRangeFilter'
import { Button, Card, cx, Mono, Notice, PageHeader, StatCard, Statement } from '../shared/ui'

export function ReportsPage() {
  const { data } = useStore()
  const [range, setRange] = useState<DateRange>(rangeFromPreset('30d'))
  const s = useMemo(() => platformSummary(data.transactions, data.payouts, data.expenses, data.revenue, range), [data, range])
  const alloc = allocatedCost(data.config.costs)
  const names = Object.fromEntries(data.merchants.map((m) => [m.id, m.name]))

  const months = useMemo(() => {
    const now = new Date()
    return [4, 3, 2, 1, 0].map((back) => {
      const from = new Date(now.getFullYear(), now.getMonth() - back, 1)
      const to = back === 0 ? endOfDay(now) : endOfDay(new Date(now.getFullYear(), now.getMonth() - back + 1, 0))
      const r: DateRange = { preset: 'custom', from, to }
      return { label: from.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) + (back === 0 ? ' (MTD)' : ''), s: platformSummary(data.transactions, data.payouts, data.expenses, data.revenue, r) }
    })
  }, [data])

  const txRows = useMemo(() => data.transactions.filter((t) => t.status === 'Successful' && t.merchantId && inRange(t.confirmedAt, range)), [data.transactions, range])
  const cols: Column<Transaction>[] = [
    { key: 'id', header: 'Transaction', cell: (t) => <div className="leading-tight"><Mono>{t.id}</Mono><div className="text-[11.5px] text-muted">{names[t.merchantId!]} · {fmtDateTime(t.confirmedAt!)}</div></div> },
    { key: 'a', header: 'Amount', align: 'right', cell: (t) => fmtAmount(t.amount), sort: (t) => t.amount },
    { key: 'f', header: 'Oryne fee', align: 'right', cell: (t) => fmtAmount(t.fee), sort: (t) => t.fee },
    { key: 'p', header: 'Provider', align: 'right', cell: (t) => `(${fmtAmount(t.providerCharge)})`, hideBelow: 'sm' },
    { key: 'g', header: 'Gross margin', align: 'right', cell: (t) => fmtAmount(t.fee - t.providerCharge), hideBelow: 'md' },
    { key: 'al', header: 'Allocated', align: 'right', cell: () => `(${fmtAmount(alloc)})`, hideBelow: 'lg' },
    { key: 'c', header: 'Contribution', align: 'right', sort: (t) => t.fee - t.providerCharge - alloc, cell: (t) => { const v = t.fee - t.providerCharge - alloc; return <span className={cx('font-medium', v < 0 && 'text-error')}>{fmtAmount(v)}</span> } },
    { key: 'm', header: 'Margin', align: 'right', cell: (t) => fmtPct(((t.fee - t.providerCharge - alloc) / t.fee) * 100), hideBelow: 'lg' },
  ]
  const lossMaking = txRows.filter((t) => t.fee - t.providerCharge - alloc < 0).length

  const plRows: [string, (x: typeof s) => number, 'add' | 'less' | 'sub' | 'total' | 'memo'][] = [
    ['Gross merchant collection volume (memo)', (x) => x.processed, 'memo'],
    ['Payouts to merchants (memo)', (x) => x.payoutsCompletedNet, 'memo'],
    ['Transaction fees', (x) => x.txFees, 'add'],
    ['SMS alert fees', (x) => x.smsFees, 'add'],
    ['Payout fees', (x) => x.payoutFees, 'add'],
    ['Subscriptions & other', (x) => x.otherRevenue, 'add'],
    ['Total revenue', (x) => x.revenue, 'sub'],
    ['Provider transaction charges', (x) => x.providerCharges, 'less'],
    ['SMS sending costs', (x) => x.smsCosts, 'less'],
    ['Payout transfer costs', (x) => x.payoutCosts, 'less'],
    ['Gross margin', (x) => x.grossMargin, 'sub'],
    ['Operating expenses', (x) => x.expenses, 'less'],
    ['Net operating profit', (x) => x.netProfit, 'total'],
  ]

  const exportPL = () => exportCsv('oryne-profit-and-loss.csv', plRows, [
    { header: 'Line', value: (r) => r[0] },
    ...months.map((m) => ({ header: m.label, value: (r: (typeof plRows)[number]) => (r[2] === 'less' ? -r[1](m.s) : r[1](m.s)).toFixed(2) })),
  ])

  return (
    <>
      <PageHeader title="Financial reports" description={`Profitability of Oryne Network for ${rangeLabel(range).toLowerCase()}. Merchant collections and payouts are shown as memo items only.`} actions={<DateRangeFilter value={range} onChange={setRange} />} />
      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Gross collection volume" value={fmtKES(s.processed)} hint="memo - merchant funds" />
        <StatCard label="Total Oryne fees" value={fmtKES(s.txFees + s.smsFees + s.payoutFees)} hint={`${fmtPct(s.processed ? ((s.txFees + s.smsFees + s.payoutFees) / s.processed) * 100 : 0, 2)} of volume`} />
        <StatCard label="Gross margin" value={fmtKES(s.grossMargin)} hint={`${fmtPct(s.revenue ? (s.grossMargin / s.revenue) * 100 : 0)} of revenue`} />
        <StatCard label="Net operating profit" value={fmtKES(s.netProfit)} accent={s.netProfit < 0 ? 'var(--error)' : undefined} hint={`${fmtPct(s.revenue ? (s.netProfit / s.revenue) * 100 : 0)} of revenue`} />
      </div>

      <div className="mb-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <Card title="Profitability statement" subtitle={rangeLabel(range)}>
          <Statement lines={[
            { label: 'Gross merchant collection volume', value: fmtKES(s.processed), kind: 'muted', note: 'Memo - held for merchants, not revenue' },
            { label: 'Total payouts to merchants', value: fmtKES(s.payoutsCompletedNet), kind: 'muted', note: 'Memo - settlement of merchant funds' },
            { label: 'Oryne transaction fees', value: fmtKES(s.txFees) },
            { label: 'SMS alert fees', value: fmtKES(s.smsFees) },
            { label: 'Payout fees', value: fmtKES(s.payoutFees) },
            { label: 'Subscriptions and other revenue', value: fmtKES(s.otherRevenue) },
            { label: 'Total revenue', value: fmtKES(s.revenue), kind: 'subtotal' },
            { label: 'Provider transaction charges', value: fmtKES(s.providerCharges), kind: 'less' },
            { label: 'SMS sending costs', value: fmtKES(s.smsCosts), kind: 'less' },
            { label: 'Payout transfer costs', value: fmtKES(s.payoutCosts), kind: 'less' },
            { label: 'Gross margin', value: fmtKES(s.grossMargin), kind: 'subtotal' },
            { label: 'Operational expenses', value: fmtKES(s.expenses), kind: 'less' },
            { label: 'Net operating profit', value: fmtKES(s.netProfit), kind: 'total' },
          ]} />
        </Card>
        <Card flush title="Monthly profit and loss" actions={<Button size="sm" icon={Download} onClick={exportPL}>Export CSV</Button>}>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-line text-[11.5px] uppercase tracking-[0.05em] text-muted">
                  <th className="px-5 py-2.5 text-left font-medium">KES</th>
                  {months.map((m) => <th key={m.label} className="whitespace-nowrap px-4 py-2.5 text-right font-medium last:pr-5">{m.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {plRows.map(([label, get, kind]) => (
                  <tr key={label} className={cx('border-b border-line-soft last:border-0', (kind === 'sub' || kind === 'total') && 'bg-subtle/50 font-medium', kind === 'memo' && 'text-muted')}>
                    <td className="whitespace-nowrap px-5 py-2">{kind === 'less' ? <span className="text-muted">Less: </span> : null}{label}</td>
                    {months.map((m) => {
                      const v = get(m.s)
                      return <td key={m.label} className={cx('num whitespace-nowrap px-4 py-2 text-right last:pr-5', kind === 'total' && v < 0 && 'text-error')}>{kind === 'less' ? `(${fmtAmount(v)})` : fmtAmount(v)}</td>
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Card flush title="Transaction-level profitability" subtitle={`Contribution = fee - provider charge - allocated cost (${fmtKES(alloc)} per transaction, configurable in Fees & Charges)`}>
        {lossMaking > 0 && <div className="px-5 pt-4"><Notice tone="warning">{lossMaking} of {txRows.length} payments in this period have a negative contribution - typically small payments where the minimum fee does not cover allocated costs.</Notice></div>}
        <DataTable columns={cols} rows={txRows} rowKey={(t) => t.id} pageSize={12} dense emptyTitle="No transactions in this period" emptyDescription="Choose a different date range, or check back once payments come in." />
      </Card>
    </>
  )
}
