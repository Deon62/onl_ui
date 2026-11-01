import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Send } from 'lucide-react'
import { useActions, useStore } from '../../store/AppStore'
import { useAllLedgers } from '../../store/selectors'
import { bucketIndex, bucketsFor, inRange, rangeFromPreset } from '../../lib/dates'
import { fmtCompact, fmtKES } from '../../lib/format'
import { axisProps, ChartCard, ChartTooltip, Legend, useChartColors } from '../shared/charts'
import { isMobileMoney } from '../../lib/settlement'
import { PayoutsTable } from '../shared/FinancePanels'
import { PayoutRequestModal } from '../shared/PayoutRequestModal'
import { Button, Card, Modal, PageHeader, Select, StatCard } from '../shared/ui'

export function AdminPayoutsPage() {
  const { data } = useStore()
  const actions = useActions()
  const ledgers = useAllLedgers()
  const [initiateFor, setInitiateFor] = useState('')
  const [picking, setPicking] = useState(false)
  const [confirmBatch, setConfirmBatch] = useState(false)

  const stats = useMemo(() => {
    const r30 = rangeFromPreset('30d')
    const pending = data.payouts.filter((p) => p.status === 'Pending')
    const processing = data.payouts.filter((p) => p.status === 'Processing')
    const done = data.payouts.filter((p) => p.status === 'Completed' && inRange(p.completedAt, r30))
    return {
      pending, processing, pendingB2c: pending.filter((p) => isMobileMoney(p.method)),
      pendingAmt: pending.reduce((s, p) => s + p.amount, 0),
      processingAmt: processing.reduce((s, p) => s + p.amount, 0),
      doneNet: done.reduce((s, p) => s + p.netAmount, 0),
      doneCount: done.length,
      fees: done.reduce((s, p) => s + p.fee, 0),
      costs: done.reduce((s, p) => s + p.providerCost, 0),
      available: Object.values(ledgers).reduce((s, l) => s + l.available, 0),
    }
  }, [data.payouts, ledgers])

  const c = useChartColors()
  const charts = useMemo(() => {
    const range = rangeFromPreset('30d')
    const buckets = bucketsFor(range)
    const daily = buckets.map((b) => ({ label: b.label, b2c: 0, manual: 0 }))
    const byMerchant: Record<string, number> = Object.fromEntries(data.merchants.map((m) => [m.id, 0]))
    let b2c = 0, manual = 0
    for (const p of data.payouts) {
      if (p.status !== 'Completed' || !inRange(p.completedAt, range)) continue
      const i = bucketIndex(buckets, p.completedAt!)
      if (i >= 0) {
        if (p.remittance === 'Manual') daily[i].manual += p.netAmount
        else daily[i].b2c += p.netAmount
      }
      if (p.remittance === 'Manual') manual += p.netAmount
      else b2c += p.netAmount
      byMerchant[p.merchantId] = (byMerchant[p.merchantId] ?? 0) + p.netAmount
    }
    const merchants = data.merchants
      .map((m) => ({ id: m.id, name: m.name, value: byMerchant[m.id] ?? 0 }))
      .sort((a, b) => b.value - a.value)
    return { daily, merchants, b2c, manual }
  }, [data.payouts, data.merchants])
  const xInterval = Math.max(0, Math.ceil(charts.daily.length / 8) - 1)

  const merchant = data.merchants.find((m) => m.id === initiateFor)

  return (
    <>
      <PageHeader
        title="Payouts"
        description="Remit merchant funds from the business Till via M-Pesa B2C or a manual transfer. Payouts reduce what Oryne owes the merchant."
        actions={
          <>
            <Button icon={Send} onClick={() => setPicking(true)}>Initiate payout</Button>
            <Button variant="primary" disabled={!stats.pendingB2c.length} onClick={() => setConfirmBatch(true)}>Send pending via M-Pesa ({stats.pendingB2c.length})</Button>
          </>
        }
      />
      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Awaiting approval" value={fmtKES(stats.pendingAmt)} hint={`${stats.pending.length} requests`} />
        <StatCard label="Processing" value={fmtKES(stats.processingAmt)} hint={`${stats.processing.length} transfers in flight`} />
        <StatCard label="Paid out - 30 days" value={fmtKES(stats.doneNet)} hint={`${stats.doneCount} completed payouts`} />
        <StatCard label="Payout fees - 30 days" value={fmtKES(stats.fees)} hint={`vs ${fmtKES(stats.costs)} transfer costs`} />
      </div>
      <div className="mb-6 grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <ChartCard
          title="Payouts sent - 30 days"
          empty={charts.b2c + charts.manual === 0 && 'No payouts were completed in the last 30 days.'}
          subtitle="Completed payouts by remittance method"
          legend={<Legend items={[{ label: 'M-Pesa B2C', color: c.series[0], value: fmtKES(charts.b2c) }, { label: 'Manual transfer', color: c.series[1], value: fmtKES(charts.manual) }]} />}
          height={230}
        >
          <ResponsiveContainer>
            <BarChart data={charts.daily} margin={{ top: 4, right: 16, left: 4, bottom: 0 }} barCategoryGap="22%">
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" {...axisProps(c.axis)} interval={xInterval} />
              <YAxis {...axisProps(c.axis)} tickFormatter={fmtCompact} width={48} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: c.grid, opacity: 0.6 }} />
              <Bar dataKey="b2c" name="M-Pesa B2C" stackId="p" fill={c.series[0]} stroke={c.surface} strokeWidth={1} />
              <Bar dataKey="manual" name="Manual transfer" stackId="p" fill={c.series[1]} stroke={c.surface} strokeWidth={1} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Paid out by merchant - 30 days" subtitle={fmtKES(charts.b2c + charts.manual)} height={230} empty={charts.b2c + charts.manual === 0 && 'Merchant payouts will appear here.'}>
          <ResponsiveContainer>
            <BarChart data={charts.merchants} layout="vertical" margin={{ top: 4, right: 20, left: 4, bottom: 0 }} barCategoryGap="28%">
              <CartesianGrid horizontal={false} />
              <XAxis type="number" {...axisProps(c.axis)} tickFormatter={fmtCompact} />
              <YAxis type="category" dataKey="name" {...axisProps(c.axis)} width={112} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: c.grid, opacity: 0.6 }} />
              <Bar dataKey="value" name="Paid out" radius={[0, 3, 3, 0]}>
                {charts.merchants.map((m) => <Cell key={m.id} fill={c.merchantColor(m.id)} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
      <Card flush title="All payouts" subtitle={`${fmtKES(stats.available)} currently available for withdrawal across all merchants`}>
        <PayoutsTable payouts={data.payouts} showMerchant admin pageSize={15} />
      </Card>

      <Modal
        open={picking}
        onClose={() => setPicking(false)}
        size="sm"
        title="Initiate payout on behalf of merchant"
        footer={<><Button onClick={() => setPicking(false)}>Cancel</Button><Button variant="primary" disabled={!initiateFor} onClick={() => setPicking(false)}>Continue</Button></>}
      >
        <Select value={initiateFor} onChange={(e) => setInitiateFor(e.target.value)} aria-label="Merchant">
          <option value="">Select merchant...</option>
          {data.merchants.map((m) => <option key={m.id} value={m.id}>{m.name} - {fmtKES(ledgers[m.id]?.available ?? 0)} available</option>)}
        </Select>
      </Modal>
      {merchant && !picking && <PayoutRequestModal open merchant={merchant} initiatedBy="Admin" onClose={() => setInitiateFor('')} />}

      <Modal
        open={confirmBatch}
        onClose={() => setConfirmBatch(false)}
        size="sm"
        title="Send pending payouts via M-Pesa?"
        footer={<><Button onClick={() => setConfirmBatch(false)}>Cancel</Button><Button variant="primary" onClick={() => { stats.pendingB2c.forEach((p) => actions.remitPayout(p.id, 'B2C')); setConfirmBatch(false) }}>Send {stats.pendingB2c.length}</Button></>}
      >
        <p className="text-[13px] text-muted">{stats.pendingB2c.length} M-Pesa payouts (B2C to phones, B2B to Tills and Paybills) totalling {fmtKES(stats.pendingB2c.reduce((s, p) => s + p.amount, 0))} will be sent. Bank payouts must be remitted manually. Payouts go live with the payments phase.</p>
      </Modal>
    </>
  )
}
