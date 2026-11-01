// Deterministic mock data generator. Produces a fully reconciling data set:
// every fee, provider charge, payout and balance is derived from the same
// configurable pricing and cost structures used by the rest of the app.

import type {
  ActivityLog, DataState, Expense, ExpenseCategory, Notification, PaymentLink, Payout, RevenueEntry, Transaction, TxStatus,
} from '../types'
import { createRng, randomCode, type Rng } from '../lib/rng'
import { calcFee, calcProviderCharge, isReturned, smsCharge } from '../lib/finance'
import type { SmsTopUp } from '../types'
import { round2 } from '../lib/format'
import { DAY, startOfDay } from '../lib/dates'
import { defaultConfig, FIRST_NAMES, LAST_NAMES, merchantSeeds } from './merchants'

export const DATA_VERSION = 5
const HISTORY_DAYS = 100

const FAILURES: [string, number][] = [
  ['Insufficient M-Pesa balance', 4],
  ['Request timed out - customer did not respond', 3],
  ['Invalid M-Pesa PIN entered', 2],
  ['Transaction limit exceeded', 1],
]

function phone(rng: Rng): string {
  const prefix = rng.pick(['7', '7', '7', '1'])
  return '254' + prefix + String(rng.int(10_000_000, 99_999_999))
}

function hourOfDay(rng: Rng): number {
  // Weighted toward business hours, East Africa Time.
  return rng.weighted<number>([
    [6, 1], [7, 3], [8, 6], [9, 8], [10, 9], [11, 9], [12, 8], [13, 8], [14, 8], [15, 8], [16, 8], [17, 7],
    [18, 7], [19, 6], [20, 5], [21, 3], [22, 2], [23, 1],
  ])
}

function roundAmount(a: number): number {
  if (a >= 10_000) return Math.round(a / 100) * 100
  if (a >= 1_000) return Math.round(a / 50) * 50
  return Math.round(a / 10) * 10
}

export function generateData(): DataState {
  const rng = createRng(20261101)
  const now = Date.now()
  const today = startOfDay(new Date(now)).getTime()
  const cfg = structuredClone(defaultConfig)
  const merchants = merchantSeeds.map(({ profile: _p, ...m }) => m)
  const txs: Transaction[] = []
  let seq = 0
  const nextId = () => `TXN${String(++seq).padStart(6, '0')}${randomCode(3, rng.next)}`

  // ---- Transactions ------------------------------------------------------
  for (const seed of merchantSeeds) {
    const regDay = startOfDay(new Date(seed.registeredAt)).getTime()
    const startDay = Math.max(regDay + 3 * DAY, today - HISTORY_DAYS * DAY)
    for (let day = startDay; day <= today; day += DAY) {
      const dow = new Date(day).getDay()
      const weekday = dow === 0 ? 0.65 : dow === 6 ? 0.85 : 1
      const age = (today - day) / DAY
      const growth = 0.75 + 0.35 * (1 - age / HISTORY_DAYS) // gradual growth over time
      const count = rng.poisson(seed.profile.dailyVolume * weekday * growth)
      for (let i = 0; i < count; i++) {
        const initiated = day + hourOfDay(rng) * 3_600_000 + rng.int(0, 3_599_999)
        if (initiated > now) continue
        const amount = roundAmount(rng.logUniform(seed.profile.minAmount, seed.profile.maxAmount))
        const ageMin = (now - initiated) / 60_000
        let status: TxStatus
        if (ageMin < 3) status = rng.pick<TxStatus>(['Initiated', 'Pending'])
        else if (ageMin < 45 && rng.chance(0.25)) status = 'Pending'
        else {
          status = rng.weighted<TxStatus>([
            ['Successful', 880], ['Failed', 62], ['Cancelled', 40], ['Refunded', 12], ['Reversed', 6],
          ])
          if ((status === 'Refunded' || status === 'Reversed') && age < 3) status = 'Successful'
        }
        const collected = status === 'Successful' || status === 'Refunded' || status === 'Reversed'
        const confirmedAt = collected || status === 'Failed' || status === 'Cancelled'
          ? new Date(initiated + rng.int(8, 75) * 1000).toISOString()
          : null
        const name = `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`
        const sms = collected ? smsCharge(seed, cfg, Infinity, initiated) : { fee: 0, cost: 0 }
        txs.push({
          id: nextId(),
          reference: `${seed.referencePrefix}-${randomCode(6, rng.next)}`,
          merchantId: seed.id,
          domain: seed.domain,
          amount,
          customerPhone: phone(rng),
          customerName: name,
          channel: rng.weighted([['STK Push', 8], ['Payment Link', 2]] as const),
          description: rng.pick(seed.profile.descriptions),
          status,
          attribution: status === 'Initiated' || status === 'Pending' ? 'Awaiting callback' : status === 'Failed' || status === 'Cancelled' ? 'Not applicable' : 'Attributed',
          mpesaReceipt: collected ? 'T' + randomCode(9, rng.next) : null,
          providerRef: status === 'Initiated' ? null : `ws_CO_${new Date(initiated).toISOString().slice(0, 10).replace(/-/g, '')}${rng.int(100000, 999999)}${rng.int(1000, 9999)}`,
          fee: collected ? calcFee(amount, seed.pricing) : 0,
          providerCharge: collected ? calcProviderCharge(amount, cfg.costs) : 0,
          smsFee: sms.fee,
          smsCost: sms.cost,
          initiatedAt: new Date(initiated).toISOString(),
          confirmedAt,
          reversedAt: status === 'Refunded' || status === 'Reversed' ? new Date(initiated + rng.int(1, 2) * DAY).toISOString() : null,
          failureReason: status === 'Failed' ? rng.weighted(FAILURES) : status === 'Cancelled' ? 'Request cancelled by customer' : undefined,
          duplicateCallbacks: collected && rng.chance(0.03) ? rng.int(1, 2) : 0,
        })
      }
    }
  }

  // Direct-to-Till payments with no matching internal reference -> held in suspense
  for (let day = today - HISTORY_DAYS * DAY; day <= today; day += DAY) {
    if (!rng.chance(0.18)) continue
    const initiated = day + hourOfDay(rng) * 3_600_000 + rng.int(0, 3_599_999)
    if (initiated > now) continue
    const amount = roundAmount(rng.logUniform(300, 12000))
    txs.push({
      id: nextId(),
      reference: rng.pick(['', 'PAYMENT', 'INV 2231', 'ORDER', 'acme', '0711']),
      merchantId: null,
      domain: null,
      amount,
      customerPhone: phone(rng),
      customerName: `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`,
      channel: 'Till (Direct)',
      description: 'Direct Till payment - no matching internal reference',
      status: 'Unmatched',
      attribution: 'Unmatched',
      mpesaReceipt: 'T' + randomCode(9, rng.next),
      providerRef: null,
      fee: 0,
      providerCharge: calcProviderCharge(amount, cfg.costs),
      smsFee: 0,
      smsCost: 0,
      initiatedAt: new Date(initiated).toISOString(),
      confirmedAt: new Date(initiated).toISOString(),
      duplicateCallbacks: 0,
    })
  }
  // Older unmatched payments have mostly been resolved by operations
  for (const t of txs) {
    if (t.status === 'Unmatched' && now - new Date(t.initiatedAt).getTime() > 21 * DAY && rng.chance(0.85)) {
      const m = rng.pick(merchantSeeds)
      t.merchantId = m.id
      t.domain = m.domain
      t.status = 'Successful'
      t.attribution = 'Manually attributed'
      t.fee = calcFee(t.amount, m.pricing)
      const sms = smsCharge(m, cfg, Infinity, t.initiatedAt)
      t.smsFee = sms.fee
      t.smsCost = sms.cost
      t.description = 'Direct Till payment - attributed after customer confirmation'
    }
  }
  txs.sort((a, b) => b.initiatedAt.localeCompare(a.initiatedAt))

  // ---- Prepaid SMS credit: merchants top up via M-Pesa before credit runs out
  const smsTopUps: SmsTopUp[] = []
  for (const seed of merchantSeeds) {
    const alerts = txs.filter((t) => t.merchantId === seed.id && t.smsFee > 0 && t.confirmedAt).sort((a, b) => a.confirmedAt!.localeCompare(b.confirmedAt!))
    let credit = 0
    for (const t of alerts) {
      if (credit < t.smsFee) {
        const amount = rng.pick([300, 500, 1000, 1000, 2000])
        const at = new Date(new Date(t.confirmedAt!).getTime() - rng.int(10, 600) * 60_000).toISOString()
        smsTopUps.push({ id: `SMT-${randomCode(6, rng.next)}`, merchantId: seed.id, amount, method: 'M-Pesa', reference: `SMS-${seed.referencePrefix}-${randomCode(5, rng.next)}`, mpesaReceipt: 'T' + randomCode(9, rng.next), at })
        credit += amount
      }
      credit -= t.smsFee
    }
  }
  smsTopUps.sort((a, b) => b.at.localeCompare(a.at))

  // ---- Payouts -------------------------------------------------------------
  const payouts: Payout[] = []
  let pseq = 0
  for (const seed of merchantSeeds) {
    const mtx = txs
      .filter((t) => t.merchantId === seed.id && t.confirmedAt && (t.status === 'Successful' || isReturned(t)))
      .map((t) => ({ settledAt: new Date(t.confirmedAt!).getTime() + cfg.settlementHours * 3_600_000, value: isReturned(t) ? -t.fee : t.amount - t.fee }))
    let paid = 0
    const regDay = startOfDay(new Date(seed.registeredAt)).getTime()
    for (let day = Math.max(regDay, today - HISTORY_DAYS * DAY); day <= today; day += DAY) {
      const dow = new Date(day).getDay()
      const due = seed.payoutSchedule === 'Daily' ? dow !== 0 : seed.payoutSchedule === 'Weekly' ? dow === 1 : new Date(day).getDate() === 1
      if (!due) continue
      const at = day + 9 * 3_600_000 + rng.int(0, 1_800_000)
      if (at > now) continue
      const settled = mtx.reduce((s, x) => (x.settledAt <= at ? s + x.value : s), 0)
      const avail = settled - paid
      const amount = Math.floor((avail * 0.96) / 100) * 100
      if (amount < cfg.payout.minAmount) continue
      const recent = now - at < 3 * 3_600_000
      const failed = !recent && rng.chance(0.025)
      const fee = cfg.payout.feeFixed
      payouts.push({
        id: `PO${String(++pseq).padStart(5, '0')}`,
        reference: `ORY-PO-${randomCode(8, rng.next)}`,
        merchantId: seed.id,
        amount,
        fee,
        netAmount: round2(amount - fee),
        providerCost: seed.payoutMethod !== 'Bank transfer' ? cfg.payout.providerCost : 0,
        method: seed.payoutMethod,
        remittance: seed.payoutMethod !== 'Bank transfer' ? 'B2C' : 'Manual',
        destination: seed.payoutDestination,
        status: recent ? 'Processing' : failed ? 'Failed' : 'Completed',
        requestedAt: new Date(at).toISOString(),
        completedAt: recent || failed ? null : new Date(at + rng.int(20, 600) * 1000).toISOString(),
        initiatedBy: 'Scheduled',
        failureReason: failed ? 'Destination account could not receive funds' : undefined,
      })
      if (!failed) paid += amount
    }
  }
  // A couple of merchant-initiated requests awaiting admin approval
  for (const [mid, hoursAgo, amount] of [['ORY-M001', 2, 45_000], ['ORY-M005', 5, 18_500]] as const) {
    const seed = merchantSeeds.find((s) => s.id === mid)!
    payouts.push({
      id: `PO${String(++pseq).padStart(5, '0')}`, reference: `ORY-PO-${randomCode(8, rng.next)}`, merchantId: mid, amount,
      fee: cfg.payout.feeFixed, netAmount: amount - cfg.payout.feeFixed, providerCost: cfg.payout.providerCost, method: seed.payoutMethod, remittance: null,
      destination: seed.payoutDestination, status: 'Pending', requestedAt: new Date(now - hoursAgo * 3_600_000).toISOString(),
      completedAt: null, initiatedBy: 'Merchant',
    })
  }
  payouts.sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))

  // ---- Expenses ------------------------------------------------------------
  const expenses: Expense[] = []
  let eseq = 0
  const addExp = (category: ExpenseCategory, description: string, amount: number, provider: string, date: number, status: Expense['status'] = 'Paid') => {
    if (date > now) return
    expenses.push({ id: `EXP-${String(++eseq).padStart(4, '0')}`, category, description, amount, provider, date: new Date(date).toISOString(), status })
  }
  const nowD = new Date(now)
  for (let mo = 4; mo >= 0; mo--) {
    const first = new Date(nowD.getFullYear(), nowD.getMonth() - mo, 1).getTime()
    const label = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(first)
    const current = mo === 0
    addExp('Hosting & infrastructure', `Application servers and managed database - ${label}`, 18_500 + mo * -300 + 1200, 'Cloud hosting provider', first + 2 * DAY + 10 * 3_600_000, current ? 'Pending' : 'Paid')
    addExp('PayHero token costs', `Token top-up (bulk purchase)`, 6000, 'PayHero', first + 4 * DAY + 11 * 3_600_000)
    addExp('PayHero token costs', `Token top-up (bulk purchase)`, 6000, 'PayHero', first + 18 * DAY + 11 * 3_600_000)
    addExp('SMS & notifications', `Sender ID and SMS platform subscription - ${label}`, 1_200, 'SMS gateway', first + 27 * DAY, current ? 'Pending' : 'Paid')
    addExp('Software services', `Error monitoring and log retention - ${label}`, 4_200, 'Observability service', first + 5 * DAY)
    addExp('Software services', `Transactional email delivery - ${label}`, 1_850, 'Email provider', first + 5 * DAY + 3_600_000)
    addExp('Safaricom / Daraja', `Till administration and statement charges - ${label}`, 1_500, 'Safaricom', first + 7 * DAY)
    addExp('Operational', `Office connectivity - ${label}`, 7_999, 'ISP', first + 10 * DAY, current ? 'Pending' : 'Paid')
    if (mo % 2 === 0) addExp('Refunds & reversals', 'Reversal charges absorbed by Oryne', 640 + rng.int(0, 600), 'Safaricom', first + 15 * DAY)
  }
  addExp('Other', 'Domain renewals and SSL certificates', 6_400, 'Domain registrar', now - 61 * DAY)
  addExp('Operational', 'Data protection compliance review', 25_000, 'Legal advisor', now - 44 * DAY)
  addExp('Hosting & infrastructure', 'Secondary region failover setup', 9_800, 'Cloud hosting provider', now - 12 * DAY, 'Overdue')
  expenses.sort((a, b) => b.date.localeCompare(a.date))

  // ---- Other revenue (subscriptions, integration fees) ---------------------
  const revenue: RevenueEntry[] = []
  let rseq = 0
  for (const m of merchants) {
    const plan = cfg.subscriptionPlans.find((p) => p.name === m.subscription)
    if (!plan || plan.monthlyFee === 0) continue
    for (let mo = 4; mo >= 0; mo--) {
      const d = new Date(nowD.getFullYear(), nowD.getMonth() - mo, 1, 6).getTime()
      if (d < new Date(m.registeredAt).getTime()) continue
      revenue.push({ id: `REV-${String(++rseq).padStart(4, '0')}`, category: 'Subscription', merchantId: m.id, description: `${plan.name} plan - monthly subscription`, amount: plan.monthlyFee, date: new Date(d).toISOString() })
    }
  }
  revenue.push({ id: `REV-${String(++rseq).padStart(4, '0')}`, category: 'Integration fee', merchantId: 'ORY-M005', description: 'Custom checkout integration support', amount: 5000, date: new Date(new Date(merchants[4].registeredAt).getTime() + 2 * DAY).toISOString() })
  revenue.sort((a, b) => b.date.localeCompare(a.date))

  // ---- Payment links -------------------------------------------------------
  const paymentLinks: PaymentLink[] = []
  const linkSeeds: Record<string, [string, number | null][]> = {
    'ORY-M001': [['Airport transfer - JKIA', 3500], ['Security deposit', 10000], ['Custom rental payment', null]],
    'ORY-M002': [['Invoice settlement', null], ['Distributor registration', 2500]],
    'ORY-M003': [['Weekly fresh basket', 2450], ['Gift voucher', null]],
    'ORY-M004': [['Account funding', null]],
    'ORY-M005': [['Same-day Nairobi delivery', 650], ['Upcountry parcel', 1200], ['Freight quote payment', null]],
  }
  for (const [mid, links] of Object.entries(linkSeeds)) {
    const m = merchants.find((x) => x.id === mid)!
    links.forEach(([title, amount], i) => {
      const payments = rng.int(4, 60)
      paymentLinks.push({ id: `PL-${mid.slice(-3)}${i}`, merchantId: mid, title, amount, slug: `${m.referencePrefix.toLowerCase()}-${randomCode(6, rng.next).toLowerCase()}`, status: i === 2 && mid === 'ORY-M001' ? 'Disabled' : 'Active', createdAt: new Date(now - rng.int(5, 60) * DAY).toISOString(), payments, collected: amount ? amount * payments : roundAmount(payments * rng.float(1500, 9000)) })
    })
  }

  // ---- Activity ------------------------------------------------------------
  const activity: ActivityLog[] = []
  let aseq = 0
  const act = (actor: string, role: ActivityLog['role'], action: string, target: string, merchantId: string | null, at: number) =>
    activity.push({ id: `ACT${String(++aseq).padStart(5, '0')}`, actor, role, action, target, merchantId, at: new Date(at).toISOString() })
  for (const m of merchants) {
    const reg = new Date(m.registeredAt).getTime()
    act('admin@oryne.network', 'admin', 'Created merchant account', m.name, m.id, reg)
    act('admin@oryne.network', 'admin', 'Approved merchant KYC', m.name, m.id, reg + 6 * 3_600_000)
    act('admin@oryne.network', 'admin', `Set transaction fee to ${m.pricing.percentRate}%`, m.name, m.id, reg + 7 * 3_600_000)
    act('admin@oryne.network', 'admin', 'Set up hosted checkout and payment links', m.name, m.id, reg + DAY)
    if (m.smsAlerts.enabled && m.smsAlerts.enabledAt) act(m.email, 'merchant', 'Enabled SMS payment alerts', m.name, m.id, new Date(m.smsAlerts.enabledAt).getTime())
    for (let k = 0; k < 4; k++) act(m.email, 'merchant', 'Signed in', m.name, m.id, now - rng.int(1, 20 * 24) * 3_600_000)
  }
  act('system', 'system', 'Daily settlement run completed', 'All merchants', null, today + 2 * 3_600_000)
  act('system', 'system', 'Scheduled payouts batch executed', 'All merchants', null, today + 9 * 3_600_000)
  act('ops@oryne.network', 'admin', 'Resolved unmatched payment', 'Manual attribution', null, now - 23 * DAY)
  act('admin@oryne.network', 'admin', 'Updated provider cost configuration', 'Platform pricing', null, now - 30 * DAY)
  act('admin@oryne.network', 'admin', 'Recorded manual bank remittance', 'PrimeFX', 'ORY-M004', now - 6 * DAY)
  activity.sort((a, b) => b.at.localeCompare(a.at))

  // ---- Notifications -------------------------------------------------------
  const n = (audience: string, title: string, body: string, ago: number, read = false): Notification =>
    ({ id: `NTF-${audience}-${randomCode(5, rng.next)}`, audience, title, body, at: new Date(now - ago).toISOString(), read })
  const unmatchedOpen = txs.filter((t) => t.status === 'Unmatched').length
  const notifications: Notification[] = [
    n('admin', 'Unmatched payments require review', `${unmatchedOpen} Till payments have no matching internal reference.`, 40 * 60_000),
    n('admin', 'Scheduled payouts executed', 'Today\'s payout batch has been submitted for processing.', 5 * 3_600_000),
    n('admin', 'Overdue expense', 'Secondary region failover setup invoice is overdue.', 26 * 3_600_000, true),

    ...merchants.flatMap((m) => [
      n(m.id, 'Settlement completed', 'Yesterday\'s collections have been settled to your available balance.', 7 * 3_600_000),
      n(m.id, 'Payout processed', 'Your latest scheduled payout has been submitted.', 9 * 3_600_000, true),
    ]),
  ]

  return {
    version: DATA_VERSION,
    generatedAt: new Date(now).toISOString(),
    merchants,
    transactions: txs,
    payouts,
    expenses,
    revenue,
    activity,
    paymentLinks,
    smsTopUps,
    notifications,
    config: cfg,
  }
}
