import { useState } from 'react'
import { Building2, Landmark, ShieldCheck, Smartphone, Store } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Merchant, PayoutMethod, PayoutSchedule, SettlementDetails } from '../../types'
import { useActions, useStore } from '../../store/AppStore'
import { useMerchantScope } from '../../store/selectors'
import { fmtDateTime, fmtKES, normalizePhone } from '../../lib/format'
import {
  automatedRail, destinationFor, displayDestination, getSettlement, KENYAN_BANKS, MPESA_TRANSFER_LIMIT, PAYOUT_METHODS, validateSettlement,
} from '../../lib/settlement'
import { useAsyncAction } from '../shared/Loading'
import { Button, Card, cx, Field, Input, KeyValue, Modal, Notice, PageHeader, Select } from '../shared/ui'

const ICONS: Record<PayoutMethod, LucideIcon> = { 'M-Pesa': Smartphone, Till: Store, Paybill: Building2, 'Bank transfer': Landmark }

const SCHEDULES: { value: PayoutSchedule; hint: string }[] = [
  { value: 'Manual', hint: 'Only when you request a payout' },
  { value: 'Daily', hint: 'Every day except Sunday' },
  { value: 'Weekly', hint: 'Every Monday' },
  { value: 'Monthly', hint: 'On the 1st of each month' },
]

export function SettlementPage() {
  const { merchant } = useMerchantScope()
  if (!merchant) return null
  // Re-key so the form resets after a save or when switching merchants
  return <SettlementForm key={merchant.id + merchant.payoutDestination + merchant.payoutSchedule} merchant={merchant} />
}

function SettlementForm({ merchant }: { merchant: Merchant }) {
  const { data } = useStore()
  const actions = useActions()
  const saved = getSettlement(merchant)
  const [method, setMethod] = useState<PayoutMethod>(merchant.payoutMethod)
  const [s, setS] = useState<SettlementDetails>(() => ({
    ...saved,
    phone: saved.phone ? '0' + (normalizePhone(saved.phone) ?? saved.phone).slice(3) : '',
  }))
  const [schedule, setSchedule] = useState<PayoutSchedule>(merchant.payoutSchedule)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [confirm, setConfirm] = useState(false)
  const { run, pending, error: netError, clearError } = useAsyncAction()

  const set = (k: keyof SettlementDetails, v: string) => {
    setS((p) => ({ ...p, [k]: v }))
    if (errors[k]) setErrors((e) => ({ ...e, [k]: '' }))
  }

  const nextDest = destinationFor(method, s)
  const accountChanged = method !== merchant.payoutMethod || nextDest !== merchant.payoutDestination
  const dirty = accountChanged || schedule !== merchant.payoutSchedule
  const inFlight = data.payouts.filter((p) => p.merchantId === merchant.id && (p.status === 'Pending' || p.status === 'Processing')).length
  const rail = automatedRail(merchant.payoutMethod)

  const reset = () => {
    setMethod(merchant.payoutMethod)
    setS({ ...saved, phone: saved.phone ? '0' + (normalizePhone(saved.phone) ?? saved.phone).slice(3) : '' })
    setSchedule(merchant.payoutSchedule)
    setErrors({})
  }

  const save = () => {
    if (!accountChanged) return commit()
    const e = validateSettlement(method, s)
    setErrors(e)
    if (Object.keys(e).length) return
    setConfirm(true)
  }
  async function commit() {
    const r = await run(() => actions.updateSettlement(merchant.id, method, { ...s, phone: normalizePhone(s.phone) ?? '', accountNumber: s.accountNumber.replace(/\s/g, '') }, schedule))
    if (r.ok) setConfirm(false)
  }

  return (
    <>
      <PageHeader title="Settlement" />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <Card
          title="Where your payouts go"
          actions={<div className="flex gap-2"><Button size="sm" disabled={!dirty} onClick={reset}>Discard</Button><Button size="sm" variant="primary" disabled={!dirty || merchant.status === 'Suspended'} loading={pending && !confirm} onClick={save}>Save changes</Button></div>}
        >
          <div role="radiogroup" aria-label="Payout method" className="grid gap-2 sm:grid-cols-2">
            {PAYOUT_METHODS.map((m) => {
              const Icon = ICONS[m.value]
              const on = method === m.value
              return (
                <button
                  key={m.value}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => { setMethod(m.value); setErrors({}) }}
                  className={cx('flex items-start gap-3 rounded-md border px-3.5 py-3 text-left transition-colors', on ? 'border-primary bg-primary-soft' : 'border-line hover:bg-subtle')}
                >
                  <Icon size={18} strokeWidth={1.75} className={cx('mt-0.5 shrink-0', on ? 'text-primary' : 'text-muted')} />
                  <span className="min-w-0">
                    <span className="block text-[13.5px] font-medium text-ink">{m.label}</span>
                    <span className="block text-[12px] text-muted">{m.description}</span>
                  </span>
                </button>
              )
            })}
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {method === 'M-Pesa' && (
              <Field label="M-Pesa phone number" error={errors.phone} hint={!errors.phone && normalizePhone(s.phone) ? 'Registered name is confirmed by M-Pesa at transfer time' : undefined}>
                <Input value={s.phone} onChange={(e) => set('phone', e.target.value)} placeholder="0712 345 678" inputMode="tel" />
              </Field>
            )}
            {method === 'Till' && (
              <Field label="Till number (Buy Goods)" error={errors.till}>
                <Input value={s.till} onChange={(e) => set('till', e.target.value.replace(/\D/g, ''))} placeholder="123456" inputMode="numeric" maxLength={7} />
              </Field>
            )}
            {method === 'Paybill' && (
              <>
                <Field label="Paybill (business number)" error={errors.paybill}>
                  <Input value={s.paybill} onChange={(e) => set('paybill', e.target.value.replace(/\D/g, ''))} placeholder="222111" inputMode="numeric" maxLength={7} />
                </Field>
                <Field label="Account number" error={errors.paybillAccount}>
                  <Input value={s.paybillAccount} onChange={(e) => set('paybillAccount', e.target.value)} placeholder="e.g. 1001234" />
                </Field>
              </>
            )}
            {method === 'Bank transfer' && (
              <>
                <div>
                  <span className="mb-1.5 block text-[12.5px] font-medium text-ink">Bank</span>
                  <Select value={s.bankName} onChange={(e) => set('bankName', e.target.value)} placeholder="Select bank" aria-label="Bank">
                    {KENYAN_BANKS.map((b) => <option key={b}>{b}</option>)}
                  </Select>
                  {errors.bankName && <span className="mt-1 block text-[12px] text-error">{errors.bankName}</span>}
                </div>
                <Field label="Branch (optional)">
                  <Input value={s.bankBranch} onChange={(e) => set('bankBranch', e.target.value)} placeholder="e.g. Westlands" />
                </Field>
                <Field label="Account name" error={errors.accountName}>
                  <Input value={s.accountName} onChange={(e) => set('accountName', e.target.value)} placeholder={merchant.legalName} />
                </Field>
                <Field label="Account number" error={errors.accountNumber}>
                  <Input value={s.accountNumber} onChange={(e) => set('accountNumber', e.target.value.replace(/[^\d\s]/g, ''))} inputMode="numeric" />
                </Field>
              </>
            )}
          </div>

          {netError && !confirm && <div className="mt-4"><Notice tone="error">{netError}</Notice></div>}
          <div className="mt-6 border-t border-line-soft pt-5">
            <div className="mb-2 text-[12.5px] font-medium text-ink">Payout schedule</div>
            <div role="radiogroup" aria-label="Payout schedule" className="grid gap-2 sm:grid-cols-4">
              {SCHEDULES.map((x) => (
                <button
                  key={x.value}
                  type="button"
                  role="radio"
                  aria-checked={schedule === x.value}
                  onClick={() => setSchedule(x.value)}
                  className={cx('rounded-md border px-3 py-2.5 text-left transition-colors', schedule === x.value ? 'border-primary bg-primary-soft' : 'border-line hover:bg-subtle')}
                >
                  <span className="block text-[13px] font-medium text-ink">{x.value}</span>
                  <span className="block text-[11.5px] text-muted">{x.hint}</span>
                </button>
              ))}
            </div>
            {schedule !== 'Manual' && <p className="mt-2 text-[12px] text-muted">Scheduled payouts send your full available balance when it is at least {fmtKES(data.config.payout.minAmount)}.</p>}
          </div>
        </Card>

        <div className="space-y-4">
          <Card title="Current settlement account">
            <KeyValue rows={[
              ['Method', merchant.payoutMethod],
              ['Paid to', <span className="font-medium">{displayDestination(merchant.payoutMethod, merchant.payoutDestination)}</span>],
              ['Schedule', merchant.payoutSchedule],
              ['Sent via', rail ? `M-Pesa ${rail}` : 'Manual bank transfer'],
              ['Last changed', merchant.settlement?.updatedAt ? fmtDateTime(merchant.settlement.updatedAt) : 'At onboarding'],
            ]} />
          </Card>
          <Card title="Good to know">
            <ul className="space-y-2.5 text-[12.5px] leading-relaxed text-muted">
              <li>Payout fee is {fmtKES(data.config.payout.feeFixed)} per payout; minimum payout is {fmtKES(data.config.payout.minAmount)}.</li>
              <li>M-Pesa, Till and Paybill payouts are limited to {fmtKES(MPESA_TRANSFER_LIMIT)} per transfer.</li>
              <li>Bank payouts are sent manually by Oryne operations.</li>
              <li>Payouts already requested keep the account they were requested with{inFlight ? ` - you have ${inFlight} in progress` : ''}.</li>
            </ul>
          </Card>
        </div>
      </div>

      <Modal
        open={confirm}
        onClose={() => { setConfirm(false); clearError() }}
        size="sm"
        title="Change settlement account?"
        footer={<><Button onClick={() => setConfirm(false)}>Cancel</Button><Button variant="primary" icon={ShieldCheck} loading={pending} onClick={commit}>Confirm change</Button></>}
      >
        <div className="space-y-4">
          <KeyValue rows={[
            ['From', `${merchant.payoutMethod} · ${displayDestination(merchant.payoutMethod, merchant.payoutDestination)}`],
            ['To', <span className="font-medium">{method} · {displayDestination(method, nextDest)}</span>],
          ]} />
          {netError && <Notice tone="error">{netError}</Notice>}
          <Notice tone="warning" title="Simulation only">In production this change would be confirmed with a one-time code sent to your registered phone, and Oryne would be notified. No code is sent in this demo.</Notice>
        </div>
      </Modal>
    </>
  )
}
