import { useMemo, useState } from 'react'
import { MessageSquare, Plus, X } from 'lucide-react'
import type { Merchant } from '../../types'
import { useActions, useStore } from '../../store/AppStore'
import { fmtKES, fmtPhone, normalizePhone } from '../../lib/format'
import { Badge, Button, Card, Input, Toggle } from './ui'

const MAX_RECIPIENTS = 3

/** Optional paid SMS alerts sent to the merchant whenever a customer payment is received. */
export function SmsAlertsPanel({ merchant }: { merchant: Merchant }) {
  const { data } = useStore()
  const actions = useActions()
  const [enabled, setEnabled] = useState(merchant.smsAlerts.enabled)
  const [recipients, setRecipients] = useState(
    merchant.smsAlerts.recipients.length ? merchant.smsAlerts.recipients : [merchant.phone],
  )
  const [draft, setDraft] = useState('')
  const fee = data.config.sms.feePerSms

  const usage = useMemo(() => {
    const start = new Date()
    start.setDate(1)
    start.setHours(0, 0, 0, 0)
    let count = 0, charges = 0
    for (const t of data.transactions) {
      if (t.merchantId !== merchant.id || !t.smsFee || !t.confirmedAt || new Date(t.confirmedAt) < start) continue
      count++
      charges += t.smsFee
    }
    return { count, charges }
  }, [data.transactions, merchant.id])

  const draftPhone = normalizePhone(draft)
  const dirty = enabled !== merchant.smsAlerts.enabled || JSON.stringify(recipients) !== JSON.stringify(merchant.smsAlerts.recipients)

  return (
    <Card
      title={<span className="flex items-center gap-2"><MessageSquare size={15} strokeWidth={1.75} /> SMS payment alerts</span>}
      subtitle="Get an SMS each time a customer payment is received."
      actions={merchant.smsAlerts.enabled ? <Badge tone="success">On</Badge> : <Badge>Off</Badge>}
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-[13px] font-medium">Send SMS alerts</div>
          <div className="text-[12.5px] text-muted">{fmtKES(fee)} per SMS, per recipient. Paid from prepaid SMS credit.</div>
        </div>
        <Toggle checked={enabled} onChange={setEnabled} label="SMS payment alerts" />
      </div>

      {enabled && (
        <div className="mt-4 border-t border-line-soft pt-4">
          <div className="mb-2 text-[12.5px] font-medium">Recipients</div>
          <ul className="space-y-1.5">
            {recipients.map((r) => (
              <li key={r} className="flex items-center justify-between rounded-[4px] border border-line bg-surface px-3 py-1.5 text-[13px]">
                <span className="num">{fmtPhone(r)}</span>
                <button aria-label={`Remove ${r}`} className="text-faint hover:text-error" onClick={() => setRecipients(recipients.filter((x) => x !== r))}><X size={14} /></button>
              </li>
            ))}
          </ul>
          {recipients.length < MAX_RECIPIENTS && (
            <div className="mt-2 flex gap-2">
              <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="0712 345 678" aria-label="Add recipient" />
              <Button icon={Plus} disabled={!draftPhone || recipients.includes(draftPhone)} onClick={() => { setRecipients([...recipients, draftPhone!]); setDraft('') }}>Add</Button>
            </div>
          )}
          <p className="mt-2 text-[12px] text-muted">
            Each payment costs {fmtKES(fee * Math.max(1, recipients.length))} with {recipients.length || 1} recipient{recipients.length === 1 ? '' : 's'}.
          </p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line-soft pt-4">
        <span className="num text-[12.5px] text-muted">This month: {usage.count} payments alerted · {fmtKES(usage.charges)}</span>
        <Button variant="primary" disabled={!dirty || (enabled && recipients.length === 0)} onClick={() => actions.updateSmsAlerts(merchant.id, enabled, enabled ? recipients : merchant.smsAlerts.recipients)}>Save</Button>
      </div>
    </Card>
  )
}
