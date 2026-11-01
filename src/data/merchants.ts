import type { Merchant, PlatformConfig } from '../types'

// DEMO DATA - all businesses, contacts and numbers are fictitious.

export const defaultConfig: PlatformConfig = {
  defaultPricing: { percentRate: 1.5, fixedFee: 0, minFee: 5, maxFee: 1500 },
  costs: {
    // Mock values for prototyping only - not verified provider pricing.
    providerPercent: 0.5,
    providerFixed: 0,
    tokenCostPerTx: 1,
    otherCostPerTx: 2,
  },
  payout: { feeFixed: 30, providerCost: 15, minAmount: 500 },
  // Optional SMS payment alerts - mock gateway cost, configurable price
  sms: { feePerSms: 2, costPerSms: 0.8 },
  subscriptionPlans: [
    { name: 'None', monthlyFee: 0 },
    { name: 'Growth', monthlyFee: 1500 },
    { name: 'Business', monthlyFee: 4500 },
  ],
  competitor: { label: 'Hypothetical aggregator (illustrative)', percentRate: 2.5, fixedFee: 0 },
  settlementHours: 24,
  tillNumberMasked: '58****91',
  callbackUrl: 'https://api.oryne.network/v1/mpesa/callback',
}

interface MerchantProfile {
  /** Average successful+attempted payments per day */
  dailyVolume: number
  minAmount: number
  maxAmount: number
  descriptions: string[]
}

export interface MerchantSeed extends Merchant {
  profile: MerchantProfile
}

const now = Date.now()
const daysAgo = (d: number) => new Date(now - d * 86_400_000).toISOString()

export const merchantSeeds: MerchantSeed[] = [
  {
    id: 'ORY-M001',
    name: 'Acme Car Hire',
    legalName: 'Acme Car Hire Limited',
    domain: 'acmecarhire.com',
    email: 'accounts@acmecarhire.com',
    phone: '254722410388',
    contactName: 'Wanjiru Kamau',
    industry: 'Car rental',
    location: 'Westlands, Nairobi',
    status: 'Active',
    registeredAt: daysAgo(214),
    pricing: { percentRate: 1.5, fixedFee: 0, minFee: 5, maxFee: 1500 },
    payoutSchedule: 'Weekly',
    payoutMethod: 'M-Pesa',
    payoutDestination: '254722410388',
    subscription: 'Growth',
    referencePrefix: 'ACM',
    smsAlerts: { enabled: true, recipients: ['254722410388'], enabledAt: daysAgo(64) },
    profile: {
      dailyVolume: 4.2,
      minAmount: 2500,
      maxAmount: 38000,
      descriptions: ['Vehicle hire deposit', 'Daily rental - Toyota Axio', 'Weekend rental - Prado', 'Airport transfer', 'Security deposit', 'Rental extension'],
    },
  },
  {
    id: 'ORY-M002',
    name: 'Nova Trading',
    legalName: 'Nova Trading Company Limited',
    domain: 'novatrading.co.ke',
    email: 'finance@novatrading.co.ke',
    phone: '254733902114',
    contactName: 'Brian Otieno',
    industry: 'Wholesale & distribution',
    location: 'Industrial Area, Nairobi',
    status: 'Active',
    registeredAt: daysAgo(188),
    pricing: { percentRate: 1.4, fixedFee: 0, minFee: 5, maxFee: 1500 },
    payoutSchedule: 'Daily',
    payoutMethod: 'M-Pesa',
    payoutDestination: '254733902114',
    subscription: 'None',
    referencePrefix: 'NOV',
    smsAlerts: { enabled: true, recipients: ['254733902114', '254711240875'], enabledAt: daysAgo(31) },
    profile: {
      dailyVolume: 7,
      minAmount: 450,
      maxAmount: 18000,
      descriptions: ['Order payment', 'Bulk order - cooking oil', 'Invoice settlement', 'Stock purchase', 'Delivery order'],
    },
  },
  {
    id: 'ORY-M003',
    name: 'Urban Mart',
    legalName: 'Urban Mart Stores Limited',
    domain: 'urbanmart.co.ke',
    email: 'payments@urbanmart.co.ke',
    phone: '254711583207',
    contactName: 'Grace Wambui',
    industry: 'Retail & groceries',
    location: 'Kilimani, Nairobi',
    status: 'Active',
    registeredAt: daysAgo(163),
    pricing: { percentRate: 1.5, fixedFee: 0, minFee: 2, maxFee: 1500 },
    payoutSchedule: 'Daily',
    payoutMethod: 'M-Pesa',
    payoutDestination: '254711583207',
    subscription: 'None',
    referencePrefix: 'URB',
    smsAlerts: { enabled: false, recipients: [], enabledAt: null },
    profile: {
      dailyVolume: 13,
      minAmount: 120,
      maxAmount: 4800,
      descriptions: ['Online grocery order', 'Click & collect order', 'Household essentials', 'Express delivery order', 'Weekly basket'],
    },
  },
  {
    id: 'ORY-M004',
    name: 'PrimeFX',
    legalName: 'PrimeFX Bureau Limited',
    domain: 'primefx.com',
    email: 'treasury@primefx.com',
    phone: '254700118842',
    contactName: 'Daniel Mwangi',
    industry: 'Financial services',
    location: 'Upper Hill, Nairobi',
    status: 'Active',
    registeredAt: daysAgo(141),
    pricing: { percentRate: 1.3, fixedFee: 0, minFee: 10, maxFee: 2500 },
    payoutSchedule: 'Weekly',
    payoutMethod: 'Bank transfer',
    payoutDestination: 'KCB Bank - A/C ****4471',
    subscription: 'Business',
    referencePrefix: 'PFX',
    smsAlerts: { enabled: false, recipients: [], enabledAt: null },
    profile: {
      dailyVolume: 2.6,
      minAmount: 5000,
      maxAmount: 145000,
      descriptions: ['Account funding', 'Wallet top-up', 'Trading account deposit', 'Margin top-up'],
    },
  },
  {
    id: 'ORY-M005',
    name: 'Swift Logistics',
    legalName: 'Swift Logistics East Africa Limited',
    domain: 'swiftlogistics.co.ke',
    email: 'billing@swiftlogistics.co.ke',
    phone: '254745330961',
    contactName: 'Faith Njeri',
    industry: 'Courier & logistics',
    location: 'Mombasa Road, Nairobi',
    status: 'Active',
    registeredAt: daysAgo(72),
    pricing: { percentRate: 1.5, fixedFee: 0, minFee: 5, maxFee: 1500 },
    payoutSchedule: 'Weekly',
    payoutMethod: 'M-Pesa',
    payoutDestination: '254745330961',
    subscription: 'Growth',
    referencePrefix: 'SWL',
    smsAlerts: { enabled: true, recipients: ['254745330961'], enabledAt: daysAgo(40) },
    profile: {
      dailyVolume: 5,
      minAmount: 850,
      maxAmount: 14500,
      descriptions: ['Parcel delivery', 'Same-day courier', 'Upcountry shipment', 'Cargo freight charge', 'Pickup & delivery'],
    },
  },
]

export const FIRST_NAMES = [
  'John', 'Mary', 'Peter', 'Grace', 'James', 'Faith', 'David', 'Mercy', 'Joseph', 'Esther', 'Samuel', 'Ann', 'Kevin',
  'Joyce', 'Brian', 'Caroline', 'Dennis', 'Lucy', 'Collins', 'Purity', 'Victor', 'Sharon', 'Ian', 'Diana', 'Moses',
  'Agnes', 'George', 'Winnie', 'Paul', 'Naomi', 'Felix', 'Ruth', 'Erick', 'Lilian', 'Allan', 'Beatrice',
]
export const LAST_NAMES = [
  'Mwangi', 'Otieno', 'Wanjiku', 'Kamau', 'Ochieng', 'Njoroge', 'Achieng', 'Kiprop', 'Mutua', 'Wafula', 'Chebet',
  'Odhiambo', 'Kariuki', 'Muthoni', 'Kibet', 'Nyambura', 'Omondi', 'Wekesa', 'Atieno', 'Korir', 'Maina', 'Juma',
]
