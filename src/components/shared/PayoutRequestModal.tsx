import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, ShieldCheck } from 'lucide-react'
import type { Merchant, Payout } from '../../types'
import { useActions, useStore } from '../../store/AppStore'
import { useMerchantLedger } from '../../store/selectors'
import { payoutQuote } from '../../lib/finance'
import { fmtKES } from '../../lib/format'
import { displayDestination, isMobileMoney, MPESA_TRANSFER_LIMIT } from '../../lib/settlement'
import { useAsyncAction } from './Loading'
import { Button, Field, Input, KeyValue, Modal, Mono, Notice, Statement } from './ui'

type Step = 'form' | 'confirm' | 'done'

export function PayoutRequestModal({ merchant, open, onClose, initiatedBy = 'Merchant' }: { merchant: Merchant; open: boolean; onClose: () => void; initiatedBy?: Payout['initiatedBy'] }) {
  const { data } = useStore()
  const actions = useActions()
  const ledger = useMerchantLedger(merchant.id)!
  const [step, setStep] = useState<Step>('form')
  const [amount, setAmount] = useState('')
  const [result, setResult] = useState<Payout | null>(null)
  const [error, setError] = useState<string | null>(null)

  const value = Number(amount)
  const quote = payoutQuote(value || 0, data.config)
  const min = data.config.payout.minAmount
  const isMpesa = isMobileMoney(merchant.payoutMethod)
  const destNorm = merchant.payoutDestination.trim() || null
  const destText = displayDestination(merchant.payoutMethod, merchant.payoutDestination)
  const amountError = !amount ? null
    : !Number.isFinite(value) || value <= 0 ? 'Enter a valid amount.'
      : value < min ? `Minimum payout is ${fmtKES(min)}.`
        : value > ledger.available ? 'Amount exceeds your available balance.'
          : isMpesa && value > MPESA_TRANSFER_LIMIT ? `M-Pesa payouts are limited to ${fmtKES(MPESA_TRANSFER_LIMIT)} per transfer.`
            : null
  const canContinue = !!amount && !amountError && !!destNorm && merchant.status === 'Active'

  const close = () => {
    onClose()
    window.setTimeout(() => { setStep('form'); setAmount(''); setResult(null); setError(null); clearError() }, 200)
  }

  const { run, pending, error: netError, clearError } = useAsyncAction()
  const submit = async () => {
    const r = await run(() => actions.requestPayout(merchant.id, value, destNorm!, initiatedBy))
    if (!r.ok) return
    const p = r.value
    if (!p) return setError('The payout could not be created. Your balance may have changed - please review and try again.')
    setResult(p)
    setStep('done')
  }

  return (
    <Modal
      open={open}
      onClose={close}
      size="sm"
      title={step === 'done' ? 'Payout requested' : step === 'confirm' ? 'Confirm payout' : 'Request payout'}
      description={step === 'form' ? merchant.name : undefined}
      footer={
        step === 'form' ? (
          <><Button onClick={close}>Cancel</Button><Button variant="primary" disabled={!canContinue} onClick={() => setStep('confirm')}>Review payout</Button></>
        ) : step === 'confirm' ? (
          <><Button icon={ArrowLeft} onClick={() => setStep('form')}>Back</Button><Button variant="primary" icon={ShieldCheck} loading={pending} onClick={submit}>Confirm payout</Button></>
        ) : (
          <Button variant="primary" onClick={close}>Done</Button>
        )
      }
    >
      {step === 'form' && (
        <div className="space-y-4">
          <div className="rounded-md border border-line bg-surface px-4 py-3">
            <div className="text-[12px] text-muted">Available balance</div>
            <div className="num mt-0.5 text-[20px] font-semibold">{fmtKES(ledger.available)}</div>
            {ledger.pendingSettlement > 0 && <div className="mt-0.5 text-[12px] text-muted">{fmtKES(ledger.pendingSettlement)} still settling - not yet withdrawable</div>}
          </div>
          {merchant.status !== 'Active' && <Notice tone="error">Payouts are disabled while the account is {merchant.status.toLowerCase()}.</Notice>}
          <Field label="Amount to withdraw (KES)" error={amountError}>
            <div className="flex gap-2">
              <Input type="number" inputMode="decimal" min={min} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" autoFocus />
              <Button onClick={() => setAmount(String(Math.floor(Math.min(ledger.available, isMpesa ? MPESA_TRANSFER_LIMIT : Infinity) * 100) / 100))} disabled={ledger.available < min}>Max</Button>
            </div>
          </Field>
          <div className="flex items-center justify-between gap-3 rounded-md border border-line px-4 py-3">
            <div className="min-w-0">
              <div className="text-[12px] text-muted">Paid to · {merchant.payoutMethod}</div>
              <div className="truncate text-[13.5px] font-medium text-ink">{destNorm ? destText : 'No settlement account set'}</div>
            </div>
            {initiatedBy === 'Merchant' && <Link to="/merchant/settlement" onClick={close} className="shrink-0 text-[12.5px] font-medium text-primary hover:underline">Change</Link>}
          </div>
          <Statement lines={[
            { label: 'Withdrawal amount', value: fmtKES(quote.amount) },
            { label: 'Payout fee', value: fmtKES(value > 0 ? quote.fee : 0), kind: 'less' },
            { label: 'You will receive', value: fmtKES(value > 0 ? quote.net : 0), kind: 'total' },
          ]} />
        </div>
      )}
      {step === 'confirm' && (
        <div className="space-y-4">
          <KeyValue rows={[
            ['Amount debited from balance', <span className="num">{fmtKES(quote.amount)}</span>],
            ['Payout fee', <span className="num">{fmtKES(quote.fee)}</span>],
            ['Net amount sent', <span className="num font-semibold">{fmtKES(quote.net)}</span>],
            ['Method', merchant.payoutMethod],
            ['Destination', destText],
            ['Balance after payout', <span className="num">{fmtKES(ledger.available - quote.amount)}</span>],
          ]} />
          <Notice tone="warning" title="Not live yet">Payout requests open with the payments phase. No money is transferred yet.</Notice>
          {(error || netError) && <Notice tone="error">{error || netError}</Notice>}
        </div>
      )}
      {step === 'done' && result && (
        <div className="py-2 text-center">
          <CheckCircle2 size={36} strokeWidth={1.5} className="mx-auto text-success" />
          <div className="num mt-3 text-[20px] font-semibold">{fmtKES(result.netAmount)}</div>
          <div className="mt-1 text-[13px] text-muted">is queued for payout to {displayDestination(result.method, result.destination)}</div>
          <div className="mt-4 inline-block rounded-[5px] border border-line bg-surface px-3 py-1.5 text-[12.5px]">Reference <Mono>{result.reference}</Mono></div>
        </div>
      )}
    </Modal>
  )
}
