import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ExternalLink, Inbox, UserPlus, XCircle } from 'lucide-react'
import type { AccessRequest, Merchant } from '../../types'
import { useActions, useStore } from '../../store/AppStore'
import { fmtDateTime, fmtPhone, fmtRelative, normalizePhone } from '../../lib/format'
import type { LoginIssued } from '../../lib/api'
import { DataTable, type Column } from '../shared/DataTable'
import { Button, Card, Field, Input, KeyValue, MerchantAvatar, Modal, Notice, PageHeader, SearchInput, Segmented, Select, StatusBadge, Textarea, Toggle } from '../shared/ui'
import { CredentialsModal } from '../shared/Password'

type Filter = 'New' | 'Approved' | 'Rejected' | 'All'

/** "Request access" submissions from the sign-in page: review, set up the merchant account, issue the login. */
export function RequestsPage() {
  const { data } = useStore()
  const navigate = useNavigate()
  const [filter, setFilter] = useState<Filter>('New')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<AccessRequest | null>(null)
  const [setup, setSetup] = useState<AccessRequest | null>(null)
  const [issued, setIssued] = useState<{ login: LoginIssued; business: string; merchantId: string } | null>(null)

  const all = useMemo(() => data.accessRequests ?? [], [data.accessRequests])
  const counts = useMemo(() => ({
    New: all.filter((r) => r.status === 'New').length,
    Approved: all.filter((r) => r.status === 'Approved').length,
    Rejected: all.filter((r) => r.status === 'Rejected').length,
    All: all.length,
  }), [all])
  const rows = useMemo(() => {
    const n = q.trim().toLowerCase()
    return all.filter((r) => (filter === 'All' || r.status === filter) && (!n || `${r.business} ${r.name} ${r.email} ${r.domain} ${r.phone}`.toLowerCase().includes(n)))
  }, [all, filter, q])

  const cols: Column<AccessRequest>[] = [
    {
      key: 'business', header: 'Business', sort: (r) => r.business,
      cell: (r) => (
        <div className="flex items-center gap-3">
          <MerchantAvatar name={r.business} />
          <div className="leading-tight">
            <div className="font-medium">{r.business}</div>
            <div className="text-[12px] text-muted">{r.domain || 'No website given'}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'contact', header: 'Contact', hideBelow: 'md',
      cell: (r) => <div className="leading-tight"><div>{r.name}</div><div className="text-[12px] text-muted">{r.email} · {fmtPhone(r.phone)}</div></div>,
    },
    { key: 'volume', header: 'Monthly volume', cell: (r) => <span className="text-muted">{r.volume}</span>, hideBelow: 'lg' },
    { key: 'at', header: 'Submitted', sort: (r) => r.at, cell: (r) => <span className="text-muted">{fmtRelative(r.at)}</span>, hideBelow: 'sm' },
    { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
  ]

  return (
    <>
      <PageHeader title="Merchant Requests" description="Businesses that asked for access from the sign-in page." />
      <Card flush>
        <div className="flex flex-col gap-2.5 border-b border-line-soft px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <SearchInput value={q} onChange={setQ} placeholder="Search business, contact, email or website" className="sm:w-[340px]" />
          <Segmented<Filter>
            size="sm"
            value={filter}
            onChange={setFilter}
            options={(['New', 'Approved', 'Rejected', 'All'] as const).map((f) => ({ value: f, label: `${f} ${counts[f]}` }))}
          />
        </div>
        <DataTable
          columns={cols}
          rows={rows}
          rowKey={(r) => r.id}
          onRowClick={setOpen}
          emptyTitle={filter === 'New' ? 'No requests waiting' : 'No requests'}
          emptyDescription={filter === 'New' ? 'New requests from the sign-in page appear here.' : 'Nothing matches this filter.'}
        />
      </Card>

      {open && (
        <RequestModal
          request={open}
          onClose={() => setOpen(null)}
          onSetup={() => { setSetup(open); setOpen(null) }}
          onOpenMerchant={(id) => navigate(`/admin/merchants/${id}`)}
        />
      )}
      {setup && (
        <SetupAccountModal
          request={setup}
          onClose={() => setSetup(null)}
          onDone={(merchant, login) => { setSetup(null); setIssued({ login, business: merchant.name, merchantId: merchant.id }) }}
        />
      )}
      {issued && (
        <CredentialsModal login={issued.login} business={issued.business} onClose={() => { navigate(`/admin/merchants/${issued.merchantId}`); setIssued(null) }} />
      )}
    </>
  )
}

function RequestModal({ request: r, onClose, onSetup, onOpenMerchant }: {
  request: AccessRequest; onClose: () => void; onSetup: () => void; onOpenMerchant: (merchantId: string) => void
}) {
  const actions = useActions()
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const site = r.domain ? `https://${r.domain}` : null

  const reject = async () => {
    setBusy(true)
    const ok = await actions.rejectAccessRequest(r.id, reason.trim())
    setBusy(false)
    if (ok) onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={r.business}
      description={`Requested ${fmtDateTime(r.at)}`}
      footer={r.status !== 'New'
        ? <>{r.merchantId && <Button onClick={() => onOpenMerchant(r.merchantId!)}>Open merchant</Button>}<Button variant="primary" onClick={onClose}>Close</Button></>
        : rejecting
          ? <><Button onClick={() => setRejecting(false)}>Back</Button><Button variant="danger" loading={busy} onClick={() => void reject()}>Reject request</Button></>
          : <><Button icon={XCircle} onClick={() => setRejecting(true)}>Reject</Button><Button variant="primary" icon={UserPlus} onClick={onSetup}>Set up account</Button></>}
    >
      {rejecting ? (
        <Field label="Reason (optional, for the activity log)">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Business type not supported yet" autoFocus />
        </Field>
      ) : (
        <div className="space-y-4">
          <KeyValue rows={[
            ['Status', <StatusBadge key="s" status={r.status} />],
            ['Website', site ? <a key="w" href={site} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-primary hover:underline">{r.domain} <ExternalLink size={12} /></a> : 'Not given'],
            ['Contact', r.name],
            ['Email', r.email],
            ['Phone', fmtPhone(r.phone)],
            ['Monthly volume', r.volume],
            ...(r.reviewedBy ? [['Reviewed', `${r.reviewedBy} · ${r.reviewedAt ? fmtDateTime(r.reviewedAt) : ''}`] as [string, string]] : []),
          ]} />
          {r.message && <div className="rounded-md border border-line-soft bg-subtle/60 px-4 py-3 text-[13px] leading-relaxed text-muted">"{r.message}"</div>}
          {r.status === 'New' && (
            <Notice icon={Inbox} title="Next step">Check the website, then set up the account. Oryne creates their login and emails them a temporary password.</Notice>
          )}
        </div>
      )}
    </Modal>
  )
}

function SetupAccountModal({ request: r, onClose, onDone }: {
  request: AccessRequest; onClose: () => void; onDone: (merchant: Merchant, login: LoginIssued) => void
}) {
  const { data } = useStore()
  const actions = useActions()
  const d = data.config.defaultPricing
  const [f, setF] = useState({
    name: r.business, legalName: r.business, domain: r.domain, industry: '', email: r.email, phone: r.phone, contactName: r.name,
    location: 'Nairobi', status: 'Active' as Merchant['status'], payoutSchedule: 'Weekly' as Merchant['payoutSchedule'],
    percentRate: String(d.percentRate), fixedFee: String(d.fixedFee), minFee: String(d.minFee), maxFee: String(d.maxFee),
  })
  const [sendEmail, setSendEmail] = useState(true)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [apiError, setApiError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }))

  const submit = async () => {
    const e: Record<string, string> = {}
    if (f.name.trim().length < 2) e.name = 'Business name is required.'
    if (!/^\S+@\S+\.\S+$/.test(f.email)) e.email = 'Enter a valid email address.'
    if (!normalizePhone(f.phone)) e.phone = 'Enter a valid Kenyan phone number.'
    if (f.domain && !/^([a-z0-9-]+\.)+[a-z]{2,}$/i.test(f.domain.trim())) e.domain = 'Enter a domain like shop.co.ke'
    const pricing = { percentRate: Number(f.percentRate), fixedFee: Number(f.fixedFee), minFee: Number(f.minFee), maxFee: Number(f.maxFee) }
    if (!(pricing.percentRate >= 0 && pricing.percentRate <= 10)) e.percentRate = 'Between 0% and 10%.'
    if (pricing.maxFee > 0 && pricing.maxFee < pricing.minFee) e.maxFee = 'Must be at least the minimum.'
    setErrors(e)
    if (Object.keys(e).length) return
    setApiError(null)
    setSaving(true)
    try {
      const res = await actions.approveAccessRequest(r.id, {
        name: f.name.trim(), legalName: f.legalName.trim() || f.name.trim(), domain: f.domain.trim().toLowerCase(), industry: f.industry,
        email: f.email.trim().toLowerCase(), phone: normalizePhone(f.phone)!, contactName: f.contactName.trim(), location: f.location,
        status: f.status, payoutSchedule: f.payoutSchedule, pricing,
      }, sendEmail)
      onDone(res.merchant, res.login)
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Could not set up the account.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`Set up ${r.business}`}
      description="Pre-filled from the request. Adjust anything, then create the account and their login."
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" icon={UserPlus} loading={saving} onClick={() => void submit()}>Create account & login</Button></>}
    >
      <div className="space-y-6">
        {apiError && <Notice tone="error" title="Could not create the account">{apiError}</Notice>}
        <section>
          <h3 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">Business</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Business name" error={errors.name}><Input value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
            <Field label="Registered legal name"><Input value={f.legalName} onChange={(e) => set('legalName', e.target.value)} /></Field>
            <Field label="Website domain" error={errors.domain} hint="Payments from this site are attributed to this merchant."><Input value={f.domain} onChange={(e) => set('domain', e.target.value)} /></Field>
            <Field label="Industry"><Input value={f.industry} onChange={(e) => set('industry', e.target.value)} placeholder="e.g. Food & beverage" /></Field>
            <Field label="Location"><Input value={f.location} onChange={(e) => set('location', e.target.value)} /></Field>
            <Field label="Status">
              <Select value={f.status} onChange={(e) => set('status', e.target.value)}><option>Active</option><option>Pending Review</option></Select>
            </Field>
          </div>
        </section>
        <section>
          <h3 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">Owner login</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Login email" error={errors.email} hint="They sign in with this. Login details are sent here."><Input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></Field>
            <Field label="Contact name"><Input value={f.contactName} onChange={(e) => set('contactName', e.target.value)} /></Field>
            <Field label="Phone" error={errors.phone}><Input value={f.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
          </div>
        </section>
        <section>
          <h3 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">Pricing & payouts</h3>
          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="Fee %" error={errors.percentRate}><Input type="number" step="0.05" min={0} max={10} value={f.percentRate} onChange={(e) => set('percentRate', e.target.value)} /></Field>
            <Field label="Fixed (KES)"><Input type="number" min={0} value={f.fixedFee} onChange={(e) => set('fixedFee', e.target.value)} /></Field>
            <Field label="Min (KES)"><Input type="number" min={0} value={f.minFee} onChange={(e) => set('minFee', e.target.value)} /></Field>
            <Field label="Max (KES)" error={errors.maxFee} hint="0 = no cap"><Input type="number" min={0} value={f.maxFee} onChange={(e) => set('maxFee', e.target.value)} /></Field>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Payout schedule">
              <Select value={f.payoutSchedule} onChange={(e) => set('payoutSchedule', e.target.value)}>
                <option>Manual</option><option>Daily</option><option>Weekly</option><option>Monthly</option>
              </Select>
            </Field>
          </div>
        </section>
        <div className="flex items-center justify-between gap-4 border-t border-line-soft pt-4">
          <div>
            <div className="text-[13px] font-medium text-ink">Email login details</div>
            <div className="text-[12.5px] text-muted">Sends {f.email || 'them'} a welcome email with a temporary password. You can also copy it on the next screen.</div>
          </div>
          <Toggle checked={sendEmail} onChange={setSendEmail} label="Email login details" />
        </div>
      </div>
    </Modal>
  )
}
