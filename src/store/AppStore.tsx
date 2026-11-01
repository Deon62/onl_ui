/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type {
  ActivityLog, DataState, Expense, Merchant, Notification, PaymentLink, Payout, PlatformConfig, Session, SmsTopUp, Transaction, SettlementDetails } from '../types'
import { DATA_VERSION, generateData } from '../data/generate'
import { calcFee, calcProviderCharge, merchantLedger, smsCharge, smsCreditBalance, smsPrice } from '../lib/finance'
import { round2 } from '../lib/format'
import { mpesaReceipt, randomCode, uid } from '../lib/rng'
import { generateEmpty } from '../data/empty'
import { pageCache, setLiveLoader } from '../lib/net'
import { ADMIN_ROLES, ApiError, getMe, live, loadWorkspace, signIn, signOut, type ApiMe } from '../lib/api'
import { automatedRail, destinationFor, displayDestination } from '../lib/settlement'
import { maskPhone } from '../lib/format'

const DATA_KEY = 'oryne-demo-data'
const SESSION_KEY = 'oryne-demo-session'
const THEME_KEY = 'oryne-demo-theme'

export const ADMIN_EMAIL = 'admin@oryne.network'

/** mock: sample data in this browser. live: real data from the Oryne API, signed in with Supabase. */
export type DataMode = 'mock' | 'live'
const MODE_KEY = 'oryne-data-mode'
const loadMode = (): DataMode => (localStorage.getItem(MODE_KEY) === 'live' ? 'live' : 'mock')

/** Live mode starts from nothing until the API responds. */
const blank = (): DataState => ({ ...generateEmpty(''), merchants: [], activity: [], notifications: [], accessRequests: [] })

function loadData(mode: DataMode = loadMode()): DataState {
  if (mode === 'live') return blank()
  try {
    const raw = localStorage.getItem(DATA_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as DataState
      if (parsed.version === DATA_VERSION) return parsed
    }
  } catch {
    /* fall through to regeneration */
  }
  return generateData()
}

function liveSession(me: ApiMe): Session {
  const admin = ADMIN_ROLES.includes(me.role)
  const local = me.email.split('@')[0].replace(/[._-]+/g, ' ').trim().replace(/\b\w/g, (c) => c.toUpperCase())
  return {
    role: admin ? 'admin' : 'merchant',
    email: me.email,
    name: (!admin && me.merchant?.contact_name) || local || me.email,
    merchantId: me.merchant?.code ?? null,
    apiRole: me.role,
  }
}

function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as Session) : null
  } catch {
    return null
  }
}

export interface Toast {
  id: string
  tone: 'success' | 'error' | 'info'
  title: string
  body?: string
}

type Updater = (d: DataState) => DataState

interface StoreValue {
  data: DataState
  session: Session | null
  theme: 'light' | 'dark'
  toasts: Toast[]
  update: (fn: Updater) => void
  toast: (t: Omit<Toast, 'id'>) => void
  dismissToast: (id: string) => void
  /** Mock: any credentials work and sample data loads. Live: Supabase sign-in, then data from the API. */
  login: (email: string, password: string, mock: boolean) => Promise<{ ok: true; role: Session['role'] } | { ok: false; error: string }>
  dataMode: DataMode
  /** Live mode: false until the first load from the API has finished */
  ready: boolean
  /** Live mode: reload everything from the API */
  refresh: () => Promise<void>
  logout: () => void
  viewAsMerchant: (merchantId: string | null) => void
  toggleTheme: () => void
  resetDemo: () => void
}

const StoreContext = createContext<StoreValue | null>(null)

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [dataMode, setDataMode] = useState<DataMode>(loadMode)
  const [data, setData] = useState<DataState>(() => loadData())
  const [session, setSession] = useState<Session | null>(loadSession)
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light'))
  const [toasts, setToasts] = useState<Toast[]>([])
  const [ready, setReady] = useState(() => loadMode() === 'mock')
  const saveTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (dataMode === 'live') return // live data always comes from the API, never from browser storage
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      try {
        localStorage.setItem(DATA_KEY, JSON.stringify(data))
      } catch {
        /* storage full - state remains in memory for this session */
      }
    }, 400)
  }, [data, dataMode])

  useEffect(() => {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    else localStorage.removeItem(SESSION_KEY)
  }, [session])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  const update = useCallback((fn: Updater) => setData(fn), [])

  const dismissToast = useCallback((id: string) => setToasts((t) => t.filter((x) => x.id !== id)), [])
  const toast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = uid('T')
    setToasts((all) => [...all.slice(-3), { ...t, id }])
    window.setTimeout(() => dismissToast(id), t.tone === 'error' ? 7000 : 4500)
  }, [dismissToast])
  const toastRef = useRef(toast)
  useEffect(() => { toastRef.current = toast }, [toast])

  // --- Live mode: loading from the API -------------------------------------------------------------
  const lastLoad = useRef(0)
  const inflight = useRef<Promise<void> | null>(null)
  const sessionRef = useRef(session)
  useEffect(() => { sessionRef.current = session }, [session])

  const endLiveSession = useCallback((message?: string) => {
    void signOut()
    setLiveLoader(null)
    setSession(null)
    setData(blank())
    pageCache.clear()
    if (message) toastRef.current({ tone: 'error', title: 'Signed out', body: message })
  }, [])

  const refresh = useCallback((): Promise<void> => {
    inflight.current ??= (async () => {
      try {
        const me = await getMe()
        const next = await loadWorkspace(me)
        const fresh = liveSession(me)
        setData(next)
        // Admins keep the merchant they were viewing, if it still exists
        setSession((s) => ({
          ...fresh,
          merchantId: fresh.role === 'admin' && s?.merchantId && next.merchants.some((m) => m.id === s.merchantId) ? s.merchantId : fresh.merchantId,
        }))
        lastLoad.current = Date.now()
        setReady(true)
      } catch (e) {
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) endLiveSession(e.message)
        throw e
      } finally {
        inflight.current = null
      }
    })()
    return inflight.current
  }, [endLiveSession])

  // Page loads refresh live data, unless it was loaded in the last few seconds
  const pageLoader = useCallback(() => (Date.now() - lastLoad.current < 5000 ? Promise.resolve() : refresh()), [refresh])
  useEffect(() => {
    setLiveLoader(dataMode === 'live' && session ? pageLoader : null)
  }, [dataMode, session, pageLoader])

  // Restoring a live session after a page reload
  useEffect(() => {
    if (dataMode === 'live' && sessionRef.current && !ready) refresh().catch(() => setReady(true))
  }, [dataMode, ready, refresh])

  const login = useCallback<StoreValue['login']>(async (email, password, mock) => {
    pageCache.clear()
    if (!mock) {
      try {
        await signIn(email, password)
        const me = await getMe()
        const next = await loadWorkspace(me)
        localStorage.setItem(MODE_KEY, 'live')
        setDataMode('live')
        setData(next)
        const s = liveSession(me)
        setSession(s)
        lastLoad.current = Date.now()
        setLiveLoader(pageLoader)
        setReady(true)
        return { ok: true, role: s.role }
      } catch (e) {
        if (e instanceof ApiError && e.code === 'no_access') {
          await signOut()
          return { ok: false, error: 'This account does not have dashboard access yet. Ask an Oryne administrator to grant it.' }
        }
        if (!(e instanceof ApiError && e.code === 'invalid_credentials')) await signOut()
        return { ok: false, error: e instanceof Error ? e.message : 'Sign-in failed. Please try again.' }
      }
    }
    // Demo mode: any credentials work. Every session can switch between admin and merchant views.
    await simulateLatency()
    const e = email.trim().toLowerCase() || ADMIN_EMAIL
    const base = dataMode === 'mock' ? data : loadData('mock')
    localStorage.setItem(MODE_KEY, 'mock')
    setLiveLoader(null)
    setDataMode('mock')
    setReady(true)
    const m = base.merchants.find((x) => x.email.toLowerCase() === e)
    const local = e.split('@')[0].replace(/[._-]+/g, ' ').trim()
    const name = m ? m.contactName : e === ADMIN_EMAIL ? 'Oryne Administrator' : local.replace(/\b\w/g, (c) => c.toUpperCase()) || 'Demo User'
    setSession({ role: 'admin', email: e, name, merchantId: m ? m.id : null })
    setData(() => withActivity(base, { actor: e, role: 'admin', action: 'Signed in', target: m ? m.name : 'Admin console', merchantId: m ? m.id : null }))
    return { ok: true, role: m ? 'merchant' : 'admin' }
  }, [data, dataMode, pageLoader])

  const logout = useCallback(() => {
    if (dataMode === 'live') endLiveSession()
    else setSession(null)
  }, [dataMode, endLiveSession])
  const viewAsMerchant = useCallback((merchantId: string | null) => {
    setSession((s) => (s && s.role === 'admin' ? { ...s, merchantId } : s))
  }, [])
  const toggleTheme = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), [])
  const resetDemo = useCallback(() => {
    if (dataMode === 'live') return void refresh().catch(() => undefined)
    localStorage.removeItem(DATA_KEY)
    setData(generateData())
    pageCache.clear()
  }, [dataMode, refresh])

  const value = useMemo<StoreValue>(() => ({
    data, dataMode, ready, refresh, session, theme, toasts, update, toast, dismissToast, login, logout, viewAsMerchant, toggleTheme, resetDemo,
  }), [data, dataMode, ready, refresh, session, theme, toasts, update, toast, dismissToast, login, logout, viewAsMerchant, toggleTheme, resetDemo])

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used inside AppStoreProvider')
  return ctx
}

// ---------------------------------------------------------------------------
// Pure state helpers
// ---------------------------------------------------------------------------

const simulateLatency = () => new Promise((r) => window.setTimeout(r, 450))

function withActivity(d: DataState, a: Omit<ActivityLog, 'id' | 'at'>): DataState {
  return { ...d, activity: [{ ...a, id: uid('ACT'), at: new Date().toISOString() }, ...d.activity] }
}

function withNotification(d: DataState, audience: string, title: string, body: string): DataState {
  const n: Notification = { id: uid('NTF'), audience, title, body, at: new Date().toISOString(), read: false }
  return { ...d, notifications: [n, ...d.notifications] }
}

const smsFields = (c: { fee: number; cost: number }) => ({ smsFee: c.fee, smsCost: c.cost })

// ---------------------------------------------------------------------------
// Actions hook - every mutation of mock state goes through here.
// Each function maps 1:1 to a future FastAPI endpoint.
// ---------------------------------------------------------------------------

export function useActions() {
  const { update, session, toast, data, dataMode } = useStore()
  const actor = session?.email ?? 'system'
  const role = session?.role ?? 'system'
  const isLive = dataMode === 'live'
  const asAdmin = session?.role === 'admin'

  /** Live mode: put the API's copy of a merchant into local state */
  const putMerchant = (m: Merchant) => update((d) => ({
    ...d,
    merchants: d.merchants.some((x) => x.apiId === m.apiId) ? d.merchants.map((x) => (x.apiId === m.apiId ? m : x)) : [...d.merchants, m],
  }))
  const failed = (title: string) => (e: unknown) => {
    toast({ tone: 'error', title, body: e instanceof Error ? e.message : 'Please try again.' })
    return false as const
  }
  /** Live mode: features whose backend arrives in a later phase */
  const notYet = (what: string) => toast({ tone: 'info', title: `${what} is not live yet`, body: 'This arrives with payments in the next backend phase.' })
  const findMerchant = (id: string) => data.merchants.find((x) => x.id === id)

  return useMemo(() => ({
    /** Resolves true once saved. */
    async createMerchant(input: Omit<Merchant, 'id' | 'registeredAt' | 'referencePrefix'>): Promise<boolean> {
      if (isLive) {
        return live.createMerchant(input, input.status).then((m) => {
          putMerchant(m)
          toast({ tone: 'success', title: 'Merchant created', body: `${m.name} is ${m.id}.` })
          return true
        }, failed('Could not create merchant'))
      }
      const id = `ORY-M${String(data.merchants.length + 1).padStart(3, '0')}`
      const prefix = input.name.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase().padEnd(3, 'X')
      const created: Merchant = { ...input, id, registeredAt: new Date().toISOString(), referencePrefix: prefix }
      update((d) => {
        let next: DataState = { ...d, merchants: [...d.merchants, created] }
        next = withActivity(next, { actor, role, action: 'Created merchant account', target: input.name, merchantId: id })
        return next
      })
      toast({ tone: 'success', title: 'Merchant created', body: `${input.name} has been onboarded.` })
      return Boolean(created)
    },

    /** Admin edit of any merchant field. Resolves true once saved. */
    async updateMerchant(id: string, patch: Partial<Merchant>, note = 'Updated merchant profile'): Promise<boolean> {
      if (isLive) {
        const target = findMerchant(id)
        if (!target) return false
        return live.updateMerchant(target, patch).then((m) => {
          putMerchant(m)
          toast({ tone: 'success', title: 'Changes saved' })
          return true
        }, failed('Could not save changes'))
      }
      update((d) => {
        const m = d.merchants.find((x) => x.id === id)
        if (!m) return d
        const next = { ...d, merchants: d.merchants.map((x) => (x.id === id ? { ...x, ...patch } : x)) }
        return withActivity(next, { actor, role, action: note, target: m.name, merchantId: id })
      })
      toast({ tone: 'success', title: 'Changes saved' })
      return true
    },

    /** The merchant's own contact details (Business Profile page). */
    async updateProfile(id: string, patch: Pick<Merchant, 'contactName' | 'phone' | 'location' | 'industry'>): Promise<boolean> {
      if (!isLive) return this.updateMerchant(id, patch, 'Updated business contact details')
      const target = findMerchant(id)
      if (!target) return false
      const req = asAdmin ? live.updateMerchant(target, patch) : live.updateProfile(target, patch, false)
      return req.then((m) => {
        putMerchant(m)
        toast({ tone: 'success', title: 'Changes saved' })
        return true
      }, failed('Could not save changes'))
    },

    setMerchantStatus(id: string, status: Merchant['status']) {
      if (isLive) {
        const target = findMerchant(id)
        if (!target) return
        void live.setStatus(target, status).then((m) => {
          putMerchant(m)
          toast({ tone: status === 'Suspended' ? 'info' : 'success', title: `Merchant ${status === 'Suspended' ? 'suspended' : 'activated'}` })
        }, failed('Could not change status'))
        return
      }
      update((d) => {
        const m = d.merchants.find((x) => x.id === id)
        if (!m) return d
        let next = { ...d, merchants: d.merchants.map((x) => (x.id === id ? { ...x, status } : x)) }
        next = withActivity(next, { actor, role, action: status === 'Suspended' ? 'Suspended merchant account' : 'Activated merchant account', target: m.name, merchantId: id })
        return withNotification(next, id, `Account ${status === 'Suspended' ? 'suspended' : 'activated'}`, `Your Oryne account status is now ${status}.`)
      })
      toast({ tone: status === 'Suspended' ? 'info' : 'success', title: `Merchant ${status === 'Suspended' ? 'suspended' : 'activated'}` })
    },

    /** Merchant settlement account. Future: PATCH /merchants/{id}/settlement (with OTP verification) */
    updateSettlement(merchantId: string, method: Merchant['payoutMethod'], details: SettlementDetails, schedule: Merchant['payoutSchedule']): Promise<void> | void {
      const m = data.merchants.find((x) => x.id === merchantId)
      if (!m) return
      const destination = destinationFor(method, details)
      if (isLive) {
        // Rejections propagate to the caller's useAsyncAction, which shows the error inline
        return live.updateSettlement(m, method, destination, schedule, details, asAdmin).then((saved) => {
          putMerchant(saved)
          toast({ tone: 'success', title: 'Settlement details saved' })
        })
      }
      const settlement = { ...details, updatedAt: new Date().toISOString() }
      const accountChanged = method !== m.payoutMethod || destination !== m.payoutDestination
      update((d) => {
        let next = { ...d, merchants: d.merchants.map((x) => (x.id === merchantId ? { ...x, payoutMethod: method, payoutDestination: destination, payoutSchedule: schedule, settlement } : x)) }
        next = withActivity(next, { actor, role, action: accountChanged ? `Changed settlement account to ${method}` : 'Updated payout schedule', target: m.name, merchantId })
        if (accountChanged) {
          next = withNotification(next, 'admin', 'Settlement account changed', `${m.name} now receives payouts by ${method}: ${displayDestination(method, destination)}.`)
          next = withNotification(next, merchantId, 'Settlement account updated', `New payouts will be sent to ${displayDestination(method, destination)}.`)
        }
        return next
      })
      toast({ tone: 'success', title: 'Settlement details saved' })
    },

    requestPayout(merchantId: string, amount: number, destination: string, initiatedBy: Payout['initiatedBy']): Payout | null {
      if (isLive) { notYet('Payouts'); return null }
      const m = data.merchants.find((x) => x.id === merchantId)
      if (!m) return null
      const ledger = merchantLedger(merchantId, data)
      if (amount > ledger.available + 0.001 || amount < data.config.payout.minAmount) return null
      const fee = data.config.payout.feeFixed
      const result: Payout = {
        id: uid('PO'), reference: `ORY-PO-${randomCode(8)}`, merchantId, amount: round2(amount), fee, netAmount: round2(amount - fee),
        providerCost: data.config.payout.providerCost, method: m.payoutMethod, remittance: null, destination, status: 'Pending',
        requestedAt: new Date().toISOString(), completedAt: null, initiatedBy,
      }
      update((d) => {
        let next = { ...d, payouts: [result, ...d.payouts] }
        next = withActivity(next, { actor, role, action: `Requested payout of KES ${amount.toLocaleString()}`, target: m.name, merchantId })
        next = withNotification(next, 'admin', 'New payout request', `${m.name} requested a payout of KES ${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}.`)
        return next
      })
      return result
    },

    setPayoutStatus(id: string, status: Payout['status'], failureReason?: string) {
      if (isLive) return notYet('Payouts')
      update((d) => {
        const p = d.payouts.find((x) => x.id === id)
        if (!p) return d
        const m = d.merchants.find((x) => x.id === p.merchantId)
        const payouts = d.payouts.map((x) => x.id === id
          ? { ...x, status, completedAt: status === 'Completed' ? new Date().toISOString() : x.completedAt, failureReason: status === 'Failed' ? failureReason ?? 'Rejected by operations' : undefined }
          : x)
        let next = { ...d, payouts }
        next = withActivity(next, { actor, role, action: `Marked payout ${p.reference} as ${status}`, target: m?.name ?? p.merchantId, merchantId: p.merchantId })
        if (status === 'Completed' || status === 'Failed') {
          next = withNotification(next, p.merchantId, `Payout ${status.toLowerCase()}`, `Payout ${p.reference} of KES ${p.netAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} is ${status.toLowerCase()}.`)
        }
        return next
      })
      toast({ tone: status === 'Failed' ? 'error' : 'success', title: `Payout ${status.toLowerCase()}` })
    },

    saveExpense(e: Omit<Expense, 'id'> & { id?: string }) {
      if (isLive) return notYet('Expenses')
      update((d) => {
        if (e.id) {
          return withActivity({ ...d, expenses: d.expenses.map((x) => (x.id === e.id ? (e as Expense) : x)) }, { actor, role, action: 'Updated expense', target: `${e.id} - ${e.description}`, merchantId: null })
        }
        const id = `EXP-${String(d.expenses.length + 1).padStart(4, '0')}-${randomCode(2)}`
        const exp: Expense = { ...e, id }
        return withActivity({ ...d, expenses: [exp, ...d.expenses].sort((a, b) => b.date.localeCompare(a.date)) }, { actor, role, action: 'Recorded expense', target: `${id} - ${e.description}`, merchantId: null })
      })
      toast({ tone: 'success', title: e.id ? 'Expense updated' : 'Expense recorded' })
    },

    deleteExpense(id: string) {
      if (isLive) return notYet('Expenses')
      update((d) => withActivity({ ...d, expenses: d.expenses.filter((x) => x.id !== id) }, { actor, role, action: 'Deleted expense', target: id, merchantId: null }))
      toast({ tone: 'info', title: 'Expense deleted' })
    },

    updateConfig(patch: Partial<PlatformConfig>, note = 'Updated platform configuration') {
      if (isLive) return notYet('Platform configuration')
      update((d) => withActivity({ ...d, config: { ...d.config, ...patch } }, { actor, role, action: note, target: 'Platform pricing', merchantId: null }))
      toast({ tone: 'success', title: 'Configuration saved', body: 'Applies to new transactions only. Historical records keep the fees charged at the time.' })
    },

    attributeTransaction(txId: string, merchantId: string) {
      if (isLive) return notYet('Attribution')
      update((d) => {
        const m = d.merchants.find((x) => x.id === merchantId)
        if (!m) return d
        const transactions = d.transactions.map((t): Transaction => t.id === txId
          ? { ...t, merchantId, domain: m.domain, status: 'Successful', attribution: 'Manually attributed', fee: calcFee(t.amount, m.pricing), ...smsFields(smsCharge(m, d.config, smsCreditBalance(merchantId, d))), description: 'Direct Till payment - manually attributed after verification' }
          : t)
        let next = withActivity({ ...d, transactions }, { actor, role, action: 'Manually attributed unmatched payment', target: `${txId} to ${m.name}`, merchantId })
        next = withNotification(next, merchantId, 'Payment attributed to your account', `A direct Till payment (${txId}) was verified and credited to your account.`)
        return next
      })
      toast({ tone: 'success', title: 'Payment attributed', body: 'Merchant ledger updated. The fee was applied at the merchant\'s rate.' })
    },

    refundTransaction(txId: string) {
      if (isLive) return notYet('Refunds')
      update((d) => {
        const t = d.transactions.find((x) => x.id === txId)
        if (!t || t.status !== 'Successful') return d
        const transactions = d.transactions.map((x): Transaction => (x.id === txId ? { ...x, status: 'Refunded', reversedAt: new Date().toISOString() } : x))
        return withActivity({ ...d, transactions }, { actor, role, action: 'Refunded transaction', target: txId, merchantId: t.merchantId })
      })
      toast({ tone: 'info', title: 'Refund recorded (simulated)', body: 'No money was moved. The merchant balance has been adjusted.' })
    },

    createPaymentLink(merchantId: string, title: string, amount: number | null) {
      if (isLive) return notYet('Payment links')
      update((d) => {
        const m = d.merchants.find((x) => x.id === merchantId)!
        const link: PaymentLink = { id: uid('PL-'), merchantId, title, amount, slug: `${m.referencePrefix.toLowerCase()}-${randomCode(6).toLowerCase()}`, status: 'Active', createdAt: new Date().toISOString(), payments: 0, collected: 0 }
        return withActivity({ ...d, paymentLinks: [link, ...d.paymentLinks] }, { actor, role, action: 'Created payment link', target: title, merchantId })
      })
      toast({ tone: 'success', title: 'Payment link created' })
    },

    togglePaymentLink(id: string) {
      if (isLive) return notYet('Payment links')
      update((d) => ({ ...d, paymentLinks: d.paymentLinks.map((l) => (l.id === id ? { ...l, status: l.status === 'Active' ? 'Disabled' : 'Active' } : l)) }))
    },

    /** Optional paid SMS alerts. Charges apply per SMS from the moment alerts are switched on. */
    updateSmsAlerts(merchantId: string, enabled: boolean, recipients: string[]) {
      if (isLive) return notYet('SMS alerts')
      update((d) => {
        const m = d.merchants.find((x) => x.id === merchantId)
        if (!m) return d
        const turningOn = enabled && !m.smsAlerts.enabled
        const smsAlerts = { enabled, recipients, enabledAt: turningOn ? new Date().toISOString() : m.smsAlerts.enabledAt }
        const action = turningOn ? 'Enabled SMS payment alerts' : !enabled && m.smsAlerts.enabled ? 'Disabled SMS payment alerts' : 'Updated SMS alert recipients'
        return withActivity({ ...d, merchants: d.merchants.map((x) => (x.id === merchantId ? { ...x, smsAlerts } : x)) }, { actor, role, action, target: m.name, merchantId })
      })
      toast({ tone: 'success', title: enabled ? 'SMS alerts saved' : 'SMS alerts turned off', body: enabled ? `KES ${data.config.sms.feePerSms.toFixed(2)} per SMS per recipient applies to new payments.` : 'No further SMS charges will apply.' })
    },

    /** Remit an approved payout: automated M-Pesa B2C (simulated) or a manual transfer recorded by operations. */
    remitPayout(id: string, mode: 'B2C' | 'Manual') {
      if (isLive) return notYet('Payouts')
      const stamp = () => new Date().toISOString()
      update((d) => {
        const p = d.payouts.find((x) => x.id === id)
        if (!p) return d
        const m = d.merchants.find((x) => x.id === p.merchantId)
        const payouts = d.payouts.map((x): Payout => x.id !== id ? x : mode === 'B2C'
          ? { ...x, remittance: 'B2C', status: 'Processing', providerCost: d.config.payout.providerCost }
          : { ...x, remittance: 'Manual', status: 'Completed', completedAt: stamp(), providerCost: 0 })
        let next = withActivity({ ...d, payouts }, { actor, role, action: mode === 'B2C' ? `Sent payout ${p.reference} via M-Pesa ${automatedRail(p.method) ?? 'B2C'}` : `Recorded manual remittance for ${p.reference}`, target: m?.name ?? p.merchantId, merchantId: p.merchantId })
        if (mode === 'Manual') next = withNotification(next, p.merchantId, 'Payout completed', `Payout ${p.reference} of KES ${p.netAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} has been sent.`)
        return next
      })
      if (mode === 'B2C') {
        // Simulated B2C result callback
        window.setTimeout(() => update((d) => {
          const p = d.payouts.find((x) => x.id === id)
          if (!p || p.status !== 'Processing') return d
          const next = { ...d, payouts: d.payouts.map((x): Payout => (x.id === id ? { ...x, status: 'Completed', completedAt: stamp() } : x)) }
          return withNotification(next, p.merchantId, 'Payout completed', `Payout ${p.reference} of KES ${p.netAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} was sent to ${p.method === 'M-Pesa' ? 'your M-Pesa' : `your ${p.method}`}.`)
        }), 2500)
        toast({ tone: 'info', title: 'M-Pesa transfer submitted (simulated)', body: 'Completes automatically when the mock result callback arrives.' })
      } else {
        toast({ tone: 'success', title: 'Manual remittance recorded' })
      }
    },

    /** Buy prepaid SMS credit, paid by M-Pesa (simulated STK push) or from the available balance. */
    topUpSms(merchantId: string, amount: number, method: SmsTopUp['method']): boolean {
      if (isLive) { notYet('SMS credit'); return false }
      const m = data.merchants.find((x) => x.id === merchantId)
      if (!m || amount <= 0) return false
      if (method === 'Balance' && amount > merchantLedger(merchantId, data).available + 0.001) return false
      const topUp: SmsTopUp = {
        id: uid('SMT-'), merchantId, amount: round2(amount), method, reference: `SMS-${m.referencePrefix}-${randomCode(5)}`,
        mpesaReceipt: method === 'M-Pesa' ? mpesaReceipt() : null, at: new Date().toISOString(),
      }
      update((d) => {
        const next = withActivity({ ...d, smsTopUps: [topUp, ...d.smsTopUps] }, { actor, role, action: `Topped up SMS credit by KES ${amount.toLocaleString()} (${method === 'M-Pesa' ? 'M-Pesa' : 'from balance'})`, target: m.name, merchantId })
        return withNotification(next, merchantId, 'SMS credit topped up', `KES ${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })} added to your SMS credit.`)
      })
      toast({ tone: 'success', title: 'SMS credit topped up (simulated)', body: method === 'M-Pesa' ? 'No STK push was sent - demo only.' : 'Deducted from your available balance.' })
      return true
    },

    /** Public "Request access" form on the sign-in page. Always goes to the real API: these are real prospects. */
    requestAccess(r: { business: string; name: string; email: string; phone: string; volume: string; message: string }) {
      return live.requestAccess(r)
    },

    approveAccessRequest(id: string) {
      const r = data.accessRequests?.find((x) => x.id === id)
      if (!r) return
      const mark = (status: 'Approved') => update((d) => ({ ...d, accessRequests: d.accessRequests?.map((x) => (x.id === id ? { ...x, status } : x)) }))
      if (isLive) {
        void live.approveAccessRequest(id).then((m) => {
          putMerchant(m)
          mark('Approved')
          toast({ tone: 'success', title: 'Request approved', body: `${m.name} was created as ${m.id} (Pending Review).` })
        }, failed('Could not approve request'))
        return
      }
      mark('Approved')
      void this.createMerchant({
        name: r.business, legalName: r.business, domain: '', email: r.email, phone: r.phone, contactName: r.name, industry: '', location: '',
        status: 'Pending Review', pricing: { ...data.config.defaultPricing }, payoutSchedule: 'Manual', payoutMethod: 'M-Pesa', payoutDestination: r.phone,
        subscription: 'None', smsAlerts: { enabled: false, recipients: [], enabledAt: null },
      })
    },

    rejectAccessRequest(id: string) {
      const mark = () => update((d) => ({ ...d, accessRequests: d.accessRequests?.map((x) => (x.id === id ? { ...x, status: 'Rejected' as const } : x)) }))
      if (isLive) {
        void live.rejectAccessRequest(id).then(() => { mark(); toast({ tone: 'info', title: 'Request rejected' }) }, failed('Could not reject request'))
        return
      }
      mark()
      toast({ tone: 'info', title: 'Request rejected' })
    },

    markNotificationsRead(audience: string) {
      if (isLive) {
        const uuid = audience === 'admin' ? 'admin' : findMerchant(audience)?.apiId
        if (uuid && data.notifications.some((n) => n.audience === audience && !n.read)) void live.markRead(uuid).catch(() => undefined)
      }
      update((d) => ({ ...d, notifications: d.notifications.map((n) => (n.audience === audience ? { ...n, read: true } : n)) }))
    },

    /**
     * Simulates the full STK push lifecycle for a merchant-initiated payment.
     * Initiated -> Pending (STK push sent) -> Successful/Failed (callback) with attribution
     * via the unique internal reference. No external calls are made.
     */
    simulatePayment(merchantId: string, amount: number, phone: string, outcome: 'success' | 'failure' = 'success', duplicate = false) {
      if (isLive) { notYet('Test payments'); return '' }
      const id = `TXN${Date.now().toString().slice(-6)}${randomCode(3)}`
      update((d) => {
        const m = d.merchants.find((x) => x.id === merchantId)
        if (!m) return d
        const tx: Transaction = {
          id, reference: `${m.referencePrefix}-${randomCode(6)}`, merchantId, domain: m.domain, amount, customerPhone: phone,
          customerName: 'Demo Customer', channel: 'STK Push', description: 'Simulated checkout payment', status: 'Initiated',
          attribution: 'Awaiting callback', mpesaReceipt: null, providerRef: null, fee: 0, providerCharge: 0, smsFee: 0, smsCost: 0,
          initiatedAt: new Date().toISOString(), confirmedAt: null, duplicateCallbacks: 0,
        }
        return withActivity({ ...d, transactions: [tx, ...d.transactions] }, { actor, role, action: 'Simulated STK push payment', target: `${m.name} - ${tx.reference}`, merchantId })
      })
      window.setTimeout(() => update((d) => ({
        ...d,
        transactions: d.transactions.map((t) => (t.id === id ? { ...t, status: 'Pending', providerRef: `ws_CO_${Date.now()}` } : t)),
      })), 1400)
      window.setTimeout(() => update((d) => {
        const m = d.merchants.find((x) => x.id === merchantId)!
        const sms = smsCharge(m, d.config, smsCreditBalance(merchantId, d))
        const smsBlocked = outcome === 'success' && smsPrice(m, d.config).fee > 0 && sms.fee === 0
        let next: DataState = {
          ...d,
          transactions: d.transactions.map((t): Transaction => {
            if (t.id !== id) return t
            if (outcome === 'failure') return { ...t, status: 'Failed', attribution: 'Not applicable', confirmedAt: new Date().toISOString(), failureReason: 'Insufficient M-Pesa balance' }
            return {
              ...t, status: 'Successful', attribution: 'Attributed', confirmedAt: new Date().toISOString(), mpesaReceipt: mpesaReceipt(),
              fee: calcFee(t.amount, m.pricing), providerCharge: calcProviderCharge(t.amount, d.config.costs), duplicateCallbacks: duplicate ? 1 : 0,
              ...smsFields(sms),
            }
          }),
        }
        if (outcome === 'success') {
          next = withNotification(next, merchantId, 'Payment received', `KES ${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })} received from ${maskPhone(phone)}.`)
          if (sms.fee > 0) next = withActivity(next, { actor: 'system', role: 'system', action: `SMS payment alert sent to ${m.smsAlerts.recipients.length} recipient(s)`, target: m.name, merchantId })
          if (smsBlocked) next = withNotification(next, merchantId, 'SMS credit exhausted', 'A payment alert was not sent. Top up your SMS credit to resume alerts.')
        }
        return next
      }), 3600)
      return id
    },
  }), [update, actor, role, toast, data, isLive, asAdmin]) // eslint-disable-line react-hooks/exhaustive-deps
}
