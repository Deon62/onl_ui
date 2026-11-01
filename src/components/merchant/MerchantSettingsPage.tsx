import { useState } from 'react'
import { useStore } from '../../store/AppStore'
import { useMerchantScope } from '../../store/selectors'
import { Button, Card, PageHeader, Segmented, Toggle } from '../shared/ui'
import { ChangePasswordCard } from '../shared/Password'

const PREFS = [
  ['payment', 'Payment received', 'Email for every successful payment'],
  ['daily', 'Daily summary', 'Collections and fees summary each morning'],
  ['payout', 'Payout updates', 'When a payout is approved, completed or fails'],
  ['security', 'Security alerts', 'New sign-ins and payout destination changes'],
] as const

export function MerchantSettingsPage() {
  const { theme, toggleTheme, toast } = useStore()
  const { merchant } = useMerchantScope()
  const [prefs, setPrefs] = useState<Record<string, boolean>>({ payment: false, daily: true, payout: true, security: true })
  if (!merchant) return null
  return (
    <>
      <PageHeader title="Settings" description="Notifications, password and appearance." />
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Email notifications" subtitle={`Sent to ${merchant.email}`}>
          <ul className="divide-y divide-line-soft">
            {PREFS.map(([k, label, desc]) => (
              <li key={k} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <div><div className="text-[13px] font-medium">{label}</div><div className="text-[12.5px] text-muted">{desc}</div></div>
                <Toggle checked={prefs[k]} onChange={(v) => setPrefs({ ...prefs, [k]: v })} label={label} />
              </li>
            ))}
          </ul>
          <div className="mt-4 flex justify-end"><Button variant="primary" onClick={() => toast({ tone: 'success', title: 'Preferences saved' })}>Save preferences</Button></div>
        </Card>
        <div className="space-y-4">
          <ChangePasswordCard />
          <Card title="Appearance">
            <div className="flex items-center justify-between gap-4">
              <span className="text-[13px]">Theme</span>
              <Segmented value={theme} onChange={(v) => v !== theme && toggleTheme()} options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
            </div>
          </Card>
        </div>
      </div>
    </>
  )
}
