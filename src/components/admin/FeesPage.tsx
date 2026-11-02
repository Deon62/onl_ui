import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { BadgeCheck, Calculator } from 'lucide-react'
import type { CostConfig, PlatformConfig, PricingPlan } from '../../types'
import { useActions, useStore } from '../../store/AppStore'
import { calcFee, describePricing, txEconomics } from '../../lib/finance'
import { fmtCompact, fmtDate, fmtKES, fmtPct, round2 } from '../../lib/format'
import { axisProps, ChartCard, ChartTooltip, Legend, useChartColors } from '../shared/charts'
import { Badge, Button, Card, Field, Input, Notice, PageHeader, Statement, Toggle } from '../shared/ui'

const num = (v: string) => (v === '' ? 0 : Number(v))
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** Card with its own Discard / Save, shown only once something in it changed. */
function EditCard({ title, subtitle, dirty, onSave, onDiscard, extra, children }: {
  title: ReactNode; subtitle?: ReactNode; dirty: boolean; onSave: () => void; onDiscard: () => void; extra?: ReactNode; children: ReactNode
}) {
  return (
    <Card
      title={title}
      subtitle={subtitle}
      actions={dirty
        ? <><Button size="sm" onClick={onDiscard}>Discard</Button><Button size="sm" variant="primary" onClick={onSave}>Save</Button></>
        : extra}
    >
      {children}
    </Card>
  )
}

export function FeesPage() {
  const { data } = useStore()
  const actions = useActions()
  const cfg = data.config
  const [pricing, setPricing] = useState<PricingPlan>({ ...cfg.defaultPricing })
  const [costs, setCosts] = useState<CostConfig>({ ...cfg.costs })
  const [payout, setPayout] = useState({ ...cfg.payout })
  const [sms, setSms] = useState({ ...cfg.sms })
  const [plans, setPlans] = useState(cfg.subscriptionPlans.map((p) => ({ ...p })))
  const [competitor, setCompetitor] = useState({ ...cfg.competitor })

  const extrasDirty = !same({ payout, sms, plans }, { payout: cfg.payout, sms: cfg.sms, plans: cfg.subscriptionPlans })
  const verifiedAt = cfg.costsVerifiedAt

  return (
    <>
      <PageHeader title="Pricing & fees" />

      <div className="mb-6 grid gap-4 xl:grid-cols-3">
        <EditCard
          title="Default pricing"
          subtitle={describePricing(pricing)}
          dirty={!same(pricing, cfg.defaultPricing)}
          onDiscard={() => setPricing({ ...cfg.defaultPricing })}
          onSave={() => actions.updateConfig({ defaultPricing: pricing }, 'Default pricing saved')}
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fee (%)"><Input type="number" step="0.05" min={0} value={pricing.percentRate} onChange={(e) => setPricing({ ...pricing, percentRate: num(e.target.value) })} /></Field>
            <Field label="Fixed (KES)"><Input type="number" min={0} value={pricing.fixedFee} onChange={(e) => setPricing({ ...pricing, fixedFee: num(e.target.value) })} /></Field>
            <Field label="Min fee"><Input type="number" min={0} value={pricing.minFee} onChange={(e) => setPricing({ ...pricing, minFee: num(e.target.value) })} /></Field>
            <Field label="Max fee" hint="0 = no cap"><Input type="number" min={0} value={pricing.maxFee} onChange={(e) => setPricing({ ...pricing, maxFee: num(e.target.value) })} /></Field>
          </div>
        </EditCard>

        <EditCard
          title={<span className="flex items-center gap-2">Provider costs {verifiedAt ? <Badge tone="success" icon={BadgeCheck}>Verified</Badge> : <Badge tone="warning">Unverified</Badge>}</span>}
          subtitle={verifiedAt ? `Verified ${fmtDate(verifiedAt)}` : 'Confirm against real provider pricing'}
          dirty={!same(costs, cfg.costs)}
          onDiscard={() => setCosts({ ...cfg.costs })}
          // New numbers need verifying again.
          onSave={() => actions.updateConfig({ costs, costsVerifiedAt: null }, 'Provider costs saved')}
          extra={verifiedAt
            ? <Button size="sm" onClick={() => actions.updateConfig({ costsVerifiedAt: null }, 'Marked unverified')}>Unverify</Button>
            : <Button size="sm" variant="primary" icon={BadgeCheck} onClick={() => actions.updateConfig({ costsVerifiedAt: new Date().toISOString() }, 'Provider costs verified')}>Verify</Button>}
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="Charge (%)"><Input type="number" step="0.05" min={0} value={costs.providerPercent} onChange={(e) => setCosts({ ...costs, providerPercent: num(e.target.value) })} /></Field>
            <Field label="Fixed (KES)"><Input type="number" min={0} value={costs.providerFixed} onChange={(e) => setCosts({ ...costs, providerFixed: num(e.target.value) })} /></Field>
            <Field label="Token / tx"><Input type="number" step="0.1" min={0} value={costs.tokenCostPerTx} onChange={(e) => setCosts({ ...costs, tokenCostPerTx: num(e.target.value) })} /></Field>
            <Field label="Other / tx"><Input type="number" step="0.1" min={0} value={costs.otherCostPerTx} onChange={(e) => setCosts({ ...costs, otherCostPerTx: num(e.target.value) })} /></Field>
          </div>
        </EditCard>

        <EditCard
          title="Payouts, SMS & plans"
          dirty={extrasDirty}
          onDiscard={() => { setPayout({ ...cfg.payout }); setSms({ ...cfg.sms }); setPlans(cfg.subscriptionPlans.map((p) => ({ ...p }))) }}
          onSave={() => actions.updateConfig({ payout, sms, subscriptionPlans: plans }, 'Payout, SMS and plan fees saved')}
        >
          <div className="grid grid-cols-3 gap-3">
            <Field label="Payout fee"><Input type="number" min={0} value={payout.feeFixed} onChange={(e) => setPayout({ ...payout, feeFixed: num(e.target.value) })} /></Field>
            <Field label="Transfer cost"><Input type="number" min={0} value={payout.providerCost} onChange={(e) => setPayout({ ...payout, providerCost: num(e.target.value) })} /></Field>
            <Field label="Min payout"><Input type="number" min={0} value={payout.minAmount} onChange={(e) => setPayout({ ...payout, minAmount: num(e.target.value) })} /></Field>
            <Field label="SMS price"><Input type="number" step="0.1" min={0} value={sms.feePerSms} onChange={(e) => setSms({ ...sms, feePerSms: num(e.target.value) })} /></Field>
            <Field label="SMS cost"><Input type="number" step="0.1" min={0} value={sms.costPerSms} onChange={(e) => setSms({ ...sms, costPerSms: num(e.target.value) })} /></Field>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-3">
            {plans.map((p, i) => p.name !== 'None' && (
              <Field key={p.name} label={`${p.name} / mo`}>
                <Input type="number" min={0} value={p.monthlyFee} onChange={(e) => setPlans(plans.map((x, j) => (j === i ? { ...x, monthlyFee: num(e.target.value) } : x)))} />
              </Field>
            ))}
          </div>
        </EditCard>
      </div>

      <Simulator pricing={pricing} costs={costs} sms={sms} competitor={competitor} setCompetitor={setCompetitor} />

      <Card flush title="Merchant-specific rates" className="mt-6" subtitle="Set on each merchant profile">
        <table className="w-full text-[13px]">
          <thead><tr className="border-b border-line text-[11.5px] uppercase tracking-[0.05em] text-muted"><th className="px-5 py-2.5 text-left font-medium">Merchant</th><th className="px-4 py-2.5 text-left font-medium">Pricing</th><th className="hidden px-4 py-2.5 text-right font-medium sm:table-cell">Fee on KES 5,000</th><th className="px-5 py-2.5 text-right font-medium">Subscription</th></tr></thead>
          <tbody>
            {data.merchants.map((m) => (
              <tr key={m.id} className="border-b border-line-soft last:border-0">
                <td className="px-5 py-2.5"><Link to={`/admin/merchants/${m.id}`} className="hover:text-primary">{m.name}</Link></td>
                <td className="px-4 py-2.5 text-muted">{describePricing(m.pricing)}</td>
                <td className="num hidden px-4 py-2.5 text-right sm:table-cell">{fmtKES(calcFee(5000, m.pricing))}</td>
                <td className="px-5 py-2.5 text-right text-muted">{m.subscription}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  )
}

function Simulator({ pricing, costs, sms, competitor, setCompetitor }: {
  pricing: PricingPlan; costs: CostConfig; sms: PlatformConfig['sms']
  competitor: PlatformConfig['competitor']; setCompetitor: (c: PlatformConfig['competitor']) => void
}) {
  const c = useChartColors()
  const [amount, setAmount] = useState('5000')
  const [rate, setRate] = useState(String(pricing.percentRate))
  const [provider, setProvider] = useState('')
  const [token, setToken] = useState(String(costs.tokenCostPerTx))
  const [other, setOther] = useState(String(costs.otherCostPerTx))
  const [withSms, setWithSms] = useState(false)

  const a = Math.max(0, num(amount))
  const simPricing: PricingPlan = { ...pricing, percentRate: num(rate) }
  const simCosts: CostConfig = { ...costs, tokenCostPerTx: num(token), otherCostPerTx: num(other) }
  const e = txEconomics(a, simPricing, simCosts, withSms ? sms : undefined)
  const providerCost = provider === '' ? e.providerCharge : num(provider)
  const gross = round2(e.merchantFee + e.smsFee - providerCost - e.smsCost)
  const net = round2(gross - simCosts.tokenCostPerTx - simCosts.otherCostPerTx)
  const compFee = round2((a * competitor.percentRate) / 100 + competitor.fixedFee)

  const curve = useMemo(() => [200, 1000, 2500, 5000, 10000, 25000, 50000, 100000].map((amt) => {
    const ec = txEconomics(amt, simPricing, simCosts)
    return { label: fmtCompact(amt), oryne: ec.merchantFee, competitor: round2((amt * competitor.percentRate) / 100 + competitor.fixedFee) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [rate, token, other, competitor, pricing, costs])

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.1fr)]">
      <Card title={<span className="flex items-center gap-2"><Calculator size={15} strokeWidth={1.75} /> Pricing simulator</span>} subtitle="Unit economics for a single payment">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Transaction amount (KES)" className="col-span-2"><Input type="number" min={0} value={amount} onChange={(ev) => setAmount(ev.target.value)} /></Field>
          <Field label="Merchant fee (%)"><Input type="number" step="0.05" min={0} value={rate} onChange={(ev) => setRate(ev.target.value)} /></Field>
          <Field label="Provider cost (KES)" hint={`Blank = ${fmtKES(e.providerCharge)} from config`}><Input type="number" min={0} value={provider} placeholder={e.providerCharge.toFixed(2)} onChange={(ev) => setProvider(ev.target.value)} /></Field>
          <Field label="Token allocation (KES)"><Input type="number" step="0.1" min={0} value={token} onChange={(ev) => setToken(ev.target.value)} /></Field>
          <Field label="Other costs (KES)"><Input type="number" step="0.1" min={0} value={other} onChange={(ev) => setOther(ev.target.value)} /></Field>
          <label className="col-span-2 flex items-center justify-between gap-3 border-t border-line-soft pt-3 text-[13px]">
            <span>Merchant has SMS alerts <span className="text-muted">({fmtKES(sms.feePerSms)} per SMS)</span></span>
            <Toggle checked={withSms} onChange={setWithSms} label="Include SMS alert" />
          </label>
        </div>
      </Card>
      <Card title="Result">
        <Statement lines={[
          { label: 'Customer pays', value: fmtKES(a) },
          { label: `Merchant fee (${fmtPct(e.feePercent, 2)} effective)`, value: fmtKES(e.merchantFee), kind: 'less' },
          { label: 'Merchant net balance', value: fmtKES(e.merchantNet), kind: 'subtotal' },
          { label: 'Oryne fee income', value: fmtKES(e.merchantFee), kind: 'muted' },
          ...(withSms ? [{ label: 'SMS alert (from prepaid credit)', value: fmtKES(e.smsFee), kind: 'muted' as const }] : []),
          { label: 'Provider cost', value: fmtKES(providerCost), kind: 'less' },
          ...(withSms ? [{ label: 'SMS sending cost', value: fmtKES(e.smsCost), kind: 'less' as const }] : []),
          { label: 'Oryne gross margin', value: fmtKES(gross), kind: 'subtotal' },
          { label: 'Token and other allocated costs', value: fmtKES(simCosts.tokenCostPerTx + simCosts.otherCostPerTx), kind: 'less' },
          { label: 'Oryne net contribution', value: fmtKES(net), kind: 'total' },
        ]} />
        {net < 0 && <div className="mt-3"><Notice tone="error">This configuration loses money on a {fmtKES(a)} payment.</Notice></div>}
      </Card>
      <ChartCard
        title="Fee comparison (illustrative)"
        subtitle={<>Merchant cost per payment vs a hypothetical structure. <b className="font-medium text-warning">Not verified PayHero or competitor pricing.</b></>}
        legend={<Legend items={[{ label: 'Oryne (simulated)', color: c.series[0], value: fmtKES(e.merchantFee) }, { label: competitor.label, color: c.series[1], value: fmtKES(compFee) }]} />}
        height={250}
        actions={
          <div className="flex items-center gap-1.5 text-[12px] text-muted">
            <Input type="number" step="0.1" min={0} value={competitor.percentRate} onChange={(ev) => setCompetitor({ ...competitor, percentRate: num(ev.target.value) })} className="h-7 w-16 px-2 text-[12px]" aria-label="Hypothetical rate" />%
          </div>
        }
      >
        <ResponsiveContainer>
          <BarChart data={curve} margin={{ top: 4, right: 16, left: 0, bottom: 0 }} barGap={2} barCategoryGap="22%">
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" {...axisProps(c.axis)} />
            <YAxis {...axisProps(c.axis)} tickFormatter={fmtCompact} width={40} />
            <Tooltip content={<ChartTooltip labelFormatter={(l) => `Payment of KES ${l}`} />} cursor={{ fill: c.grid, opacity: 0.6 }} />
            <Bar dataKey="oryne" name="Oryne (simulated)" fill={c.series[0]} radius={[3, 3, 0, 0]} />
            <Bar dataKey="competitor" name={competitor.label} fill={c.series[1]} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  )
}
