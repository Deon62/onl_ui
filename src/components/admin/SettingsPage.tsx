import { useState } from 'react'
import { Moon, RefreshCw, Sun } from 'lucide-react'
import { useActions, useStore } from '../../store/AppStore'
import { fmtDateTime } from '../../lib/format'
import { API_URL, ROLE_LABEL, type ApiRole } from '../../lib/api'
import { Button, Card, Field, Input, KeyValue, PageHeader, Segmented } from '../shared/ui'
import { ChangePasswordCard } from '../shared/Password'

export function AdminSettingsPage() {
  const { data, theme, toggleTheme, toast, session, refresh } = useStore()
  const actions = useActions()
  const [reloading, setReloading] = useState(false)
  const [hours, setHours] = useState(String(data.config.settlementHours))
  const [callback, setCallback] = useState(data.config.callbackUrl)
  return (
    <>
      <PageHeader title="Settings" description="Platform configuration, your account and appearance." />
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Settlement">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Settlement window (hours)" hint="Time before confirmed collections become available for payout.">
              <Input type="number" min={0} max={168} value={hours} onChange={(e) => setHours(e.target.value)} />
            </Field>
            <Field label="Callback URL" hint="Endpoint receiving M-Pesa callbacks (payments phase).">
              <Input value={callback} onChange={(e) => setCallback(e.target.value)} />
            </Field>
          </div>
          <div className="mt-4 flex justify-end">
            <Button variant="primary" disabled={Number(hours) === data.config.settlementHours && callback === data.config.callbackUrl} onClick={() => actions.updateConfig({ settlementHours: Math.max(0, Number(hours)), callbackUrl: callback }, 'Updated settlement settings')}>Save</Button>
          </div>
        </Card>
        <Card title="Connection">
          <KeyValue rows={[
            ['API', API_URL],
            ['Signed in as', session?.email ?? ''],
            ['Role', session?.apiRole ? ROLE_LABEL[session.apiRole as ApiRole] ?? session.apiRole : ''],
            ['Last loaded', fmtDateTime(data.generatedAt)],
          ]} />
          <div className="mt-4 flex justify-end">
            <Button icon={RefreshCw} loading={reloading} onClick={() => {
              setReloading(true)
              refresh()
                .then(() => toast({ tone: 'success', title: 'Data reloaded' }), (e: Error) => toast({ tone: 'error', title: 'Could not reload', body: e.message }))
                .finally(() => setReloading(false))
            }}>Reload data</Button>
          </div>
        </Card>
        <ChangePasswordCard />
        <Card title="Appearance">
          <div className="flex items-center justify-between gap-4">
            <div><div className="text-[13px] font-medium">Theme</div><div className="text-[12.5px] text-muted">Applies to this browser.</div></div>
            <Segmented value={theme} onChange={(v) => v !== theme && toggleTheme()} options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
          </div>
          <div className="mt-4 flex items-center gap-2 text-[12.5px] text-muted">{theme === 'dark' ? <Moon size={14} /> : <Sun size={14} />} Currently using the {theme} theme.</div>
        </Card>
        <Card title="Company">
          <KeyValue rows={[
            ['Legal entity', 'Oryne Network Limited'],
            ['Product', 'Oryne'],
            ['Currency', 'Kenyan Shilling (KES)'],
            ['Time zone', 'Africa/Nairobi (EAT, UTC+3)'],
            ['Support email', 'support@oryne.network'],
          ]} />
        </Card>
      </div>
    </>
  )
}
