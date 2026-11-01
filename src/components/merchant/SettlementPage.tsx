import { useState } from 'react'
import { Building2, Landmark, Plus, Smartphone, Star, Store, Trash2, Wallet } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Merchant, PayoutAccount, PayoutMethod, PayoutSchedule, SettlementDetails } from '../../types'
import { useActions, useStore } from '../../store/AppStore'
import { useMerchantScope } from '../../store/selectors'
import { fmtDate, fmtKES, normalizePhone } from '../../lib/format'
import { automatedRail, displayDestination, emptySettlement, KENYAN_BANKS, PAYOUT_METHODS, validateSettlement } from '../../lib/settlement'
import { useAsyncAction } from '../shared/Loading'
import { Badge, Button, Card, cx, EmptyState, Field, IconButton, Input, Modal, Notice, PageHeader, Select } from '../shared/ui'

const ICONS: Record<PayoutMethod, LucideIcon> = { 'M-Pesa': Smartphone, Till: Store, Paybill: Building2, 'Bank transfer': Landmark }
const METHOD_LABEL: Record<PayoutMethod, string> = { 'M-Pesa': 'M-Pesa', Till: 'Till', Paybill: 'Paybill', 'Bank transfer': 'Bank' }

const SCHEDULES: { value: PayoutSchedule; hint: string }[] = [
  { value: 'Manual', hint: 'When you request' },
  { value: 'Daily', hint: 'Mon to Sat' },
  { value: 'Weekly', hint: 'Every Monday' },
  { value: 'Monthly', hint: 'On the 1st' },
]

export function SettlementPage() {
  const { merchant } = useMerchantScope()
  if (!merchant) return null
  return <Settlement key={merchant.id} merchant={merchant} />
}

function Settlement({ merchant }: { merchant: Merchant }) {
  const { data } = useStore()
  const actions = useActions()
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<PayoutAccount | null>(null)
  const accounts = merchant.payoutAccounts ?? []
  const locked = merchant.status === 'Suspended'

  return (
    <>
      <PageHeader
        title="Settlement"
        actions={<Button variant="primary" icon={Plus} disabled={locked || accounts.length >= 5} onClick={() => setAdding(true)}>Add account</Button>}
      />
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <Card flush title="Payout accounts" subtitle={accounts.length ? 'Payouts go to the default account.' : undefined}>
          {accounts.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title="No payout account yet"
              description="Add the M-Pesa number, Till, Paybill or bank account you want to be paid to."
              action={<Button variant="primary" icon={Plus} disabled={locked} onClick={() => setAdding(true)}>Add account</Button>}
            />
          ) : (
            <ul className="divide-y divide-line-soft">
              {accounts.map((a) => <AccountRow key={a.id} merchant={merchant} account={a} locked={locked} onRemove={() => setRemoving(a)} />)}
            </ul>
          )}
        </Card>

        <div className="space-y-4">
          <ScheduleCard merchant={merchant} locked={locked} />
          <Card title="Good to know">
            <ul className="space-y-2 text-[12.5px] leading-relaxed text-muted">
              <li>{fmtKES(data.config.payout.feeFixed)} per payout · minimum {fmtKES(data.config.payout.minAmount)}.</li>
              <li>M-Pesa, Till and Paybill are paid automatically; banks manually by Oryne.</li>
            </ul>
          </Card>
        </div>
      </div>

      {adding && <AddAccountModal merchant={merchant} first={accounts.length === 0} onClose={() => setAdding(false)} />}
      {removing && (
        <RemoveModal
          account={removing}
          onClose={() => setRemoving(null)}
          onConfirm={() => actions.removePayoutAccount(merchant.id, removing.id)}
        />
      )}
    </>
  )
}

function AccountRow({ merchant, account: a, locked, onRemove }: { merchant: Merchant; account: PayoutAccount; locked: boolean; onRemove: () => void }) {
  const actions = useActions()
  const { toast } = useStore()
  const { run, pending } = useAsyncAction()
  const Icon = ICONS[a.method]
  const makeDefault = async () => {
    const r = await run(() => actions.setDefaultPayoutAccount(merchant.id, a.id))
    if (!r.ok) toast({ tone: 'error', title: 'Could not change default account' })
  }
  return (
    <li className="flex items-center gap-3 px-5 py-3.5">
      <div className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-md border', a.isDefault ? 'border-primary/30 bg-primary-soft' : 'border-line bg-surface')}>
        <Icon size={16} strokeWidth={1.75} className={a.isDefault ? 'text-primary' : 'text-muted'} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-[13.5px] font-medium text-ink">{displayDestination(a.method, a.destination)}</span>
          {a.isDefault && <Badge tone="info">Default</Badge>}
        </div>
        <div className="mt-0.5 text-[12px] text-muted">
          {METHOD_LABEL[a.method]}
          {a.method === 'Bank transfer' && a.details.accountName ? ` · ${a.details.accountName}` : ''}
          {a.createdAt ? ` · added ${fmtDate(a.createdAt)}` : ''}
        </div>
      </div>
      {!a.isDefault && (
        <Button size="sm" icon={Star} loading={pending} disabled={locked} onClick={makeDefault}>Make default</Button>
      )}
      <IconButton icon={Trash2} label={`Remove ${a.destination}`} disabled={locked} onClick={onRemove} />
    </li>
  )
}

function ScheduleCard({ merchant, locked }: { merchant: Merchant; locked: boolean }) {
  const actions = useActions()
  const [saving, setSaving] = useState<PayoutSchedule | null>(null)
  const pick = async (s: PayoutSchedule) => {
    if (s === merchant.payoutSchedule || saving) return
    setSaving(s)
    await actions.setPayoutSchedule(merchant.id, s)
    setSaving(null)
  }
  return (
    <Card title="Payout schedule">
      <div role="radiogroup" aria-label="Payout schedule" className="grid grid-cols-2 gap-2">
        {SCHEDULES.map((x) => {
          const on = (saving ?? merchant.payoutSchedule) === x.value
          return (
            <button
              key={x.value}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={locked || Boolean(saving)}
              onClick={() => pick(x.value)}
              className={cx('rounded-md border px-3 py-2 text-left transition-colors disabled:opacity-60', on ? 'border-primary bg-primary-soft' : 'border-line hover:bg-subtle')}
            >
              <span className="block text-[13px] font-medium text-ink">{x.value}</span>
              <span className="block text-[11.5px] text-muted">{x.hint}</span>
            </button>
          )
        })}
      </div>
    </Card>
  )
}

function AddAccountModal({ merchant, first, onClose }: { merchant: Merchant; first: boolean; onClose: () => void }) {
  const actions = useActions()
  const [method, setMethod] = useState<PayoutMethod>('M-Pesa')
  const [s, setS] = useState<SettlementDetails>(emptySettlement)
  const [makeDefault, setMakeDefault] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const { run, pending, error } = useAsyncAction()

  const set = (k: keyof SettlementDetails, v: string) => {
    setS((p) => ({ ...p, [k]: v }))
    if (errors[k]) setErrors((e) => ({ ...e, [k]: '' }))
  }

  const save = async () => {
    const e = validateSettlement(method, s)
    setErrors(e)
    if (Object.keys(e).length) return
    const clean = { ...s, phone: normalizePhone(s.phone) ?? '', accountNumber: s.accountNumber.replace(/\s/g, '') }
    const r = await run(() => actions.addPayoutAccount(merchant.id, method, clean, makeDefault))
    if (r.ok) onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Add payout account"
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={pending} onClick={save}>Save</Button></>}
    >
      <div className="space-y-4">
        <div role="radiogroup" aria-label="Account type" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {PAYOUT_METHODS.map((m) => {
            const Icon = ICONS[m.value]
            const on = method === m.value
            return (
              <button
                key={m.value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => { setMethod(m.value); setErrors({}) }}
                className={cx('flex flex-col items-center gap-1.5 rounded-md border px-2 py-3 text-[12.5px] font-medium transition-colors', on ? 'border-primary bg-primary-soft text-ink' : 'border-line text-muted hover:bg-subtle')}
              >
                <Icon size={17} strokeWidth={1.75} className={on ? 'text-primary' : 'text-muted'} />
                {METHOD_LABEL[m.value]}
              </button>
            )
          })}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {method === 'M-Pesa' && (
            <Field label="M-Pesa phone number" error={errors.phone}>
              <Input autoFocus value={s.phone} onChange={(e) => set('phone', e.target.value)} placeholder="0712 345 678" inputMode="tel" />
            </Field>
          )}
          {method === 'Till' && (
            <Field label="Till number" error={errors.till}>
              <Input autoFocus value={s.till} onChange={(e) => set('till', e.target.value.replace(/\D/g, ''))} placeholder="123456" inputMode="numeric" maxLength={7} />
            </Field>
          )}
          {method === 'Paybill' && (
            <>
              <Field label="Paybill number" error={errors.paybill}>
                <Input autoFocus value={s.paybill} onChange={(e) => set('paybill', e.target.value.replace(/\D/g, ''))} placeholder="222111" inputMode="numeric" maxLength={7} />
              </Field>
              <Field label="Account number" error={errors.paybillAccount}>
                <Input value={s.paybillAccount} onChange={(e) => set('paybillAccount', e.target.value)} placeholder="e.g. 1001234" />
              </Field>
            </>
          )}
          {method === 'Bank transfer' && (
            <>
              <div>
                <span className="mb-1.5 block text-[12.5px] font-medium text-ink">Bank</span>
                <Select value={s.bankName} onChange={(e) => set('bankName', e.target.value)} placeholder="Select bank" aria-label="Bank">
                  {KENYAN_BANKS.map((b) => <option key={b}>{b}</option>)}
                </Select>
                {errors.bankName && <span className="mt-1 block text-[12px] text-error">{errors.bankName}</span>}
              </div>
              <Field label="Branch (optional)">
                <Input value={s.bankBranch} onChange={(e) => set('bankBranch', e.target.value)} placeholder="e.g. Westlands" />
              </Field>
              <Field label="Account name" error={errors.accountName}>
                <Input value={s.accountName} onChange={(e) => set('accountName', e.target.value)} placeholder={merchant.legalName} />
              </Field>
              <Field label="Account number" error={errors.accountNumber}>
                <Input value={s.accountNumber} onChange={(e) => set('accountNumber', e.target.value.replace(/[^\d\s]/g, ''))} inputMode="numeric" />
              </Field>
            </>
          )}
        </div>

        {!first && (
          <label className="flex items-center gap-2 text-[13px] text-ink">
            <input type="checkbox" checked={makeDefault} onChange={(e) => setMakeDefault(e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />
            Make this the default payout account
          </label>
        )}
        {automatedRail(method) === null && <p className="text-[12px] text-muted">Bank payouts are sent manually by Oryne.</p>}
        {error && <Notice tone="error">{error}</Notice>}
      </div>
    </Modal>
  )
}

function RemoveModal({ account, onClose, onConfirm }: { account: PayoutAccount; onClose: () => void; onConfirm: () => Promise<void> }) {
  const { run, pending, error } = useAsyncAction()
  const go = async () => {
    const r = await run(onConfirm)
    if (r.ok) onClose()
  }
  return (
    <Modal
      open
      size="sm"
      onClose={onClose}
      title="Remove payout account?"
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="danger" loading={pending} onClick={go}>Remove</Button></>}
    >
      <p className="text-[13px] text-muted">
        <span className="font-medium text-ink">{displayDestination(account.method, account.destination)}</span> will be removed.
        {account.isDefault ? ' Your next account becomes the default.' : ''}
      </p>
      {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
    </Modal>
  )
}
