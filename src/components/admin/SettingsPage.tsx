import { useState } from 'react'
import { Moon, RefreshCw, Sun } from 'lucide-react'
import { useActions, useStore } from '../../store/AppStore'
import { fmtDateTime } from '../../lib/format'
import { getNetConfig, pageCache, setNetConfig } from '../../lib/net'
import { API_URL, ROLE_LABEL, type ApiRole } from '../../lib/api'
import { Button, Card, Field, Input, KeyValue, Modal, Notice, PageHeader, Segmented } from '../shared/ui'

export function AdminSettingsPage() {
  const { data, theme, toggleTheme, resetDemo, toast, dataMode, session, refresh } = useStore()
  const [reloading, setReloading] = useState(false)
  const actions = useActions()
  const [hours, setHours] = useState(String(data.config.settlementHours))
  const [callback, setCallback] = useState(data.config.callbackUrl)
  const [confirmReset, setConfirmReset] = useState(false)
  return (
    <>
      <PageHeader title="Settings" description="Platform configuration, appearance and demo data controls." />
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Settlement">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Settlement window (hours)" hint="Time before confirmed collections become available for payout.">
              <Input type="number" min={0} max={168} value={hours} onChange={(e) => setHours(e.target.value)} />
            </Field>
            <Field label="Callback URL" hint="Mock endpoint receiving M-Pesa callbacks.">
              <Input value={callback} onChange={(e) => setCallback(e.target.value)} />
            </Field>
          </div>
          <div className="mt-4 flex justify-end">
            <Button variant="primary" disabled={Number(hours) === data.config.settlementHours && callback === data.config.callbackUrl} onClick={() => actions.updateConfig({ settlementHours: Math.max(0, Number(hours)), callbackUrl: callback }, 'Updated settlement settings')}>Save</Button>
          </div>
        </Card>
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
        {dataMode === 'live' ? (
          <Card title="Live connection">
            <KeyValue rows={[
              ['API', API_URL],
              ['Signed in as', session?.email ?? ''],
              ['Role', session?.apiRole ? ROLE_LABEL[session.apiRole as ApiRole] ?? session.apiRole : ''],
              ['Last loaded', fmtDateTime(data.generatedAt)],
            ]} />
            <div className="mt-4 flex justify-end">
              <Button icon={RefreshCw} loading={reloading} onClick={() => {
                setReloading(true)
                refresh().then(() => toast({ tone: 'success', title: 'Data reloaded' }), (e: Error) => toast({ tone: 'error', title: 'Could not reload', body: e.message })).finally(() => setReloading(false))
              }}>Reload data</Button>
            </div>
          </Card>
        ) : (
          <>
            <Card title="Demo data">
              <Notice tone="warning" title="All data is fictitious">Merchants, customers, transactions and costs are generated locally for demonstration. State is stored in this browser only.</Notice>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[12.5px] text-muted">
                <span>Created {fmtDateTime(data.generatedAt)} · {data.transactions.length.toLocaleString()} transactions</span>
                <Button variant="danger" icon={RefreshCw} onClick={() => setConfirmReset(true)}>Reset demo data</Button>
              </div>
            </Card>
            <NetworkCard />
          </>
        )}
      </div>
      <Modal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        size="sm"
        title="Reset demo data?"
        footer={<><Button onClick={() => setConfirmReset(false)}>Cancel</Button><Button variant="danger" onClick={() => { resetDemo(); setConfirmReset(false); toast({ tone: 'success', title: 'Demo data regenerated' }) }}>Reset</Button></>}
      >
        <p className="text-[13px] text-muted">All changes made in this browser - new merchants, expenses, payouts and configuration - will be discarded and fresh mock data generated.</p>
      </Modal>
    </>
  )
}

const LATENCY = [{ value: '250', label: 'Fast' }, { value: '650', label: 'Normal' }, { value: '2000', label: 'Slow' }]
const FAILURE = [{ value: '0', label: 'None' }, { value: '0.2', label: '20%' }, { value: '0.5', label: '50%' }, { value: '1', label: 'All' }]

/** Preview loading and error states before the real API exists */
function NetworkCard() {
  const { toast } = useStore()
  const [cfg, setCfg] = useState(getNetConfig)
  const apply = (next: typeof cfg) => { setCfg(next); setNetConfig(next) }
  return (
    <Card title="Network simulation">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div><div className="text-[13px] font-medium">Response time</div><div className="text-[12.5px] text-muted">How long pages and actions take to load.</div></div>
          <Segmented value={String(cfg.latency)} onChange={(v) => apply({ ...cfg, latency: Number(v) })} options={LATENCY} />
        </div>
        <div className="flex items-center justify-between gap-4">
          <div><div className="text-[13px] font-medium">Failed requests</div><div className="text-[12.5px] text-muted">Share of requests that fail, to preview error states.</div></div>
          <Segmented value={String(cfg.failureRate)} onChange={(v) => apply({ ...cfg, failureRate: Number(v) })} options={FAILURE} />
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-line-soft pt-4 text-[12.5px] text-muted">
        <span>Pages load once per session; replay clears that cache.</span>
        <Button size="sm" onClick={() => { pageCache.clear(); toast({ tone: 'info', title: 'Loading states will replay on your next page visit' }) }}>Replay loading</Button>
      </div>
    </Card>
  )
}
