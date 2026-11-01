import { useState } from 'react'
import { Copy, Link2, Plus } from 'lucide-react'
import type { PaymentLink } from '../../types'
import { useActions, useStore } from '../../store/AppStore'
import { useMerchantScope } from '../../store/selectors'
import { fmtAmount, fmtDate, fmtKES } from '../../lib/format'
import { DataTable, type Column } from '../shared/DataTable'
import { useAsyncAction } from '../shared/Loading'
import { Button, Card, EmptyState, Field, IconButton, Input, Modal, Mono, Notice, PageHeader, StatCard, StatusBadge, Toggle } from '../shared/ui'

export function PaymentLinksPage() {
  const { data, toast } = useStore()
  const { merchant } = useMerchantScope()
  const actions = useActions()
  const { run, pending, error: netError, clearError } = useAsyncAction()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [fixed, setFixed] = useState(true)
  const [amount, setAmount] = useState('')
  if (!merchant) return null
  const links = data.paymentLinks.filter((l) => l.merchantId === merchant.id)
  const url = (l: PaymentLink) => `https://pay.oryne.network/${l.slug}`

  const copy = (l: PaymentLink) => {
    navigator.clipboard?.writeText(url(l)).catch(() => undefined)
    toast({ tone: 'success', title: 'Link copied', body: url(l) })
  }

  const cols: Column<PaymentLink>[] = [
    { key: 't', header: 'Link', cell: (l) => <div className="leading-tight"><div className="font-medium">{l.title}</div><Mono className="text-[11.5px] text-muted">pay.oryne.network/{l.slug}</Mono></div> },
    { key: 'a', header: 'Amount', align: 'right', cell: (l) => (l.amount ? fmtAmount(l.amount) : <span className="text-muted">Customer enters</span>) },
    { key: 'p', header: 'Payments', align: 'right', cell: (l) => l.payments, hideBelow: 'sm' },
    { key: 'c', header: 'Collected', align: 'right', cell: (l) => fmtAmount(l.collected), hideBelow: 'md' },
    { key: 'd', header: 'Created', cell: (l) => <span className="text-muted">{fmtDate(l.createdAt)}</span>, hideBelow: 'lg' },
    { key: 's', header: 'Status', cell: (l) => <StatusBadge status={l.status} /> },
    {
      key: 'x', header: '', align: 'right', cell: (l) => (
        <span className="inline-flex items-center gap-2">
          <IconButton icon={Copy} label="Copy link" onClick={() => copy(l)} />
          <Toggle checked={l.status === 'Active'} onChange={() => actions.togglePaymentLink(l.id)} label={`${l.status === 'Active' ? 'Disable' : 'Enable'} link`} />
        </span>
      ),
    },
  ]

  const valid = title.trim() && (!fixed || Number(amount) >= 10)
  return (
    <>
      <PageHeader
        title="Payment links"
        description="Shareable checkout links. Each payment made through a link carries your unique merchant reference, so it is attributed to your account automatically."
        actions={<Button variant="primary" icon={Plus} onClick={() => { setTitle(''); setAmount(''); setOpen(true) }}>Create link</Button>}
      />
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatCard label="Active links" value={links.filter((l) => l.status === 'Active').length} hint={`${links.length} total`} />
        <StatCard label="Payments via links" value={links.reduce((s, l) => s + l.payments, 0).toLocaleString()} hint="all time" />
        <StatCard label="Collected via links" value={fmtKES(links.reduce((s, l) => s + l.collected, 0))} hint="all time" />
      </div>
      <Card flush>
        {links.length ? <DataTable columns={cols} rows={links} rowKey={(l) => l.id} /> : <EmptyState icon={Link2} title="No payment links yet" description="Create a link to collect payments without building a checkout." />}
      </Card>
      <Modal
        open={open}
        onClose={() => { setOpen(false); clearError() }}
        size="sm"
        title="Create payment link"
        footer={<><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" disabled={!valid} loading={pending} onClick={async () => { const r = await run(() => actions.createPaymentLink(merchant.id, title.trim(), fixed ? Number(amount) : null)); if (r.ok) setOpen(false) }}>Create link</Button></>}
      >
        <div className="space-y-4">
          <Field label="Title" hint="Shown to the customer on the payment page."><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Weekend rental deposit" autoFocus /></Field>
          <label className="flex items-center justify-between gap-3 text-[13px]"><span>Fixed amount</span><Toggle checked={fixed} onChange={setFixed} label="Fixed amount" /></label>
          {netError && <Notice tone="error">{netError}</Notice>}
          {fixed && <Field label="Amount (KES)" error={amount && Number(amount) < 10 ? 'Minimum KES 10.' : null}><Input type="number" min={10} value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>}
        </div>
      </Modal>
    </>
  )
}
