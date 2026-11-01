import type { CallbackEvent, Transaction } from '../types'

/**
 * Derives the M-Pesa callback stream from transactions.
 * In production these would be persisted raw callback records; here they are
 * reconstructed to demonstrate how callbacks map to internal transactions.
 */
export function deriveCallbacks(txs: Transaction[]): CallbackEvent[] {
  const out: CallbackEvent[] = []
  for (const t of txs) {
    const base = {
      mpesaReceipt: t.mpesaReceipt,
      amount: t.amount,
      phone: t.customerPhone,
      transactionId: t.id,
      merchantId: t.merchantId,
    }
    if (t.status === 'Initiated' || t.status === 'Pending') {
      out.push({ ...base, id: `CB-${t.id}`, receivedAt: t.initiatedAt, reference: t.reference, result: 'Awaiting', resultCode: -1 })
      continue
    }
    const at = t.confirmedAt ?? t.initiatedAt
    if (t.status === 'Unmatched') {
      out.push({ ...base, id: `CB-${t.id}`, receivedAt: at, reference: t.reference || null, result: 'Unmatched', resultCode: 0 })
      continue
    }
    if (t.status === 'Failed' || t.status === 'Cancelled') {
      const code = t.status === 'Cancelled' ? 1032 : t.failureReason?.startsWith('Insufficient') ? 1 : t.failureReason?.startsWith('Request timed') ? 1037 : 2001
      out.push({ ...base, id: `CB-${t.id}`, receivedAt: at, reference: t.reference, result: 'Failed payment', resultCode: code })
      continue
    }
    out.push({ ...base, id: `CB-${t.id}`, receivedAt: at, reference: t.reference, result: 'Matched', resultCode: 0 })
    for (let i = 1; i <= t.duplicateCallbacks; i++) {
      const dup = new Date(new Date(at).getTime() + i * 47_000).toISOString()
      out.push({ ...base, id: `CB-${t.id}-D${i}`, receivedAt: dup, reference: t.reference, result: 'Duplicate ignored', resultCode: 0 })
    }
  }
  return out.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
}

export const LIFECYCLE = [
  'Payment initiated',
  'STK push sent',
  'Payment confirmed',
  'Merchant credited',
  'Available for payout',
  'Paid out',
] as const

/** Index of the furthest lifecycle stage a transaction has reached (-1 = failed before confirmation) */
export function lifecycleStage(t: Transaction, settlementHours: number, paidOutBefore: string | null, now = Date.now()): number {
  if (t.status === 'Initiated') return 0
  if (t.status === 'Pending') return 1
  if (t.status === 'Failed' || t.status === 'Cancelled') return 1
  if (t.status === 'Unmatched') return 2
  if (!t.confirmedAt) return 1
  const settled = new Date(t.confirmedAt).getTime() + settlementHours * 3_600_000 <= now
  if (!settled) return 3
  if (paidOutBefore && new Date(paidOutBefore).getTime() >= new Date(t.confirmedAt).getTime() + settlementHours * 3_600_000) return 5
  return 4
}
