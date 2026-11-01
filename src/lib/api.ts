/**
 * Live backend (Oryne API on Render) + Supabase Auth.
 *
 * Sign-in happens with Supabase directly (email + password); every API call then sends the Supabase access token,
 * which the API verifies. Only the public Supabase URL and publishable (anon) key live here - never a secret.
 * The API speaks snake_case and integer cents; the dashboard speaks camelCase and KES, so mapping happens here.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { AccessRequest, ActivityLog, DataState, Merchant, Notification, PayoutMethod, PayoutSchedule, SettlementDetails } from '../types'
import { defaultConfig } from '../data/merchants'
import { DATA_VERSION } from '../data/generate'
import { emptySettlement } from './settlement'

export const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || 'https://apiv1.oryne.org'
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

export const liveConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY)

let client: SupabaseClient | null = null
function supabase(): SupabaseClient {
  if (!liveConfigured) throw new ApiError(0, 'not_configured', 'Live sign-in is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.')
  client ??= createClient(SUPABASE_URL!, SUPABASE_KEY!, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'oryne-auth' } })
  return client
}

export class ApiError extends Error {
  status: number
  code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
    this.name = 'ApiError'
  }
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await supabase().auth.signInWithPassword({ email: email.trim(), password })
  if (error) throw new ApiError(401, 'invalid_credentials', error.message === 'Invalid login credentials' ? 'Incorrect email or password.' : error.message)
}

export async function signOut(): Promise<void> {
  if (liveConfigured) await supabase().auth.signOut().catch(() => undefined)
}

/** Integration tests against a local API supply their own token instead of signing in through Supabase. */
let tokenOverride: string | null = null
export const setTestToken = (t: string | null) => { tokenOverride = t }

async function token(): Promise<string | null> {
  if (tokenOverride) return tokenOverride
  const { data } = await supabase().auth.getSession()
  return data.session?.access_token ?? null
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

type Json = Record<string, unknown>

export async function api<T>(path: string, init: { method?: string; body?: unknown; auth?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (init.body !== undefined) headers['Content-Type'] = 'application/json'
  if (init.auth !== false) {
    const t = await token()
    if (!t) throw new ApiError(401, 'not_authenticated', 'Your session has ended. Sign in again.')
    headers.Authorization = `Bearer ${t}`
  }
  let res: Response
  try {
    res = await fetch(`${API_URL}${path}`, { method: init.method ?? 'GET', headers, body: init.body === undefined ? undefined : JSON.stringify(init.body) })
  } catch {
    throw new ApiError(0, 'network', 'We could not reach the server. Check your connection and try again.')
  }
  if (res.status === 204) return undefined as T
  const payload = (await res.json().catch(() => null)) as Json | null
  if (!res.ok) {
    const err = (payload?.error ?? {}) as { code?: string; message?: string; details?: { fields?: { field: string; message: string }[] } }
    const field = err.details?.fields?.[0]
    const message = field ? `${field.field.replace(/_/g, ' ')}: ${field.message}` : err.message ?? `Request failed (${res.status}).`
    throw new ApiError(res.status, err.code ?? 'error', message)
  }
  return payload as T
}

// ---------------------------------------------------------------------------
// API shapes
// ---------------------------------------------------------------------------

export type ApiRole = 'super_admin' | 'ops' | 'finance' | 'merchant_owner' | 'merchant_staff'

interface ApiDomain { id: string; domain: string }
export interface ApiMerchant {
  id: string; code: string; name: string; legal_name: string; email: string; phone: string; contact_name: string
  industry: string; location: string; status: Merchant['status']; reference_prefix: string
  pricing: { percent_bps: number; fixed_cents: number; min_cents: number; max_cents: number }
  payout_schedule: PayoutSchedule; payout_method: PayoutMethod; payout_destination: string
  settlement: Record<string, string>; sms_alerts: { enabled?: boolean; recipients?: string[]; enabled_at?: string | null }
  subscription: string; domains: ApiDomain[]; created_at: string
}
export interface ApiMe { user_id: string; email: string; role: ApiRole; merchant: ApiMerchant | null }
interface ApiPage<T> { items: T[]; total: number }
interface ApiActivity { id: string; actor: string; role: string; action: string; target: string; merchant_id: string | null; at: string }
interface ApiNotification { id: string; audience: string; title: string; body: string; read: boolean; created_at: string }
interface ApiAccessRequest {
  id: string; business: string; contact_name: string; email: string; phone: string; volume: string; message: string
  status: AccessRequest['status']; created_at: string
}

export const ADMIN_ROLES: ApiRole[] = ['super_admin', 'ops', 'finance']
export const ROLE_LABEL: Record<ApiRole, string> = {
  super_admin: 'Super Admin', ops: 'Operations', finance: 'Finance', merchant_owner: 'Owner', merchant_staff: 'Staff',
}

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

const kes = (cents: number) => cents / 100
const cents = (amount: number) => Math.round(amount * 100)

function toSettlement(s: Record<string, string> | undefined): SettlementDetails | undefined {
  if (!s || Object.keys(s).length === 0) return undefined
  return {
    ...emptySettlement(),
    phone: s.phone ?? '', till: s.till ?? '', paybill: s.paybill ?? '', paybillAccount: s.paybill_account ?? '',
    bankName: s.bank_name ?? '', bankBranch: s.bank_branch ?? '', accountName: s.account_name ?? '', accountNumber: s.account_number ?? '',
    updatedAt: s.updated_at ?? null,
  }
}

export function toMerchant(m: ApiMerchant): Merchant {
  return {
    id: m.code,
    apiId: m.id,
    domains: m.domains.map((d) => ({ id: d.id, domain: d.domain })),
    name: m.name,
    legalName: m.legal_name || m.name,
    domain: m.domains[0]?.domain ?? '',
    email: m.email,
    phone: m.phone,
    contactName: m.contact_name,
    industry: m.industry,
    location: m.location,
    status: m.status,
    registeredAt: m.created_at,
    pricing: { percentRate: m.pricing.percent_bps / 100, fixedFee: kes(m.pricing.fixed_cents), minFee: kes(m.pricing.min_cents), maxFee: kes(m.pricing.max_cents) },
    payoutSchedule: m.payout_schedule,
    payoutMethod: m.payout_method,
    payoutDestination: m.payout_destination,
    settlement: toSettlement(m.settlement),
    subscription: m.subscription || 'None',
    referencePrefix: m.reference_prefix,
    smsAlerts: { enabled: Boolean(m.sms_alerts?.enabled), recipients: m.sms_alerts?.recipients ?? [], enabledAt: m.sms_alerts?.enabled_at ?? null },
  }
}

/** Dashboard merchant fields -> API body (only the keys present in `m`). */
export function fromMerchant(m: Partial<Merchant>): Json {
  const out: Json = {}
  const map: [keyof Merchant, string][] = [
    ['name', 'name'], ['legalName', 'legal_name'], ['email', 'email'], ['phone', 'phone'], ['contactName', 'contact_name'],
    ['industry', 'industry'], ['location', 'location'], ['subscription', 'subscription'], ['payoutSchedule', 'payout_schedule'],
    ['payoutMethod', 'payout_method'], ['payoutDestination', 'payout_destination'],
  ]
  for (const [from, to] of map) if (m[from] !== undefined) out[to] = m[from]
  if (m.pricing) {
    out.pricing = {
      percent_bps: Math.round(m.pricing.percentRate * 100), fixed_cents: cents(m.pricing.fixedFee),
      min_cents: cents(m.pricing.minFee), max_cents: cents(m.pricing.maxFee),
    }
  }
  return out
}

export const fromSettlement = (s: SettlementDetails) => ({
  phone: s.phone, till: s.till, paybill: s.paybill, paybill_account: s.paybillAccount, bank_name: s.bankName,
  bank_branch: s.bankBranch, account_name: s.accountName, account_number: s.accountNumber,
})

const toAccessRequest = (r: ApiAccessRequest): AccessRequest => ({
  id: r.id, business: r.business, name: r.contact_name, email: r.email, phone: r.phone, volume: r.volume,
  message: r.message, status: r.status, at: r.created_at,
})

// ---------------------------------------------------------------------------
// Loading the workspace
// ---------------------------------------------------------------------------

export const getMe = () => api<ApiMe>('/v1/me')

/**
 * Everything the dashboard needs from the API, as a DataState. Collections (payments, payouts, expenses...)
 * arrive in later backend phases, so they start empty and the pages show their empty states.
 */
export async function loadWorkspace(me: ApiMe): Promise<DataState> {
  const admin = ADMIN_ROLES.includes(me.role)
  const [merchants, activity, notifications, accessRequests] = await Promise.all([
    admin ? api<ApiPage<ApiMerchant>>('/v1/admin/merchants?limit=200').then((p) => p.items) : Promise.resolve(me.merchant ? [me.merchant] : []),
    admin ? api<ApiPage<ApiActivity>>('/v1/admin/activity?limit=200').then((p) => p.items) : Promise.resolve([] as ApiActivity[]),
    api<ApiNotification[]>('/v1/notifications?limit=100'),
    admin ? api<ApiPage<ApiAccessRequest>>('/v1/admin/access-requests?limit=100').then((p) => p.items) : Promise.resolve([] as ApiAccessRequest[]),
  ])
  const byUuid = new Map(merchants.map((m) => [m.id, m.code]))
  const code = (uuid: string | null) => (uuid ? byUuid.get(uuid) ?? null : null)

  return {
    version: DATA_VERSION,
    generatedAt: new Date().toISOString(),
    merchants: merchants.map(toMerchant),
    transactions: [],
    payouts: [],
    expenses: [],
    revenue: [],
    activity: activity.map((a): ActivityLog => ({
      id: a.id, actor: a.actor, role: ADMIN_ROLES.includes(a.role as ApiRole) ? 'admin' : a.role === 'system' ? 'system' : 'merchant',
      action: a.action, target: a.target, merchantId: code(a.merchant_id), at: a.at,
    })),
    paymentLinks: [],
    smsTopUps: [],
    notifications: notifications.map((n): Notification => ({
      id: n.id, audience: n.audience === 'admin' ? 'admin' : code(n.audience) ?? n.audience, title: n.title, body: n.body, at: n.created_at, read: n.read,
    })),
    accessRequests: accessRequests.map(toAccessRequest),
    config: structuredClone(defaultConfig),
  }
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export const live = {
  createMerchant: (m: Partial<Merchant>, status: Merchant['status']) =>
    api<ApiMerchant>('/v1/admin/merchants', { method: 'POST', body: { ...fromMerchant(m), status, domains: m.domain ? [m.domain] : [] } }).then(toMerchant),

  async updateMerchant(target: Merchant, patch: Partial<Merchant>): Promise<Merchant> {
    // Domains are separate resources: add the new one before removing the old, so a failure never leaves none.
    if (patch.domain !== undefined && patch.domain !== target.domain) {
      await api(`/v1/admin/merchants/${target.apiId}/domains`, { method: 'POST', body: { domain: patch.domain } })
      const old = target.domains?.find((d) => d.domain === target.domain)
      if (old) await api(`/v1/admin/merchants/${target.apiId}/domains/${old.id}`, { method: 'DELETE' })
    }
    return api<ApiMerchant>(`/v1/admin/merchants/${target.apiId}`, { method: 'PATCH', body: fromMerchant(patch) }).then(toMerchant)
  },

  updateProfile: (target: Merchant, patch: Partial<Merchant>, asAdmin: boolean) =>
    api<ApiMerchant>(`/v1/merchant/profile${asAdmin ? `?merchant_id=${target.apiId}` : ''}`, {
      method: 'PATCH', body: { contact_name: patch.contactName, phone: patch.phone, industry: patch.industry, location: patch.location },
    }).then(toMerchant),

  setStatus: (target: Merchant, status: Merchant['status']) =>
    api<ApiMerchant>(`/v1/admin/merchants/${target.apiId}/status`, { method: 'POST', body: { status } }).then(toMerchant),

  updateSettlement: (target: Merchant, method: PayoutMethod, destination: string, schedule: PayoutSchedule, s: SettlementDetails, asAdmin: boolean) =>
    api<ApiMerchant>(`/v1/merchant/settlement${asAdmin ? `?merchant_id=${target.apiId}` : ''}`, {
      method: 'PUT', body: { payout_method: method, payout_destination: destination, payout_schedule: schedule, settlement: fromSettlement(s) },
    }).then(toMerchant),

  requestAccess: (r: { business: string; name: string; email: string; phone: string; volume: string; message: string }) =>
    api('/v1/access-requests', { method: 'POST', auth: false, body: { business: r.business, contact_name: r.name, email: r.email, phone: r.phone, volume: r.volume, message: r.message } }),

  approveAccessRequest: (id: string) => api<ApiMerchant>(`/v1/admin/access-requests/${id}/approve`, { method: 'POST' }).then(toMerchant),
  rejectAccessRequest: (id: string) => api(`/v1/admin/access-requests/${id}/reject`, { method: 'POST', body: { reason: '' } }),

  markRead: (audienceUuid: string) => api(`/v1/notifications/read?audience=${encodeURIComponent(audienceUuid)}`, { method: 'POST' }),
}
