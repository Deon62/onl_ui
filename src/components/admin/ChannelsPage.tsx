import { useMemo, type ReactNode } from "react"
import { Radio, Smartphone, Link2, Landmark } from 'lucide-react'
import { useStore } from '../../store/AppStore'
import { rangeFromPreset, inRange } from '../../lib/dates'
import { COLLECTED } from '../../lib/finance'
import { fmtInt, fmtKES, fmtPct } from '../../lib/format'
import { Badge, Card, KeyValue, Mono, Notice, PageHeader } from '../shared/ui'
import type { Channel } from '../../types'

export function ChannelsPage() {
  const { data } = useStore()
  const stats = useMemo(() => {
    const r = rangeFromPreset('30d')
    const out: Record<Channel, { attempts: number; success: number; volume: number }> = {
      'STK Push': { attempts: 0, success: 0, volume: 0 }, 'Payment Link': { attempts: 0, success: 0, volume: 0 }, 'Till (Direct)': { attempts: 0, success: 0, volume: 0 },
    }
    for (const t of data.transactions) {
      if (!inRange(t.initiatedAt, r)) continue
      const s = out[t.channel]
      s.attempts++
      if (COLLECTED.includes(t.status) || t.status === 'Unmatched') { s.success++; s.volume += t.amount }
    }
    return out
  }, [data.transactions])

  const channels: { name: Channel; icon: typeof Radio; desc: string }[] = [
    { name: 'STK Push', icon: Smartphone, desc: 'M-Pesa prompt sent to the customer from the Oryne-hosted checkout.' },
    { name: 'Payment Link', icon: Link2, desc: 'Hosted Oryne payment page that triggers an STK push with the merchant reference.' },
    { name: 'Till (Direct)', icon: Landmark, desc: 'Customers paying the Till manually. No reference - requires manual attribution.' },
  ]

  return (
    <>
      <PageHeader title="Payment channels" description="Collection rails and provider connections. All channels settle into the Oryne business Till." />
      <div className="mb-6"><Notice tone="warning" title="Prototype - no live connections">Daraja, PayHero and Safaricom integrations are mocked. No API calls, STK pushes or transfers are made from this application.</Notice></div>
      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        {[
          ['M-Pesa Daraja API', 'Mock / Not connected', [['Environment', 'Sandbox (mock)'], ['Shortcode type', 'Business Till (Buy Goods)'], ['Collection Till', <Mono>{data.config.tillNumberMasked}</Mono>], ['Callback URL', <Mono className="text-[11.5px]">{data.config.callbackUrl}</Mono>]]],
          ['PayHero', 'Mock / Not connected', [['Role', 'Payment provider (optional)'], ['Token balance', 'Not available'], ['Charge model', 'Configured in Fees & Charges'], ['Status', 'Awaiting credentials']]],
          ['M-Pesa B2C payouts', 'Mock / Not connected', [['Use', 'Merchant payouts'], ['Per-transfer limit', 'KES 250,000'], ['Transfer cost (mock)', fmtKES(data.config.payout.providerCost)], ['Bank payouts', 'Manual via treasury']]],
        ].map(([title, status, rows]) => (
          <Card key={title as string} title={title as string} actions={<Badge tone="neutral">{status as string}</Badge>}>
            <KeyValue rows={rows as [string, ReactNode][]} />
          </Card>
        ))}
      </div>
      <Card flush title="Channel performance" subtitle="Last 30 days">
        <ul className="divide-y divide-line-soft">
          {channels.map((ch) => {
            const s = stats[ch.name]
            return (
              <li key={ch.name} className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))] md:items-center">
                <div className="flex gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[5px] border border-line bg-surface"><ch.icon size={15} strokeWidth={1.75} className="text-muted" /></span>
                  <div><div className="text-[13px] font-medium">{ch.name}</div><div className="text-[12.5px] text-muted">{ch.desc}</div></div>
                </div>
                <div className="text-[12.5px]"><div className="text-muted">Attempts</div><div className="num font-medium">{fmtInt(s.attempts)}</div></div>
                <div className="text-[12.5px]"><div className="text-muted">Success rate</div><div className="num font-medium">{fmtPct(s.attempts ? (s.success / s.attempts) * 100 : 0)}</div></div>
                <div className="text-[12.5px]"><div className="text-muted">Volume</div><div className="num font-medium">{fmtKES(s.volume)}</div></div>
              </li>
            )
          })}
        </ul>
      </Card>
    </>
  )
}
