import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowLeft, Ban, CheckCircle2, Eye, KeyRound, Pencil } from 'lucide-react'
import type { Merchant } from '../../types'
import { automatedRail, displayDestination } from '../../lib/settlement'
import { useActions, useStore } from '../../store/AppStore'
import { useMerchantLedger } from '../../store/selectors'
import { bucketIndex, bucketsFor, inRange, rangeFromPreset } from '../../lib/dates'
import { calcFee, COLLECTED, describePricing, smsCreditBalance, txEconomics } from '../../lib/finance'
import { fmtCompact, fmtKES, fmtPhone } from '../../lib/format'
import { SmsAlertsPanel } from '../shared/SmsAlertsPanel'
import { axisProps, ChartCard, ChartTooltip, useChartColors } from '../shared/charts'
import { ActivityList, BalanceStatement, PayoutsTable } from '../shared/FinancePanels'
import { TransactionsExplorer } from '../shared/TransactionsExplorer'
import { Button, Card, EmptyState, Field, Input, KeyValue, MerchantAvatar, Modal, Mono, Notice, Select, StatCard, StatusBadge, Tabs, Toggle } from '../shared/ui'
import { MerchantFormModal } from './MerchantForm'
import { CredentialsModal } from '../shared/Password'
import type { LoginIssued } from '../../lib/api'

type Tab = 'overview' | 'transactions' | 'payouts' | 'pricing' | 'collection' | 'activity'

export function MerchantDetailPage() {
  const { id } = useParams()
  const { data, viewAsMerchant } = useStore()
  const actions = useActions()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('overview')
  const [editing, setEditing] = useState(false)
  const [sendingLogin, setSendingLogin] = useState(false)
  const [issued, setIssued] = useState<LoginIssued | null>(null)
  const [confirmStatus, setConfirmStatus] = useState(false)
  const merchant = data.merchants.find((m) => m.id === id)
  const ledger = useMerchantLedger(merchant?.id ?? null)

  if (!merchant || !ledger) {
    return <EmptyState title="Merchant not found" description="This merchant does not exist." action={<Link to="/admin/merchants"><Button icon={ArrowLeft}>Back to merchants</Button></Link>} />
  }

  const suspend = merchant.status !== 'Suspended'
  const payouts = data.payouts.filter((p) => p.merchantId === merchant.id)
  const txCount = data.transactions.filter((t) => t.merchantId === merchant.id).length

  return (
    <>
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <Link to="/admin/merchants" aria-label="Back to merchants" className="inline-flex h-8 w-8 items-center justify-center rounded-[5px] border border-line bg-surface text-muted hover:text-ink"><ArrowLeft size={15} /></Link>
          <MerchantAvatar name={merchant.name} size={32} />
          <div className="min-w-0 leading-tight">
            <h1 className="flex items-center gap-2 truncate text-[15px] font-semibold">{merchant.name} <StatusBadge status={merchant.status} /></h1>
            <div className="text-[12px] text-muted"><Mono className="text-muted">{merchant.id}</Mono> · {merchant.domain}</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button icon={Eye} onClick={() => { viewAsMerchant(merchant.id); navigate('/merchant') }}>View as merchant</Button>
          <Button icon={Pencil} onClick={() => setEditing(true)}>Edit</Button>
          <Button icon={KeyRound} onClick={() => setSendingLogin(true)}>Send login</Button>
          {merchant.status === 'Pending Review'
            ? <Button variant="primary" icon={CheckCircle2} onClick={() => actions.setMerchantStatus(merchant.id, 'Active')}>Approve & activate</Button>
            : <Button variant={suspend ? 'danger' : 'primary'} icon={suspend ? Ban : CheckCircle2} onClick={() => setConfirmStatus(true)}>{suspend ? 'Suspend' : 'Activate'}</Button>}
        </div>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Total processed" value={fmtKES(ledger.grossCollections)} hint={`${ledger.collectionCount.toLocaleString()} payments`} />
        <StatCard label="Available balance" value={fmtKES(ledger.available)} hint="withdrawable now" />
        <StatCard label="Pending balance" value={fmtKES(ledger.pendingSettlement)} hint={`${data.config.settlementHours}h settlement window`} />
        <StatCard label="Total paid out" value={fmtKES(ledger.paidOutNet)} hint={`${payouts.filter((p) => p.status === 'Completed').length} payouts`} />
        <StatCard label="Fees charged" value={fmtKES(ledger.fees)} hint={describePricing(merchant.pricing)} />
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'overview', label: 'Overview' },
          { value: 'transactions', label: 'Transactions', count: txCount },
          { value: 'payouts', label: 'Payouts', count: payouts.length },
          { value: 'pricing', label: 'Pricing & schedule' },
          { value: 'collection', label: 'Collection & SMS' },
          { value: 'activity', label: 'Activity' },
        ]}
      />

      {tab === 'overview' && <Overview merchant={merchant} ledger={ledger} />}
      {tab === 'transactions' && <TransactionsExplorer mode="admin" merchantId={merchant.id} />}
      {tab === 'payouts' && <Card flush title="Payout history"><PayoutsTable payouts={payouts} admin /></Card>}
      {tab === 'pricing' && <PricingTab merchant={merchant} />}
      {tab === 'collection' && (
        <div className="grid gap-4 xl:grid-cols-2">
          <Card title="Collection setup" subtitle="Managed by Oryne - the merchant does not integrate anything">
            <KeyValue rows={[
              ['Merchant ID', <Mono>{merchant.id}</Mono>],
              ['Collection Till', <Mono>{data.config.tillNumberMasked} (shared business Till)</Mono>],
              ['Payment reference format', <Mono>{merchant.referencePrefix}-XXXXXX</Mono>],
              ['Website', merchant.domain],
              ['Active payment links', data.paymentLinks.filter((l) => l.merchantId === merchant.id && l.status === 'Active').length],
              ['Payout remittance', automatedRail(merchant.payoutMethod) ? `M-Pesa ${automatedRail(merchant.payoutMethod)} or manual` : 'Manual bank transfer'],
              ['SMS credit balance', <span className="num">{fmtKES(smsCreditBalance(merchant.id, data))}</span>],
            ]} />
            <p className="mt-3 text-[12.5px] leading-relaxed text-muted">
              Oryne sends the STK push from its hosted checkout and payment links using a unique reference stored against this
              merchant. The callback is matched on that reference and the M-Pesa receipt.
            </p>
          </Card>
          <SmsAlertsPanel key={merchant.id + String(merchant.smsAlerts.enabled) + merchant.smsAlerts.recipients.join()} merchant={merchant} />
        </div>
      )}
      {tab === 'activity' && <Card flush title="Merchant activity"><ActivityList items={data.activity.filter((a) => a.merchantId === merchant.id).slice(0, 60)} showMerchant={false} /></Card>}

      {editing && <MerchantFormModal open merchant={merchant} onClose={() => setEditing(false)} />}
      {sendingLogin && <SendLoginModal merchant={merchant} onClose={() => setSendingLogin(false)} onIssued={(l) => { setSendingLogin(false); setIssued(l) }} />}
      {issued && <CredentialsModal login={issued} business={merchant.name} onClose={() => setIssued(null)} />}
      <Modal
        open={confirmStatus}
        onClose={() => setConfirmStatus(false)}
        size="sm"
        title={suspend ? `Suspend ${merchant.name}?` : `Activate ${merchant.name}?`}
        footer={<><Button onClick={() => setConfirmStatus(false)}>Cancel</Button><Button variant={suspend ? 'danger' : 'primary'} onClick={() => { actions.setMerchantStatus(merchant.id, suspend ? 'Suspended' : 'Active'); setConfirmStatus(false) }}>{suspend ? 'Suspend account' : 'Activate account'}</Button></>}
      >
        <p className="text-[13px] leading-relaxed text-muted">
          {suspend
            ? 'New payment requests and payouts will be blocked and merchant users will be unable to sign in. Existing balances remain owed to the merchant and are unaffected.'
            : 'The merchant will be able to sign in, initiate payments and request payouts again.'}
        </p>
      </Modal>
    </>
  )
}

function Overview({ merchant, ledger }: { merchant: Merchant; ledger: NonNullable<ReturnType<typeof useMerchantLedger>> }) {
  const { data } = useStore()
  const c = useChartColors()
  const range = rangeFromPreset('30d')
  const series = useMemo(() => {
    const b = bucketsFor(range)
    const rows = b.map((x) => ({ label: x.label, value: 0 }))
    for (const t of data.transactions) {
      if (t.merchantId === merchant.id && COLLECTED.includes(t.status) && inRange(t.confirmedAt, range)) {
        const i = bucketIndex(b, t.confirmedAt!)
        if (i >= 0) rows[i].value += t.amount
      }
    }
    return rows
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.transactions, merchant.id])
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <div className="space-y-4">
        <ChartCard title="Collections - last 30 days" subtitle={fmtKES(series.reduce((s, r) => s + r.value, 0))} height={240} empty={series.every((r) => !r.value) && 'This merchant has no collections in the last 30 days.'}>
          <ResponsiveContainer>
            <BarChart data={series} margin={{ top: 4, right: 16, left: 4, bottom: 0 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" {...axisProps(c.axis)} interval={3} />
              <YAxis {...axisProps(c.axis)} tickFormatter={fmtCompact} width={44} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: c.grid, opacity: 0.6 }} />
              <Bar dataKey="value" name="Collections" fill={c.merchantColor(merchant.id)} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <Card title="Business profile">
          <KeyValue rows={[
            ['Legal name', merchant.legalName],
            ['Business email', merchant.email],
            ['Phone', fmtPhone(merchant.phone)],
            ['Primary contact', merchant.contactName],
            ['Registered domain', merchant.domain],
            ['Subscription', merchant.subscription],
            ['Payout schedule', `${merchant.payoutSchedule} · ${merchant.payoutMethod}`],
            ['Payout destination', displayDestination(merchant.payoutMethod, merchant.payoutDestination)],
          ]} />
        </Card>
      </div>
      <Card title="Balance statement" subtitle="All-time merchant ledger">
        <BalanceStatement ledger={ledger} />
      </Card>
    </div>
  )
}

function PricingTab({ merchant }: { merchant: Merchant }) {
  const { data } = useStore()
  const actions = useActions()
  const [p, setP] = useState({ ...merchant.pricing })
  const [schedule, setSchedule] = useState(merchant.payoutSchedule)
  const [sub, setSub] = useState(merchant.subscription)
  const dirty = JSON.stringify(p) !== JSON.stringify(merchant.pricing) || schedule !== merchant.payoutSchedule || sub !== merchant.subscription
  const samples = [500, 2500, 5000, 25000, 100000]
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card title="Merchant-specific pricing" subtitle={`Platform default: ${describePricing(data.config.defaultPricing)}`}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Fee rate (%)"><Input type="number" step="0.05" min={0} value={p.percentRate} onChange={(e) => setP({ ...p, percentRate: Number(e.target.value) })} /></Field>
          <Field label="Fixed fee (KES)"><Input type="number" min={0} value={p.fixedFee} onChange={(e) => setP({ ...p, fixedFee: Number(e.target.value) })} /></Field>
          <Field label="Minimum fee (KES)"><Input type="number" min={0} value={p.minFee} onChange={(e) => setP({ ...p, minFee: Number(e.target.value) })} /></Field>
          <Field label="Maximum fee (KES)" hint="0 = no cap"><Input type="number" min={0} value={p.maxFee} onChange={(e) => setP({ ...p, maxFee: Number(e.target.value) })} /></Field>
          <Field label="Payout schedule">
            <Select value={schedule} onChange={(e) => setSchedule(e.target.value as Merchant['payoutSchedule'])}><option>Manual</option><option>Daily</option><option>Weekly</option><option>Monthly</option></Select>
          </Field>
          <Field label="Subscription plan">
            <Select value={sub} onChange={(e) => setSub(e.target.value)}>
              {data.config.subscriptionPlans.map((s) => <option key={s.name} value={s.name}>{s.name}{s.monthlyFee ? ` - KES ${s.monthlyFee.toLocaleString()}` : ''}</option>)}
            </Select>
          </Field>
        </div>
        <div className="mt-5 flex items-center justify-between gap-3">
          <span className="text-[12px] text-muted">Applies to new transactions only.</span>
          <div className="flex gap-2">
            <Button disabled={!dirty} onClick={() => { setP({ ...merchant.pricing }); setSchedule(merchant.payoutSchedule); setSub(merchant.subscription) }}>Reset</Button>
            <Button variant="primary" disabled={!dirty} onClick={() => actions.updateMerchant(merchant.id, { pricing: p, payoutSchedule: schedule, subscription: sub }, `Updated pricing to ${describePricing(p)}`)}>Save pricing</Button>
          </div>
        </div>
      </Card>
      <Card flush title="Fee preview" subtitle="Using the values on the left and current provider cost configuration">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-line text-[11.5px] uppercase tracking-[0.05em] text-muted">
              <th className="px-5 py-2.5 text-left font-medium">Payment</th><th className="px-4 py-2.5 text-right font-medium">Merchant fee</th>
              <th className="px-4 py-2.5 text-right font-medium">Effective</th><th className="px-5 py-2.5 text-right font-medium">Oryne contribution</th>
            </tr>
          </thead>
          <tbody>
            {samples.map((a) => {
              const e = txEconomics(a, p, data.config.costs)
              return (
                <tr key={a} className="num border-b border-line-soft last:border-0">
                  <td className="px-5 py-2.5">{fmtKES(a)}</td>
                  <td className="px-4 py-2.5 text-right">{fmtKES(calcFee(a, p))}</td>
                  <td className="px-4 py-2.5 text-right text-muted">{e.feePercent.toFixed(2)}%</td>
                  <td className={`px-5 py-2.5 text-right ${e.netContribution < 0 ? 'text-error' : ''}`}>{fmtKES(e.netContribution)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div className="p-5 pt-3"><Notice>Contribution = merchant fee - provider charge - allocated token and overhead costs. Negative values indicate the rate does not cover assumed costs.</Notice></div>
      </Card>
    </div>
  )
}

/** Set a new password for the merchant's owner login (creating it if needed) and optionally email it. */
function SendLoginModal({ merchant, onClose, onIssued }: { merchant: Merchant; onClose: () => void; onIssued: (l: LoginIssued) => void }) {
  const actions = useActions()
  const [email, setEmail] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const go = async () => {
    setBusy(true)
    setError(null)
    try {
      onIssued(await actions.sendLogin(merchant.id, email))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not issue the login.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="Send login details"
      description={`Sets a new temporary password for the ${merchant.name} owner login. Their current password stops working.`}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" icon={KeyRound} loading={busy} onClick={() => void go()}>Set new password</Button></>}
    >
      <div className="space-y-4">
        {error && <Notice tone="error" title="Could not issue the login">{error}</Notice>}
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-[13px] font-medium text-ink">Email it to the owner</div>
            <div className="text-[12.5px] text-muted">You can also copy the password on the next screen.</div>
          </div>
          <Toggle checked={email} onChange={setEmail} label="Email login details" />
        </div>
      </div>
    </Modal>
  )
}
