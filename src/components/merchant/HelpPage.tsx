import { useState } from 'react'
import { ChevronDown, LifeBuoy, Mail, Phone } from 'lucide-react'
import { useStore } from '../../store/AppStore'
import { useMerchantScope } from '../../store/selectors'
import { Button, Card, cx, Field, Input, PageHeader, Select, Textarea } from '../shared/ui'

const FAQ: [string, string][] = [
  ['When does money become available for payout?', 'Successful payments are credited to your pending balance immediately and move to your available balance after the settlement window (currently 24 hours). This allows time for reversals and reconciliation.'],
  ['What is the difference between collections and my available balance?', 'Collections are the total paid by your customers. Your available balance is collections less Oryne fees, refunds, amounts still settling and previous payouts.'],
  ['How does Oryne know a payment belongs to my business?', 'Oryne runs your checkout and payment links. Every payment gets a unique reference tied to your Merchant ID before the M-Pesa prompt is sent, and is matched on that reference when M-Pesa confirms it. You do not need to integrate anything.'],
  ['How do SMS payment alerts work?', 'Top up SMS credit on the SMS Alerts page, then switch alerts on. Each SMS is charged per recipient from your credit. When credit runs out, alerts pause until you top up.'],
  ['A customer paid the Till directly. What happens?', 'Payments without a valid reference cannot be attributed automatically. They are held in suspense until Oryne verifies the payer with you, then credited to your account.'],
  ['How are fees calculated?', 'A percentage of each successful payment, subject to minimum and maximum limits shown on your Business Profile. Payouts carry a fixed payout fee, and optional SMS alerts are charged per SMS.'],
]

export function HelpPage() {
  const { toast } = useStore()
  const { merchant } = useMerchantScope()
  const [open, setOpen] = useState<number | null>(0)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [topic, setTopic] = useState('Payments')
  if (!merchant) return null
  return (
    <>
      <PageHeader title="Help & support" description="Answers to common questions and a direct line to the Oryne team." />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card flush title="Frequently asked questions">
          <ul className="divide-y divide-line-soft">
            {FAQ.map(([q, a], i) => (
              <li key={q}>
                <button onClick={() => setOpen(open === i ? null : i)} className="flex w-full items-center justify-between gap-4 px-5 py-3.5 text-left text-[13px] font-medium hover:bg-subtle/60" aria-expanded={open === i}>
                  {q}
                  <ChevronDown size={15} className={cx('shrink-0 text-muted transition-transform', open === i && 'rotate-180')} />
                </button>
                {open === i && <p className="px-5 pb-4 text-[13px] leading-relaxed text-muted">{a}</p>}
              </li>
            ))}
          </ul>
        </Card>
        <div className="space-y-4">
          <Card title="Contact support">
            <div className="space-y-4">
              <Field label="Topic">
                <Select value={topic} onChange={(e) => setTopic(e.target.value)}><option>Payments</option><option>Payouts</option><option>SMS alerts</option><option>Account</option><option>Other</option></Select>
              </Field>
              <Field label="Subject"><Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Briefly describe the issue" /></Field>
              <Field label="Message"><Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Include transaction IDs or references where relevant" /></Field>
              <div className="flex justify-end">
                <Button variant="primary" icon={LifeBuoy} disabled={!subject.trim() || !body.trim()} onClick={() => { toast({ tone: 'success', title: 'Support request sent (demo)', body: `Ticket ORY-SUP-${Math.floor(1000 + Math.random() * 9000)} created for ${merchant.name}.` }); setSubject(''); setBody('') }}>Send request</Button>
              </div>
            </div>
          </Card>
          <Card title="Other ways to reach us">
            <ul className="space-y-3 text-[13px]">
              <li className="flex items-center gap-2.5"><Mail size={15} className="text-muted" /> support@oryne.network</li>
              <li className="flex items-center gap-2.5"><Phone size={15} className="text-muted" /> +254 700 000 000 (Mon-Sat, 8am-8pm EAT)</li>
            </ul>
          </Card>
        </div>
      </div>
    </>
  )
}
