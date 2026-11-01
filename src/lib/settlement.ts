import type { Merchant, PayoutMethod, SettlementDetails } from '../types'
import { fmtPhone, normalizePhone } from './format'

export const PAYOUT_METHODS: { value: PayoutMethod; label: string; description: string }[] = [
  { value: 'M-Pesa', label: 'M-Pesa number', description: 'Sent to a phone via M-Pesa B2C' },
  { value: 'Till', label: 'Till number', description: 'Buy Goods Till via M-Pesa B2B' },
  { value: 'Paybill', label: 'Paybill', description: 'Business number + account via M-Pesa B2B' },
  { value: 'Bank transfer', label: 'Bank account', description: 'Transferred manually by Oryne' },
]

export const KENYAN_BANKS = [
  'Absa Bank Kenya', 'Co-operative Bank', 'Diamond Trust Bank', 'Equity Bank', 'Family Bank', 'I&M Bank',
  'KCB Bank', 'NCBA Bank', 'Stanbic Bank', 'Standard Chartered',
]

/** Paid automatically over M-Pesa (B2C for phones, B2B for Till / Paybill). Bank transfers are manual. */
export const isMobileMoney = (m: PayoutMethod) => m !== 'Bank transfer'
export const automatedRail = (m: PayoutMethod) => (m === 'M-Pesa' ? 'B2C' : m === 'Bank transfer' ? null : 'B2B')
/** Per-transfer limit applied to M-Pesa rails in this prototype */
export const MPESA_TRANSFER_LIMIT = 250_000

export const emptySettlement = (): SettlementDetails => ({
  phone: '', till: '', paybill: '', paybillAccount: '', bankName: '', bankBranch: '', accountName: '', accountNumber: '', updatedAt: null,
})

/** Structured settlement details; older records only carry payoutMethod + payoutDestination, so derive from those. */
export function getSettlement(m: Merchant): SettlementDetails {
  if (m.settlement) return m.settlement
  const s = emptySettlement()
  const d = m.payoutDestination
  if (m.payoutMethod === 'M-Pesa') s.phone = d
  else if (m.payoutMethod === 'Till') s.till = d.replace(/\D/g, '')
  else if (m.payoutMethod === 'Paybill') {
    const [pb, acc] = d.split('·').map((x) => x.trim())
    s.paybill = (pb ?? '').replace(/\D/g, '')
    s.paybillAccount = (acc ?? '').replace(/^Acc\s*/i, '')
  } else {
    const [bank, acc] = d.split(' - ')
    s.bankName = KENYAN_BANKS.find((b) => b.startsWith((bank ?? '').trim())) ?? (bank ?? '').trim()
    s.accountName = m.legalName
    s.accountNumber = (acc ?? '').replace(/\D/g, '')
  }
  return s
}

/** The stored destination string for a method (phones as 2547XXXXXXXX, others display-ready). */
export function destinationFor(method: PayoutMethod, s: SettlementDetails): string {
  switch (method) {
    case 'M-Pesa': return normalizePhone(s.phone) ?? s.phone
    case 'Till': return `Till ${s.till}`
    case 'Paybill': return `Paybill ${s.paybill} · Acc ${s.paybillAccount}`
    case 'Bank transfer': return `${s.bankName} - A/C ****${s.accountNumber.slice(-4)}`
  }
}

export function displayDestination(method: PayoutMethod, destination: string): string {
  return method === 'M-Pesa' ? fmtPhone(destination) : destination
}

export function validateSettlement(method: PayoutMethod, s: SettlementDetails): Record<string, string> {
  const e: Record<string, string> = {}
  if (method === 'M-Pesa' && !normalizePhone(s.phone)) e.phone = 'Enter a valid Safaricom number, e.g. 0712 345 678.'
  if (method === 'Till' && !/^\d{5,7}$/.test(s.till.trim())) e.till = 'Till numbers are 5 to 7 digits.'
  if (method === 'Paybill') {
    if (!/^\d{5,7}$/.test(s.paybill.trim())) e.paybill = 'Paybill numbers are 5 to 7 digits.'
    if (!s.paybillAccount.trim()) e.paybillAccount = 'Enter the account number.'
  }
  if (method === 'Bank transfer') {
    if (!s.bankName) e.bankName = 'Select a bank.'
    if (!s.accountName.trim()) e.accountName = 'Enter the account name.'
    if (!/^\d{6,20}$/.test(s.accountNumber.replace(/\s/g, ''))) e.accountNumber = 'Enter 6 to 20 digits.'
  }
  return e
}
