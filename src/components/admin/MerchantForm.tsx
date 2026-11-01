import { useState } from 'react'
import type { Merchant } from '../../types'
import { useActions, useStore } from '../../store/AppStore'
import { normalizePhone } from '../../lib/format'
import { Button, Field, Input, Modal, Notice, Select } from '../shared/ui'

type FormState = Omit<Merchant, 'id' | 'registeredAt' | 'referencePrefix'>

const empty = (defaults: Merchant['pricing']): FormState => ({
  name: '', legalName: '', domain: '', email: '', phone: '', contactName: '', industry: '', location: 'Nairobi',
  status: 'Pending Review', pricing: { ...defaults }, payoutSchedule: 'Weekly', payoutMethod: 'M-Pesa', payoutDestination: '', subscription: 'None',
  smsAlerts: { enabled: false, recipients: [], enabledAt: null },
})

export function MerchantFormModal({ open, onClose, merchant }: { open: boolean; onClose: () => void; merchant?: Merchant | null }) {
  const { data } = useStore()
  const actions = useActions()
  const [f, setF] = useState<FormState>(() => (merchant ? { ...merchant, pricing: { ...merchant.pricing } } : empty(data.config.defaultPricing)))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }))
  const setP = (k: keyof FormState['pricing'], v: string) => setF((s) => ({ ...s, pricing: { ...s.pricing, [k]: Number(v) } }))

  const validate = () => {
    const e: Record<string, string> = {}
    if (!f.name.trim()) e.name = 'Business name is required.'
    const domain = f.domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) e.domain = 'Enter a valid domain, e.g. example.co.ke'
    else if (data.merchants.some((m) => m.domain === domain && m.id !== merchant?.id)) e.domain = 'This domain is already registered to another merchant.'
    if (!/^\S+@\S+\.\S+$/.test(f.email)) e.email = 'Enter a valid email address.'
    else if (data.merchants.some((m) => m.email.toLowerCase() === f.email.toLowerCase() && m.id !== merchant?.id)) e.email = 'This email is already in use.'
    const phone = normalizePhone(f.phone)
    if (!phone) e.phone = 'Enter a valid Kenyan phone number.'
    if (f.pricing.percentRate < 0 || f.pricing.percentRate > 10) e.percentRate = 'Rate must be between 0% and 10%.'
    if (f.pricing.maxFee > 0 && f.pricing.maxFee < f.pricing.minFee) e.maxFee = 'Maximum must be greater than minimum.'
    if (f.payoutMethod === 'M-Pesa' && f.payoutDestination && !normalizePhone(f.payoutDestination)) e.payoutDestination = 'Enter a valid M-Pesa number.'
    setErrors(e)
    return Object.keys(e).length === 0 ? { domain, phone: phone! } : null
  }

  const save = async () => {
    const ok = validate()
    if (!ok) return
    const dest = f.payoutMethod === 'M-Pesa' ? normalizePhone(f.payoutDestination) ?? ok.phone : f.payoutDestination || 'Pending - set by merchant'
    const payload: FormState = { ...f, domain: ok.domain, phone: ok.phone, legalName: f.legalName || f.name, payoutDestination: dest, contactName: f.contactName || f.name, settlement: undefined }
    setSaving(true)
    const saved = merchant ? await actions.updateMerchant(merchant.id, payload, 'Edited merchant details') : await actions.createMerchant(payload)
    setSaving(false)
    if (saved) onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={merchant ? `Edit ${merchant.name}` : 'Create merchant account'}
      description={merchant ? `${merchant.id} · registered domain ${merchant.domain}` : 'Onboard a new business onto the shared collection rail.'}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={saving} onClick={() => void save()}>{merchant ? 'Save changes' : 'Create merchant'}</Button></>}
    >
      <div className="space-y-6">
        <section>
          <h3 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">Business</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Business name" error={errors.name}><Input value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Kilele Foods" /></Field>
            <Field label="Registered legal name"><Input value={f.legalName} onChange={(e) => set('legalName', e.target.value)} placeholder="Kilele Foods Limited" /></Field>
            <Field label="Website domain" error={errors.domain} hint="Where Oryne embeds the hosted checkout for this merchant."><Input value={f.domain} onChange={(e) => set('domain', e.target.value)} placeholder="kilelefoods.co.ke" /></Field>
            <Field label="Industry"><Input value={f.industry} onChange={(e) => set('industry', e.target.value)} placeholder="Food & beverage" /></Field>
            <Field label="Business email" error={errors.email}><Input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} placeholder="accounts@business.co.ke" /></Field>
            <Field label="Phone number" error={errors.phone}><Input value={f.phone} onChange={(e) => set('phone', e.target.value)} placeholder="0712 345 678" /></Field>
            <Field label="Primary contact"><Input value={f.contactName} onChange={(e) => set('contactName', e.target.value)} /></Field>
            <Field label="Location"><Input value={f.location} onChange={(e) => set('location', e.target.value)} /></Field>
            {!merchant && (
              <Field label="Initial status">
                <Select value={f.status} onChange={(e) => set('status', e.target.value as Merchant['status'])}>
                  <option>Pending Review</option><option>Active</option>
                </Select>
              </Field>
            )}
          </div>
        </section>

        <section>
          <h3 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">Pricing</h3>
          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="Fee rate (%)" error={errors.percentRate}><Input type="number" step="0.05" min={0} value={f.pricing.percentRate} onChange={(e) => setP('percentRate', e.target.value)} /></Field>
            <Field label="Fixed fee (KES)"><Input type="number" min={0} value={f.pricing.fixedFee} onChange={(e) => setP('fixedFee', e.target.value)} /></Field>
            <Field label="Minimum fee"><Input type="number" min={0} value={f.pricing.minFee} onChange={(e) => setP('minFee', e.target.value)} /></Field>
            <Field label="Maximum fee" error={errors.maxFee} hint="0 = no cap"><Input type="number" min={0} value={f.pricing.maxFee} onChange={(e) => setP('maxFee', e.target.value)} /></Field>
            <Field label="Subscription" className="sm:col-span-2">
              <Select value={f.subscription} onChange={(e) => set('subscription', e.target.value)}>
                {data.config.subscriptionPlans.map((p) => <option key={p.name} value={p.name}>{p.name}{p.monthlyFee ? ` - KES ${p.monthlyFee.toLocaleString()}/month` : ''}</option>)}
              </Select>
            </Field>
          </div>
        </section>

        <section>
          <h3 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">Payouts</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Schedule">
              <Select value={f.payoutSchedule} onChange={(e) => set('payoutSchedule', e.target.value as Merchant['payoutSchedule'])}>
                <option>Manual</option><option>Daily</option><option>Weekly</option><option>Monthly</option>
              </Select>
            </Field>
            <Field label="Method">
              <Select value={f.payoutMethod} onChange={(e) => set('payoutMethod', e.target.value as Merchant['payoutMethod'])}>
                <option>M-Pesa</option><option>Till</option><option>Paybill</option><option>Bank transfer</option>
              </Select>
            </Field>
            <Field label="Destination" error={errors.payoutDestination} hint={f.payoutMethod === 'M-Pesa' ? 'Defaults to business phone' : 'Merchants can change this on their Settlement page'}>
              <Input value={f.payoutDestination} onChange={(e) => set('payoutDestination', e.target.value)} placeholder={f.payoutMethod === 'M-Pesa' ? '0712 345 678' : f.payoutMethod === 'Till' ? 'Till 123456' : f.payoutMethod === 'Paybill' ? 'Paybill 222111 · Acc 1001' : 'KCB Bank - A/C ****1234'} />
            </Field>
          </div>
        </section>
        {merchant && <Notice>Fee changes apply to new transactions only. Fees already charged on historical transactions are never recalculated.</Notice>}
      </div>
    </Modal>
  )
}
