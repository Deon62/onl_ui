import { useMemo, useState } from 'react'
import { CheckCircle2, MessageSquare, Plus, Send, Wallet } from 'lucide-react'
import type { SmsTopUp, Transaction } from '../../types'
import { useActions, useStore } from '../../store/AppStore'
import { useMerchantLedger, useMerchantScope } from '../../store/selectors'
import { smsCreditBalance, smsPrice } from '../../lib/finance'
import { fmtAmount, fmtDateTime, fmtInt, fmtKES, fmtPhone, normalizePhone } from '../../lib/format'
import { DataTable, type Column } from '../shared/DataTable'
import { SmsAlertsPanel } from '../shared/SmsAlertsPanel'
import { useAsyncAction } from '../shared/Loading'
import { Badge, Button, Card, cx, Field, Input, Modal, Mono, Notice, PageHeader, StatCard, Statement, Tabs } from '../shared/ui'

const PRESETS = [200, 500, 1000, 2000]

export function SmsPage() {
  const { data } = useStore()
  const { merchant } = useMerchantScope()
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'usage' | 'topups'>('usage')

  const stats = useMemo(() => {
    if (!merchant) return null
    const start = new Date()
    start.setDate(1)
    start.setHours(0, 0, 0, 0)
    const usage = data.transactions.filter((t) => t.merchantId === merchant.id && t.smsFee > 0)
    const month = usage.filter((t) => t.confirmedAt && new Date(t.confirmedAt) >= start)
    const topUps = data.smsTopUps.filter((x) => x.merchantId === merchant.id)
    return {
      usage, topUps,
      credit: smsCreditBalance(merchant.id, data),
      monthCount: month.reduce((s, t) => s + Math.round(t.smsFee / data.config.sms.feePerSms), 0),
      monthCharge: month.reduce((s, t) => s + t.smsFee, 0),
    }
  }, [data, merchant])

  if (!merchant || !stats) return null
  const perPayment = smsPrice(merchant, data.config).fee || data.config.sms.feePerSms
  const alertsLeft = Math.floor(stats.credit / perPayment)
  const low = merchant.smsAlerts.enabled && alertsLeft < 20

  const usageCols: Column<Transaction>[] = [
    { key: 'at', header: 'Sent', cell: (t) => <span className="text-muted">{fmtDateTime(t.confirmedAt!)}</span>, sort: (t) => t.confirmedAt! },
    { key: 'tx', header: 'Payment', cell: (t) => <Mono>{t.id}</Mono>, hideBelow: 'sm' },
    { key: 'amt', header: 'Payment amount', align: 'right', cell: (t) => fmtAmount(t.amount), hideBelow: 'md' },
    { key: 'n', header: 'SMS', align: 'right', cell: (t) => Math.round(t.smsFee / data.config.sms.feePerSms) },
    { key: 'c', header: 'Charge', align: 'right', cell: (t) => fmtAmount(t.smsFee) },
  ]
  const topCols: Column<SmsTopUp>[] = [
    { key: 'at', header: 'Date', cell: (x) => <span className="text-muted">{fmtDateTime(x.at)}</span>, sort: (x) => x.at },
    { key: 'ref', header: 'Reference', cell: (x) => <Mono>{x.reference}</Mono>, hideBelow: 'sm' },
    { key: 'm', header: 'Paid with', cell: (x) => x.method === 'M-Pesa' ? <span>M-Pesa <Mono className="text-muted">{x.mpesaReceipt}</Mono></span> : 'Available balance', hideBelow: 'md' },
    { key: 'a', header: 'Amount', align: 'right', cell: (x) => fmtAmount(x.amount), sort: (x) => x.amount },
  ]

  return (
    <>
      <PageHeader title="SMS Alerts" actions={<Button variant="primary" icon={Plus} onClick={() => setOpen(true)} disabled={merchant.status !== 'Active'}>Top up</Button>} />
      {low && <div className="mb-5"><Notice tone={alertsLeft === 0 ? 'error' : 'warning'} title={alertsLeft === 0 ? 'SMS credit exhausted - alerts are paused' : `Low SMS credit - about ${alertsLeft} alerts left`} /></div>}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="SMS credit" icon={Wallet} value={fmtKES(stats.credit)} accent={stats.credit < perPayment ? 'var(--error)' : undefined} />
        <StatCard label="Alerts remaining" icon={MessageSquare} value={fmtInt(alertsLeft)} />
        <StatCard label="SMS sent this month" icon={Send} value={fmtInt(stats.monthCount)} />
        <StatCard label="Used this month" icon={CheckCircle2} value={fmtKES(stats.monthCharge)} />
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <SmsAlertsPanel key={merchant.id + String(merchant.smsAlerts.enabled) + merchant.smsAlerts.recipients.join()} merchant={merchant} />
        <Card flush>
          <div className="px-5 pt-3"><Tabs value={tab} onChange={setTab} tabs={[{ value: 'usage', label: 'Usage', count: stats.usage.length }, { value: 'topups', label: 'Top-ups', count: stats.topUps.length }]} /></div>
          {tab === 'usage'
            ? <DataTable columns={usageCols} rows={stats.usage} rowKey={(t) => t.id} pageSize={10} dense emptyTitle="No alerts sent yet" emptyDescription={merchant.smsAlerts.enabled ? 'You will get an SMS for every payment you receive.' : 'Turn on SMS alerts to get a text for every payment.'} />
            : <DataTable columns={topCols} rows={stats.topUps} rowKey={(x) => x.id} pageSize={10} dense emptyTitle="No top-ups yet" emptyDescription="Top up SMS credit to start receiving payment alerts." />}
        </Card>
      </div>
      {open && <TopUpModal onClose={() => setOpen(false)} perPayment={perPayment} />}
    </>
  )
}

function TopUpModal({ onClose, perPayment }: { onClose: () => void; perPayment: number }) {
  const { data } = useStore()
  const { merchant } = useMerchantScope()
  const ledger = useMerchantLedger(merchant?.id ?? null)
  const actions = useActions()
  const [amount, setAmount] = useState('500')
  const [method, setMethod] = useState<SmsTopUp['method']>('M-Pesa')
  const [phone, setPhone] = useState(merchant ? '0' + merchant.phone.slice(3) : '')
  const [done, setDone] = useState(false)
  const { run, pending, error: netError } = useAsyncAction()
  if (!merchant || !ledger) return null

  const value = Number(amount)
  const phoneOk = method === 'Balance' || !!normalizePhone(phone)
  const err = !amount ? null
    : !(value >= 50) ? 'Minimum top-up is KES 50.'
      : method === 'Balance' && value > ledger.available ? 'Exceeds your available balance.'
        : null
  const ok = !!amount && !err && phoneOk

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={done ? 'Credit added' : 'Top up SMS credit'}
      footer={done
        ? <Button variant="primary" onClick={onClose}>Done</Button>
        : <><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!ok} loading={pending} onClick={async () => { const r = await run(() => actions.topUpSms(merchant.id, value, method)); if (r.ok && r.value) setDone(true) }}>{method === 'M-Pesa' ? 'Pay with M-Pesa' : 'Top up'}</Button></>}
    >
      {done ? (
        <div className="py-2 text-center">
          <CheckCircle2 size={34} strokeWidth={1.5} className="mx-auto text-success" />
          <div className="num mt-3 text-[20px] font-semibold">{fmtKES(value)}</div>
          <div className="mt-1 text-[13px] text-muted">added - about {fmtInt(Math.floor(value / perPayment))} more alerts</div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-1.5">
            {PRESETS.map((p) => (
              <button key={p} onClick={() => setAmount(String(p))} className={cx('rounded-[4px] border py-2 text-[13px] font-medium transition-colors', Number(amount) === p ? 'border-sidebar bg-sidebar text-sidebar-ink' : 'border-line bg-surface text-ink hover:bg-subtle')}>
                {p.toLocaleString()}
              </button>
            ))}
          </div>
          <Field label="Amount (KES)" error={err}><Input type="number" min={50} value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <div>
            <div className="mb-1.5 text-[12.5px] font-medium">Pay with</div>
            <div className="grid grid-cols-2 gap-1.5">
              {(['M-Pesa', 'Balance'] as const).map((m) => (
                <button key={m} onClick={() => setMethod(m)} className={cx('rounded-[4px] border px-3 py-2 text-left text-[12.5px] transition-colors', method === m ? 'border-primary bg-primary-soft' : 'border-line bg-surface hover:bg-subtle')}>
                  <div className="font-medium text-ink">{m === 'M-Pesa' ? 'M-Pesa' : 'Available balance'}</div>
                  <div className="num text-muted">{m === 'M-Pesa' ? 'STK prompt' : fmtKES(ledger.available)}</div>
                </button>
              ))}
            </div>
          </div>
          {method === 'M-Pesa' && (
            <Field label="M-Pesa number" error={!phoneOk ? 'Enter a valid number.' : null} hint={phoneOk && normalizePhone(phone) ? fmtPhone(normalizePhone(phone)!) : undefined}>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </Field>
          )}
          {netError && <Notice tone="error">{netError}</Notice>}
          <Statement lines={[
            { label: 'Top-up', value: fmtKES(value || 0) },
            { label: <span>Alerts this buys <Badge className="ml-1">{fmtKES(perPayment)} each</Badge></span>, value: fmtInt(Math.floor((value || 0) / perPayment)), kind: 'total' },
          ]} />
          <p className="text-[12px] text-muted">SMS credit top-ups go live with the payments phase. {data.config.sms.feePerSms > 0 && `Price: ${fmtKES(data.config.sms.feePerSms)} per SMS.`}</p>
        </div>
      )}
    </Modal>
  )
}
