import { useState, type ReactNode } from "react"
import { Check, Download, Link2, Undo2 } from 'lucide-react'
import type { Transaction } from '../../types'
import { useActions, useStore } from '../../store/AppStore'
import { allocatedCost, netAmount } from '../../lib/finance'
import { fmtDateTime, fmtKES, fmtPhone, maskPhone } from '../../lib/format'
import { LIFECYCLE, lifecycleStage } from '../../lib/attribution'
import { downloadFile } from '../../lib/csv'
import { Button, cx, Drawer, KeyValue, Mono, Notice, Select, StatusBadge } from './ui'

export function downloadReceipt(t: Transaction, merchantName: string) {
  const row = (k: string, v: string) => `<tr><td style="padding:6px 0;color:#777D87">${k}</td><td style="padding:6px 0;text-align:right">${v}</td></tr>`
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Receipt ${t.id}</title></head>
<body style="font-family:Inter,Segoe UI,sans-serif;background:#FFFFFF;color:#17191C;padding:40px">
<div style="max-width:440px;margin:auto;background:#FFFFFF;border:1px solid #E5E7EB;border-radius:8px;padding:28px">
<div style="font-size:12px;letter-spacing:.08em;color:#777D87">ORYNE NETWORK - PAYMENT RECEIPT</div>
<div style="margin-top:4px;font-size:11px;color:#B45F06;font-weight:600">DEMO DATA - NOT A VALID RECEIPT</div>
<h2 style="margin:18px 0 4px">${fmtKES(t.amount)}</h2><div style="color:#777D87;font-size:13px">Paid to ${merchantName}</div>
<table style="width:100%;margin-top:20px;font-size:13px;border-collapse:collapse">
${row('Transaction ID', t.id)}${row('Reference', t.reference)}${row('M-Pesa receipt', t.mpesaReceipt ?? '-')}
${row('Customer', maskPhone(t.customerPhone))}${row('Description', t.description)}${row('Status', t.status)}
${row('Date', t.confirmedAt ? fmtDateTime(t.confirmedAt) : fmtDateTime(t.initiatedAt))}
</table><p style="margin-top:24px;font-size:11px;color:#777D87">One network. Every transaction.</p></div></body></html>`
  downloadFile(`receipt-${t.id}.html`, html, 'text/html;charset=utf-8')
}

export function TransactionDrawer({ tx, onClose, mode }: { tx: Transaction | null; onClose: () => void; mode: 'admin' | 'merchant' }) {
  const { data } = useStore()
  const actions = useActions()
  const [assignTo, setAssignTo] = useState('')
  const [confirmRefund, setConfirmRefund] = useState(false)
  // Re-read from state so the drawer reflects live updates (e.g. simulated callbacks)
  const t = tx ? data.transactions.find((x) => x.id === tx.id) ?? tx : null
  if (!t) return null
  const merchant = data.merchants.find((m) => m.id === t.merchantId)
  const settledAt = t.confirmedAt ? new Date(t.confirmedAt).getTime() + data.config.settlementHours * 3_600_000 : null
  const payoutAfter = settledAt
    ? data.payouts
      .filter((p) => p.merchantId === t.merchantId && p.status === 'Completed' && p.completedAt && new Date(p.completedAt).getTime() >= settledAt)
      .sort((a, b) => a.completedAt!.localeCompare(b.completedAt!))[0]
    : undefined
  const stage = lifecycleStage(t, data.config.settlementHours, payoutAfter?.completedAt ?? null)
  const failed = t.status === 'Failed' || t.status === 'Cancelled'
  const collected = ['Successful', 'Refunded', 'Reversed'].includes(t.status)
  const alloc = allocatedCost(data.config.costs)

  return (
    <Drawer
      open
      onClose={() => { setConfirmRefund(false); onClose() }}
      title={<span className="flex items-center gap-2.5">{fmtKES(t.amount)} <StatusBadge status={t.status} /></span>}
      subtitle={<Mono className="text-muted">{t.id}</Mono>}
      footer={
        <>
          {mode === 'admin' && t.status === 'Successful' && (
            confirmRefund ? (
              <>
                <span className="mr-auto self-center text-[12.5px] text-muted">Record a simulated refund?</span>
                <Button onClick={() => setConfirmRefund(false)}>Cancel</Button>
                <Button variant="danger" onClick={() => { actions.refundTransaction(t.id); setConfirmRefund(false) }}>Confirm refund</Button>
              </>
            ) : (
              <Button variant="danger" icon={Undo2} onClick={() => setConfirmRefund(true)}>Refund</Button>
            )
          )}
          {collected && !confirmRefund && (
            <Button icon={Download} onClick={() => downloadReceipt(t, merchant?.name ?? 'Oryne Network')}>Download receipt</Button>
          )}
        </>
      }
    >
      {/* Lifecycle */}
      <div className="mb-6">
        <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Payment lifecycle</div>
        <ol className="space-y-0">
          {LIFECYCLE.map((label, i) => {
            const done = i <= stage && !(failed && i >= 2)
            const isFailStep = failed && i === 2
            const isUnmatchedStep = t.status === 'Unmatched' && i === 3
            return (
              <li key={label} className="relative flex gap-3 pb-3 last:pb-0">
                {i < LIFECYCLE.length - 1 && <span className={cx('absolute left-[9px] top-5 h-[calc(100%-12px)] w-px', done && i < stage ? 'bg-success' : 'bg-line')} />}
                <span
                  className={cx(
                    'relative z-10 flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-full border text-[10px]',
                    done ? 'border-success bg-success text-white' : isFailStep ? 'border-error bg-error-soft text-error' : isUnmatchedStep ? 'border-warning bg-warning-soft text-warning' : 'border-line bg-surface text-faint',
                  )}
                >
                  {done ? <Check size={11} strokeWidth={3} /> : i + 1}
                </span>
                <div className="-mt-0.5 text-[13px]">
                  <span className={cx(done ? 'text-ink' : 'text-muted')}>{isFailStep ? `Payment ${t.status.toLowerCase()}` : isUnmatchedStep ? 'Awaiting attribution' : label}</span>
                  {isFailStep && t.failureReason && <div className="text-[12px] text-error">{t.failureReason}</div>}
                  {i === 4 && done && settledAt && <div className="text-[12px] text-muted">Settled {fmtDateTime(new Date(settledAt))}</div>}
                  {i === 5 && done && payoutAfter && <div className="text-[12px] text-muted">Included in payout {payoutAfter.reference}</div>}
                </div>
              </li>
            )
          })}
        </ol>
      </div>

      {t.status === 'Unmatched' && mode === 'admin' && (
        <div className="mb-6 space-y-3">
          <Notice tone="warning" title="Unmatched Till payment">
            This payment reached the shared Till without a valid internal reference ("{t.reference || 'blank'}"). Funds are held in suspense and
            excluded from every merchant balance until verified. Attribute only after confirming ownership with the merchant and customer.
          </Notice>
          <div className="flex gap-2">
            <Select value={assignTo} onChange={(e) => setAssignTo(e.target.value)} aria-label="Merchant to attribute">
              <option value="">Select merchant...</option>
              {data.merchants.filter((m) => m.status === 'Active').map((m) => <option key={m.id} value={m.id}>{m.name} ({m.id})</option>)}
            </Select>
            <Button variant="primary" icon={Link2} disabled={!assignTo} onClick={() => { actions.attributeTransaction(t.id, assignTo); setAssignTo('') }}>Attribute</Button>
          </div>
        </div>
      )}

      <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Details</div>
      <KeyValue
        rows={[
          ['Internal transaction ID', <Mono>{t.id}</Mono>],
          ['Payment reference', <Mono>{t.reference || '-'}</Mono>],
          ...(mode === 'admin' ? [['Merchant', merchant ? `${merchant.name} (${merchant.id})` : <span className="text-warning">Unattributed</span>], ['Merchant domain', t.domain ?? '-']] as [string, ReactNode][] : []),
          ['M-Pesa receipt', <Mono>{t.mpesaReceipt ?? '-'}</Mono>],
          ...(mode === 'admin' ? [['Provider reference', <Mono className="text-[11.5px]">{t.providerRef ?? '-'}</Mono>]] as [string, ReactNode][] : []),
          ['Customer', <span>{t.customerName}<br /><span className="text-muted">{mode === 'admin' ? maskPhone(t.customerPhone) : fmtPhone(t.customerPhone).replace(/\d{3}$/, '***')}</span></span>],
          ['Channel', t.channel],
          ['Description', t.description],
          ['Attribution', <StatusBadge status={t.attribution} />],
          ['Initiated', fmtDateTime(t.initiatedAt)],
          ['Confirmed', t.confirmedAt ? fmtDateTime(t.confirmedAt) : '-'],
          ...(t.reversedAt ? [[t.status === 'Refunded' ? 'Refunded' : 'Reversed', fmtDateTime(t.reversedAt)]] as [string, string][] : []),
          ...(mode === 'admin' && t.duplicateCallbacks ? [['Duplicate callbacks', `${t.duplicateCallbacks} received and ignored (idempotent on receipt number)`]] as [string, string][] : []),
        ]}
      />

      {(collected || t.status === 'Unmatched') && (
        <>
          <div className="mb-1 mt-6 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Amounts</div>
          <KeyValue
            rows={[
              ['Customer paid', <span className="num">{fmtKES(t.amount)}</span>],
              ['Oryne fee', <span className="num">{fmtKES(t.fee)}</span>],
              ...(t.smsFee ? [['SMS alert (from SMS credit)', <span className="num">{fmtKES(t.smsFee)}</span>]] as [string, ReactNode][] : []),
              ['Merchant net amount', <span className="num font-medium">{t.merchantId ? fmtKES(netAmount(t)) : '-'}</span>],
              ...(t.status === 'Refunded' || t.status === 'Reversed' ? [['Returned to customer', <span className="num text-error">({fmtKES(t.amount)})</span>]] as [string, ReactNode][] : []),
              ...(mode === 'admin'
                ? ([
                  ['Provider charge', <span className="num">{fmtKES(t.providerCharge)}</span>],
                  ...(t.smsCost ? [['SMS sending cost', <span className="num">{fmtKES(t.smsCost)}</span>]] as [string, ReactNode][] : []),
                  ['Oryne gross margin', <span className="num">{fmtKES(t.fee + t.smsFee - t.providerCharge - t.smsCost)}</span>],
                  ['Allocated costs (analytical)', <span className="num text-muted">{fmtKES(alloc)}</span>],
                  ['Net contribution', <span className="num font-medium">{fmtKES(t.fee + t.smsFee - t.providerCharge - t.smsCost - alloc)}</span>],
                ] as [string, ReactNode][])
                : []),
            ]}
          />
        </>
      )}
    </Drawer>
  )
}
