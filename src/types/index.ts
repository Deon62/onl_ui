// Domain types for the Oryne Network platform.
// These mirror the shapes a future FastAPI backend would return.

export type Role = 'admin' | 'merchant'

export type MerchantStatus = 'Active' | 'Suspended' | 'Pending Review'

export type TxStatus =
  | 'Initiated'
  | 'Pending'
  | 'Successful'
  | 'Failed'
  | 'Cancelled'
  | 'Reversed'
  | 'Refunded'
  | 'Unmatched'

export type AttributionStatus =
  | 'Attributed'
  | 'Manually attributed'
  | 'Awaiting callback'
  | 'Unmatched'
  | 'Not applicable'

export type Channel = 'STK Push' | 'Payment Link' | 'Till (Direct)'

export type PayoutSchedule = 'Manual' | 'Daily' | 'Weekly' | 'Monthly'

export interface PricingPlan {
  /** Percentage of the transaction amount, e.g. 1.5 for 1.5% */
  percentRate: number
  /** Fixed fee added per transaction (KES) */
  fixedFee: number
  /** Minimum fee per transaction (KES) */
  minFee: number
  /** Maximum fee per transaction (KES). 0 means no cap. */
  maxFee: number
}

export interface SubscriptionPlan {
  name: string
  monthlyFee: number
}

export interface Merchant {
  id: string
  name: string
  legalName: string
  domain: string
  email: string
  phone: string
  contactName: string
  industry: string
  location: string
  status: MerchantStatus
  registeredAt: string
  pricing: PricingPlan
  payoutSchedule: PayoutSchedule
  payoutMethod: PayoutMethod
  /** Where payouts are sent - phone as 2547XXXXXXXX, otherwise a display-ready label */
  payoutDestination: string
  /** Structured settlement account details set by the merchant on the Settlement page */
  settlement?: SettlementDetails
  subscription: string // name of SubscriptionPlan, 'None' for no plan
  referencePrefix: string
  /** Optional paid SMS alert sent to the merchant for every payment received */
  smsAlerts: SmsAlerts
  /** Live mode only: the API's id for this merchant (the code above is the display id) */
  apiId?: string
  /** Live mode only: registered domains with their API ids */
  domains?: { id: string; domain: string }[]
}

export type PayoutMethod = 'M-Pesa' | 'Till' | 'Paybill' | 'Bank transfer'

export interface SettlementDetails {
  phone: string
  till: string
  paybill: string
  paybillAccount: string
  bankName: string
  bankBranch: string
  accountName: string
  accountNumber: string
  updatedAt: string | null
}

export interface SmsAlerts {
  enabled: boolean
  /** Phone numbers (2547XXXXXXXX) that receive the alert */
  recipients: string[]
  /** When alerts were last switched on (charges apply from this time) */
  enabledAt: string | null
}

export interface Transaction {
  id: string
  /** Unique internal payment reference passed as AccountReference to the STK push */
  reference: string
  merchantId: string | null
  domain: string | null
  amount: number
  customerPhone: string
  customerName: string
  channel: Channel
  description: string
  status: TxStatus
  attribution: AttributionStatus
  mpesaReceipt: string | null
  providerRef: string | null
  /** Oryne fee charged to the merchant (KES) */
  fee: number
  /** Charge deducted by the payment provider (KES) */
  providerCharge: number
  /** SMS alert charge drawn from the merchant's prepaid SMS credit (0 if no alert was sent) */
  smsFee: number
  /** Oryne's cost of sending the SMS alert(s) for this payment */
  smsCost: number
  initiatedAt: string
  confirmedAt: string | null
  /** Set when a payment is refunded or reversed */
  reversedAt?: string | null
  failureReason?: string
  /** Number of additional (ignored) duplicate callbacks received */
  duplicateCallbacks: number
}

export type PayoutStatus = 'Pending' | 'Processing' | 'Completed' | 'Failed'

export interface Payout {
  id: string
  reference: string
  merchantId: string
  /** Amount debited from the merchant balance (includes payout fee) */
  amount: number
  /** Oryne payout fee (revenue) */
  fee: number
  /** Amount actually sent to the merchant */
  netAmount: number
  /** Cost paid by Oryne to the provider to execute the transfer */
  providerCost: number
  method: PayoutMethod
  /** How Oryne remits the funds: automated M-Pesa B2C or a manual transfer by operations */
  remittance: 'B2C' | 'Manual' | null
  destination: string
  status: PayoutStatus
  requestedAt: string
  completedAt: string | null
  initiatedBy: 'Merchant' | 'Scheduled' | 'Admin'
  failureReason?: string
}

export type ExpenseCategory =
  | 'PayHero transaction charges'
  | 'PayHero token costs'
  | 'Safaricom / Daraja'
  | 'Hosting & infrastructure'
  | 'Software services'
  | 'SMS & notifications'
  | 'Refunds & reversals'
  | 'Operational'
  | 'Other'

export interface Expense {
  id: string
  category: ExpenseCategory
  description: string
  amount: number
  provider: string
  date: string
  status: 'Paid' | 'Pending' | 'Overdue'
}

export type RevenueCategory = 'Subscription' | 'Integration fee' | 'Other'

export interface RevenueEntry {
  id: string
  category: RevenueCategory
  merchantId: string | null
  description: string
  amount: number
  date: string
}

/** Prepaid SMS credit purchase. Credit is drawn down as alerts are sent. */
export interface SmsTopUp {
  id: string
  merchantId: string
  amount: number
  /** M-Pesa: paid into the business Till. Balance: moved from the merchant's available balance. */
  method: 'M-Pesa' | 'Balance'
  reference: string
  mpesaReceipt: string | null
  at: string
}

export interface ActivityLog {
  id: string
  actor: string
  role: Role | 'system'
  action: string
  target: string
  merchantId: string | null
  at: string
}

export interface PaymentLink {
  id: string
  merchantId: string
  title: string
  amount: number | null
  slug: string
  status: 'Active' | 'Disabled'
  createdAt: string
  payments: number
  collected: number
}

export interface Notification {
  id: string
  /** 'admin' or a merchant id */
  audience: string
  title: string
  body: string
  at: string
  read: boolean
}

export interface CostConfig {
  /** Provider charge as a percentage of the transaction amount */
  providerPercent: number
  /** Provider fixed charge per transaction */
  providerFixed: number
  /** Token cost allocated per transaction (analytical allocation) */
  tokenCostPerTx: number
  /** Other allocated costs per transaction (analytical allocation) */
  otherCostPerTx: number
}

export interface PlatformConfig {
  defaultPricing: PricingPlan
  costs: CostConfig
  payout: { feeFixed: number; providerCost: number; minAmount: number }
  /** Optional SMS payment alerts: price charged to merchants and Oryne's cost per SMS */
  sms: { feePerSms: number; costPerSms: number }
  subscriptionPlans: SubscriptionPlan[]
  competitor: { label: string; percentRate: number; fixedFee: number }
  settlementHours: number
  tillNumberMasked: string
  callbackUrl: string
}

export interface CallbackEvent {
  id: string
  receivedAt: string
  mpesaReceipt: string | null
  reference: string | null
  amount: number
  phone: string
  result: 'Matched' | 'Duplicate ignored' | 'Unmatched' | 'Failed payment' | 'Awaiting'
  resultCode: number
  transactionId: string
  merchantId: string | null
  /** Live mode only: the user's role in the API (super_admin, ops, finance, merchant_owner, merchant_staff) */
  apiRole?: string
}

/** "Request access" submission from the sign-in page */
export interface AccessRequest {
  id: string
  business: string
  name: string
  email: string
  phone: string
  /** The website the requester wants Oryne checkout on */
  domain: string
  volume: string
  message: string
  status: 'New' | 'Approved' | 'Rejected'
  at: string
  reviewedBy?: string | null
  reviewedAt?: string | null
  /** Merchant code created when the request was approved */
  merchantId?: string | null
}

export interface DataState {
  version: number
  generatedAt: string
  merchants: Merchant[]
  transactions: Transaction[]
  payouts: Payout[]
  expenses: Expense[]
  revenue: RevenueEntry[]
  activity: ActivityLog[]
  paymentLinks: PaymentLink[]
  smsTopUps: SmsTopUp[]
  notifications: Notification[]
  accessRequests?: AccessRequest[]
  config: PlatformConfig
}

export interface Session {
  role: Role
  email: string
  name: string
  /** For merchant users: their merchant. For admins: the merchant being viewed, if any. */
  merchantId: string | null
  /** Live mode only: the user's role in the API (super_admin, ops, finance, merchant_owner, merchant_staff) */
  apiRole?: string
}
