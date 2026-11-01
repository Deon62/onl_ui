import { useState } from 'react'
import { useActions } from '../../store/AppStore'
import { useMerchantScope } from '../../store/selectors'
import { describePricing } from '../../lib/finance'
import { fmtDate, fmtPhone, normalizePhone } from '../../lib/format'
import { Button, Card, Field, Input, KeyValue, Mono, Notice, PageHeader, StatusBadge } from '../shared/ui'

export function BusinessProfilePage() {
  const { merchant } = useMerchantScope()
  const actions = useActions()
  const [f, setF] = useState(() => ({ contactName: merchant?.contactName ?? '', phone: merchant?.phone ? '0' + merchant.phone.slice(3) : '', location: merchant?.location ?? '', industry: merchant?.industry ?? '' }))
  if (!merchant) return null
  const phoneOk = !!normalizePhone(f.phone)
  const dirty = f.contactName !== merchant.contactName || normalizePhone(f.phone) !== merchant.phone || f.location !== merchant.location || f.industry !== merchant.industry
  return (
    <>
      <PageHeader title="Business profile" description="Your registered business details with Oryne Network." />
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Registration" subtitle="Changes to these details require verification by Oryne">
          <KeyValue rows={[
            ['Business name', merchant.name],
            ['Legal name', merchant.legalName],
            ['Merchant ID', <Mono>{merchant.id}</Mono>],
            ['Approved domain', merchant.domain],
            ['Business email', merchant.email],
            ['Account status', <StatusBadge status={merchant.status} />],
            ['Registered', fmtDate(merchant.registeredAt)],
            ['Pricing', describePricing(merchant.pricing)],
            ['Plan', merchant.subscription],
          ]} />
        </Card>
        <Card title="Contact details">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Primary contact"><Input value={f.contactName} onChange={(e) => setF({ ...f, contactName: e.target.value })} /></Field>
            <Field label="Phone number" error={!phoneOk ? 'Enter a valid Kenyan number.' : null} hint={fmtPhone(merchant.phone)}><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
            <Field label="Industry"><Input value={f.industry} onChange={(e) => setF({ ...f, industry: e.target.value })} /></Field>
            <Field label="Location"><Input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /></Field>
          </div>
          <div className="mt-5 flex justify-end">
            <Button variant="primary" disabled={!dirty || !phoneOk || !f.contactName.trim()} onClick={() => void actions.updateProfile(merchant.id, { contactName: f.contactName.trim(), phone: normalizePhone(f.phone)!, location: f.location, industry: f.industry })}>Save changes</Button>
          </div>
          <div className="mt-5"><Notice>To change your business name, domain, email or payout destination, contact support@oryne.network.</Notice></div>
        </Card>
      </div>
    </>
  )
}
