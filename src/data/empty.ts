import type { DataState, Merchant } from '../types'
import { defaultConfig } from './merchants'
import { DATA_VERSION } from './generate'
import { emptySettlement } from '../lib/settlement'

const ADMIN_EMAIL = 'admin@oryne.network'

const titleCase = (s: string) => s.replace(/[-_.]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim()

/**
 * A brand-new workspace: no transactions, payouts, expenses or history. One freshly onboarded merchant
 * (derived from the sign-in email) so the merchant dashboard can be previewed exactly as a new user sees it.
 */
export function generateEmpty(email: string): DataState {
  const now = new Date().toISOString()
  const e = email.trim().toLowerCase()
  const own = e && e !== ADMIN_EMAIL && e.includes('@')
  const domain = own ? e.split('@')[1] : 'mybusiness.co.ke'
  const name = own ? titleCase(domain.split('.')[0]) || 'My Business' : 'My Business'
  const local = own ? e.split('@')[0] : 'owner'
  const prefix = name.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase().padEnd(3, 'X')

  const merchant: Merchant = {
    id: 'ORY-M001',
    name,
    legalName: `${name} Limited`,
    domain,
    email: own ? e : `owner@${domain}`,
    phone: '',
    contactName: titleCase(local) || 'Business Owner',
    industry: '',
    location: '',
    status: 'Active',
    registeredAt: now,
    pricing: { ...defaultConfig.defaultPricing },
    payoutSchedule: 'Manual',
    payoutMethod: 'M-Pesa',
    payoutDestination: '',
    settlement: emptySettlement(),
    subscription: 'None',
    referencePrefix: prefix,
    smsAlerts: { enabled: false, recipients: [], enabledAt: null },
  }

  return {
    version: DATA_VERSION,
    generatedAt: now,
    merchants: [merchant],
    transactions: [],
    payouts: [],
    expenses: [],
    revenue: [],
    activity: [{ id: 'ACT-first', actor: merchant.email, role: 'system', action: 'Created merchant account', target: name, merchantId: merchant.id, at: now }],
    paymentLinks: [],
    smsTopUps: [],
    notifications: [
      { id: 'NTF-welcome', audience: merchant.id, title: 'Welcome to Oryne', body: 'Add your settlement account so we know where to send your payouts.', at: now, read: false },
    ],
    config: structuredClone(defaultConfig),
  }
}
