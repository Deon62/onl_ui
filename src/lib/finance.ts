// Financial calculation utilities.
//
// Accounting principles applied throughout the platform:
//  - Merchant collections are merchant funds held on their behalf. They are NOT Oryne revenue.
//  - Oryne revenue = transaction fees + SMS alert fees + payout fees + subscriptions + other revenue.
//  - Operating costs = per-transaction provider charges + SMS sending costs + payout transfer costs
//    + recorded expenses.
//  - Per-transaction "allocated" costs (tokens, overheads) are an analytical allocation of recorded
//    expenses for unit economics only. They are never added to operating costs a second time.

import type {
  CostConfig, DataState, Expense, Merchant, Payout, PlatformConfig, PricingPlan, RevenueEntry, SmsTopUp, Transaction, TxStatus,
} from '../types'
import { round2 } from './format'
import { inRange, type DateRange } from './dates'

/** Statuses where the customer's money was received on the collection Till */
export const COLLECTED: TxStatus[] = ['Successful', 'Refunded', 'Reversed']
/** Statuses where the money was subsequently returned to the customer */
export const RETURNED: TxStatus[] = ['Refunded', 'Reversed']
export const OPEN: TxStatus[] = ['Initiated', 'Pending']

export const isCollected = (t: Transaction) => COLLECTED.includes(t.status) && t.merchantId !== null
export const isReturned = (t: Transaction) => RETURNED.includes(t.status)
/** Payment received on the Till but not linked to any merchant (held in suspense) */
export const isSuspense = (t: Transaction) => t.status === 'Unmatched'

/** Oryne fee for a given amount under a pricing plan. Never exceeds the amount. */
export function calcFee(amount: number, p: PricingPlan): number {
  let fee = (amount * p.percentRate) / 100 + p.fixedFee
  if (p.minFee > 0) fee = Math.max(fee, p.minFee)
  if (p.maxFee > 0) fee = Math.min(fee, p.maxFee)
  return round2(Math.min(fee, amount))
}

/** Charge deducted by the payment provider for a collection */
export const calcProviderCharge = (amount: number, c: CostConfig) =>
  round2((amount * c.providerPercent) / 100 + c.providerFixed)

/** Per-transaction analytical cost allocation */
export const allocatedCost = (c: CostConfig) => round2(c.tokenCostPerTx + c.otherCostPerTx)

export const netAmount = (t: Transaction) => round2(t.amount - t.fee)

export function isSettled(t: Transaction, settlementHours: number, now = Date.now()): boolean {
  if (!t.confirmedAt) return false
  return new Date(t.confirmedAt).getTime() + settlementHours * 3_600_000 <= now
}

export interface TxEconomics {
  amount: number
  merchantFee: number
  providerCharge: number
  tokenCost: number
  otherCost: number
  smsFee: number
  smsCost: number
  grossMargin: number
  netContribution: number
  merchantNet: number
  feePercent: number
  marginPercent: number
}

/** Unit economics for a single payment */
export function txEconomics(amount: number, pricing: PricingPlan, costs: CostConfig, sms?: { feePerSms: number; costPerSms: number }): TxEconomics {
  const merchantFee = calcFee(amount, pricing)
  const providerCharge = calcProviderCharge(amount, costs)
  const smsFee = sms ? sms.feePerSms : 0
  const smsCost = sms ? sms.costPerSms : 0
  const grossMargin = round2(merchantFee + smsFee - providerCharge - smsCost)
  const netContribution = round2(grossMargin - costs.tokenCostPerTx - costs.otherCostPerTx)
  return {
    amount,
    merchantFee,
    providerCharge,
    tokenCost: costs.tokenCostPerTx,
    otherCost: costs.otherCostPerTx,
    smsFee,
    smsCost,
    grossMargin,
    netContribution,
    merchantNet: round2(amount - merchantFee),
    feePercent: amount > 0 ? (merchantFee / amount) * 100 : 0,
    marginPercent: merchantFee > 0 ? (netContribution / merchantFee) * 100 : 0,
  }
}

// ---------------------------------------------------------------------------
// Merchant ledger
// ---------------------------------------------------------------------------

export interface MerchantLedger {
  merchantId: string
  collectionCount: number
  /** All payments received for this merchant (incl. later refunded) */
  grossCollections: number
  fees: number
  refunds: number
  /** SMS credit bought with the merchant's available balance */
  smsTopUpsFromBalance: number
  /** grossCollections - fees - refunds */
  netEarned: number
  /** Net amounts confirmed within the settlement window */
  pendingSettlement: number
  /** Payouts completed (amount debited incl. payout fees) */
  paidOut: number
  /** Net amount actually received by merchant */
  paidOutNet: number
  payoutFees: number
  /** Payouts requested but not yet completed */
  payoutsInProgress: number
  /** Funds the merchant can withdraw now */
  available: number
  /** Total Oryne owes the merchant: netEarned - paidOut */
  owed: number
}

type LedgerSource = Pick<DataState, 'transactions' | 'payouts' | 'smsTopUps' | 'config'>

export function merchantLedger(merchantId: string, d: LedgerSource, now = Date.now()): MerchantLedger {
  const { transactions, payouts } = d
  const settlementHours = d.config.settlementHours
  let gross = 0, fees = 0, refunds = 0, pending = 0, count = 0
  for (const t of transactions) {
    if (t.merchantId !== merchantId || !COLLECTED.includes(t.status)) continue
    count++
    gross += t.amount
    fees += t.fee
    if (isReturned(t)) refunds += t.amount
    else if (!isSettled(t, settlementHours, now)) pending += t.amount - t.fee
  }
  let paidOut = 0, paidOutNet = 0, payoutFees = 0, inProgress = 0
  for (const p of payouts) {
    if (p.merchantId !== merchantId) continue
    if (p.status === 'Completed') {
      paidOut += p.amount
      paidOutNet += p.netAmount
      payoutFees += p.fee
    } else if (p.status === 'Pending' || p.status === 'Processing') {
      inProgress += p.amount
    }
  }
  const smsFromBalance = d.smsTopUps.reduce((a, x) => (x.merchantId === merchantId && x.method === 'Balance' ? a + x.amount : a), 0)
  const netEarned = round2(gross - fees - refunds)
  return {
    merchantId,
    collectionCount: count,
    grossCollections: round2(gross),
    fees: round2(fees),
    refunds: round2(refunds),
    smsTopUpsFromBalance: round2(smsFromBalance),
    netEarned,
    pendingSettlement: round2(pending),
    paidOut: round2(paidOut),
    paidOutNet: round2(paidOutNet),
    payoutFees: round2(payoutFees),
    payoutsInProgress: round2(inProgress),
    available: round2(netEarned - pending - paidOut - inProgress - smsFromBalance),
    owed: round2(netEarned - paidOut - smsFromBalance),
  }
}

export function allLedgers(s: DataState, now = Date.now()): Record<string, MerchantLedger> {
  const out: Record<string, MerchantLedger> = {}
  for (const m of s.merchants) out[m.id] = merchantLedger(m.id, s, now)
  return out
}

// ---------------------------------------------------------------------------
// Platform financial summary over a date range
// ---------------------------------------------------------------------------

export interface PlatformSummary {
  processed: number
  processedCount: number
  returned: number
  collected: number
  suspense: number
  suspenseCount: number
  txFees: number
  smsFees: number
  smsCount: number
  payoutFees: number
  otherRevenue: number
  revenue: number
  providerCharges: number
  smsCosts: number
  payoutCosts: number
  expenses: number
  operatingCosts: number
  grossMargin: number
  netProfit: number
  successCount: number
  failedCount: number
  attemptCount: number
  payoutsCompleted: number
  payoutsCompletedNet: number
}

export function platformSummary(
  txs: Transaction[], payouts: Payout[], expenses: Expense[], revenue: RevenueEntry[], range: DateRange, merchantId?: string,
): PlatformSummary {
  let processed = 0, processedCount = 0, returned = 0, suspense = 0, suspenseCount = 0
  let txFees = 0, providerCharges = 0, successCount = 0, failedCount = 0, attemptCount = 0
  let smsFees = 0, smsCosts = 0, smsCount = 0
  for (const t of txs) {
    if (merchantId && t.merchantId !== merchantId) continue
    const when = t.confirmedAt ?? t.initiatedAt
    if (!inRange(when, range)) continue
    attemptCount++
    if (t.status === 'Failed' || t.status === 'Cancelled') failedCount++
    if (isSuspense(t)) {
      suspense += t.amount
      suspenseCount++
      providerCharges += t.providerCharge
      continue
    }
    if (COLLECTED.includes(t.status)) {
      processed += t.amount
      processedCount++
      txFees += t.fee
      providerCharges += t.providerCharge
      smsFees += t.smsFee
      smsCosts += t.smsCost
      if (t.smsFee > 0) smsCount++
      if (isReturned(t)) returned += t.amount
      else successCount++
    }
  }
  let payoutFees = 0, payoutCosts = 0, payoutsCompleted = 0, payoutsCompletedNet = 0
  for (const p of payouts) {
    if (merchantId && p.merchantId !== merchantId) continue
    if (p.status !== 'Completed' || !inRange(p.completedAt, range)) continue
    payoutFees += p.fee
    payoutCosts += p.providerCost
    payoutsCompleted += p.amount
    payoutsCompletedNet += p.netAmount
  }
  const otherRevenue = merchantId
    ? revenue.filter((r) => r.merchantId === merchantId && inRange(r.date, range)).reduce((s, r) => s + r.amount, 0)
    : revenue.filter((r) => inRange(r.date, range)).reduce((s, r) => s + r.amount, 0)
  const exp = merchantId ? 0 : expenses.filter((e) => inRange(e.date, range)).reduce((s, e) => s + e.amount, 0)
  const rev = txFees + smsFees + payoutFees + otherRevenue
  const operatingCosts = providerCharges + smsCosts + payoutCosts + exp
  return {
    processed: round2(processed),
    processedCount,
    returned: round2(returned),
    collected: round2(processed - returned),
    suspense: round2(suspense),
    suspenseCount,
    txFees: round2(txFees),
    smsFees: round2(smsFees),
    smsCount,
    payoutFees: round2(payoutFees),
    otherRevenue: round2(otherRevenue),
    revenue: round2(rev),
    providerCharges: round2(providerCharges),
    smsCosts: round2(smsCosts),
    payoutCosts: round2(payoutCosts),
    expenses: round2(exp),
    operatingCosts: round2(operatingCosts),
    grossMargin: round2(rev - providerCharges - smsCosts - payoutCosts),
    netProfit: round2(rev - operatingCosts),
    successCount,
    failedCount,
    attemptCount,
    payoutsCompleted: round2(payoutsCompleted),
    payoutsCompletedNet: round2(payoutsCompletedNet),
  }
}

// ---------------------------------------------------------------------------
// Collection account (Till) reconciliation - all time
// ---------------------------------------------------------------------------

export interface TillReconciliation {
  receipts: number
  refundsOut: number
  payoutsSent: number
  providerCharges: number
  payoutCosts: number
  held: number
  smsTopUpsReceived: number
  merchantFundsOwed: number
  smsCreditHeld: number
  suspense: number
  oryneShare: number
  difference: number
}

/**
 * Funds held on the collection account must equal:
 *   merchant funds owed + unattributed suspense + Oryne's retained share.
 */
export function tillReconciliation(s: DataState, now = Date.now()): TillReconciliation {
  let receipts = 0, refundsOut = 0, providerCharges = 0, suspense = 0, fees = 0
  for (const t of s.transactions) {
    if (isSuspense(t)) {
      receipts += t.amount
      suspense += t.amount
      providerCharges += t.providerCharge
    } else if (COLLECTED.includes(t.status) && t.merchantId) {
      receipts += t.amount
      fees += t.fee + t.smsFee
      providerCharges += t.providerCharge
      if (isReturned(t)) refundsOut += t.amount
    }
  }
  let payoutsSent = 0, payoutFees = 0, payoutCosts = 0
  for (const p of s.payouts) {
    if (p.status !== 'Completed') continue
    payoutsSent += p.netAmount
    payoutFees += p.fee
    payoutCosts += p.providerCost
  }
  const smsTopUpsReceived = s.smsTopUps.reduce((a, x) => (x.method === 'M-Pesa' ? a + x.amount : a), 0)
  receipts += smsTopUpsReceived
  const smsCreditHeld = s.merchants.reduce((a, m) => a + smsCreditBalance(m.id, s), 0)
  const held = receipts - refundsOut - payoutsSent - providerCharges - payoutCosts
  const ledgers = allLedgers(s, now)
  const merchantFundsOwed = Object.values(ledgers).reduce((a, l) => a + l.owed, 0)
  const oryneShare = fees + payoutFees - providerCharges - payoutCosts
  return {
    receipts: round2(receipts),
    refundsOut: round2(refundsOut),
    payoutsSent: round2(payoutsSent),
    providerCharges: round2(providerCharges),
    payoutCosts: round2(payoutCosts),
    held: round2(held),
    smsTopUpsReceived: round2(smsTopUpsReceived),
    merchantFundsOwed: round2(merchantFundsOwed),
    smsCreditHeld: round2(smsCreditHeld),
    suspense: round2(suspense),
    oryneShare: round2(oryneShare),
    difference: round2(held - (merchantFundsOwed + smsCreditHeld + suspense + oryneShare)),
  }
}

export function payoutQuote(amount: number, cfg: PlatformConfig) {
  const fee = cfg.payout.feeFixed
  return { amount: round2(amount), fee, net: round2(Math.max(0, amount - fee)) }
}

export const merchantPricing = (m: Merchant | undefined, cfg: PlatformConfig) => m?.pricing ?? cfg.defaultPricing

export function describePricing(p: PricingPlan): string {
  const parts = [`${p.percentRate}%`]
  if (p.fixedFee) parts.push(`+ KES ${p.fixedFee}`)
  const bounds: string[] = []
  if (p.minFee) bounds.push(`min KES ${p.minFee}`)
  if (p.maxFee) bounds.push(`max KES ${p.maxFee}`)
  return parts.join(' ') + (bounds.length ? ` (${bounds.join(', ')})` : '')
}

/** Prepaid SMS credit remaining: top-ups less alerts already charged. */
export function smsCreditBalance(merchantId: string, d: Pick<DataState, 'transactions' | 'smsTopUps'>): number {
  let credit = 0
  for (const x of d.smsTopUps) if (x.merchantId === merchantId) credit += x.amount
  for (const t of d.transactions) if (t.merchantId === merchantId) credit -= t.smsFee
  return round2(credit)
}

export function smsTopUpsFor(merchantId: string, topUps: SmsTopUp[]) {
  return topUps.filter((x) => x.merchantId === merchantId)
}

/** Per-payment SMS alert price and Oryne cost if alerts are on (one SMS per recipient). */
export function smsPrice(m: Merchant | undefined, cfg: PlatformConfig): { fee: number; cost: number } {
  if (!m?.smsAlerts.enabled || !m.smsAlerts.recipients.length) return { fee: 0, cost: 0 }
  const n = m.smsAlerts.recipients.length
  return { fee: round2(cfg.sms.feePerSms * n), cost: round2(cfg.sms.costPerSms * n) }
}

/**
 * SMS charge for one payment. Alerts are only sent - and charged - when they are on
 * and the prepaid credit covers them.
 */
export function smsCharge(m: Merchant | undefined, cfg: PlatformConfig, credit: number, at: string | number = Date.now()): { fee: number; cost: number } {
  const price = smsPrice(m, cfg)
  if (!price.fee || credit < price.fee) return { fee: 0, cost: 0 }
  if (m!.smsAlerts.enabledAt && new Date(at).getTime() < new Date(m!.smsAlerts.enabledAt).getTime()) return { fee: 0, cost: 0 }
  return price
}
