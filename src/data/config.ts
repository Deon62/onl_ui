import type { PlatformConfig } from '../types'

/** Bumped when the DataState shape changes. */
export const DATA_VERSION = 6

/**
 * Platform defaults until the API serves configuration (payments phase). Cost figures are placeholders for
 * analytics only - not verified provider pricing.
 */
export const defaultConfig: PlatformConfig = {
  defaultPricing: { percentRate: 1.5, fixedFee: 0, minFee: 5, maxFee: 1500 },
  costs: {
    providerPercent: 0.5,
    providerFixed: 0,
    tokenCostPerTx: 1,
    otherCostPerTx: 2,
  },
  payout: { feeFixed: 30, providerCost: 15, minAmount: 500 },
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

