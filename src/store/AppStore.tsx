/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { DataState, Expense, Merchant, Payout, PlatformConfig, Session, SettlementDetails, SmsTopUp } from '../types'
import { DATA_VERSION, defaultConfig } from '../data/config'
import { uid } from '../lib/rng'
import { pageCache, setLiveLoader } from '../lib/net'
import { ADMIN_ROLES, ApiError, getMe, live, loadWorkspace, signIn, signOut, type ApiMe, type LoginIssued } from '../lib/api'

const SESSION_KEY = 'oryne-session'
const THEME_KEY = 'oryne-theme'

/** Nothing until the API responds. */
const blank = (): DataState => ({
  version: DATA_VERSION, generatedAt: new Date().toISOString(), merchants: [], transactions: [], payouts: [], expenses: [], revenue: [],
  activity: [], paymentLinks: [], smsTopUps: [], notifications: [], accessRequests: [], config: structuredClone(defaultConfig),
})

function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    const s = raw ? (JSON.parse(raw) as Session) : null
    return s?.apiRole ? s : null
  } catch {
    return null
  }
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
  /** Supabase sign-in, then everything the user may see from the API. */
  login: (email: string, password: string) => Promise<{ ok: true; role: Session['role'] } | { ok: false; error: string }>
  /** False until the first load from the API has finished */
  ready: boolean
  /** Reload everything from the API */
  refresh: () => Promise<void>
  logout: () => void
  viewAsMerchant: (merchantId: string | null) => void
  toggleTheme: () => void
}

const StoreContext = createContext<StoreValue | null>(null)

/** `initial` pre-loads state (render tests); normally state comes from the API after sign-in. */
export function AppStoreProvider({ children, initial }: { children: ReactNode; initial?: { data: DataState; session: Session } }) {
  const [data, setData] = useState<DataState>(() => initial?.data ?? blank())
  const [session, setSession] = useState<Session | null>(() => initial?.session ?? loadSession())
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light'))
  const [toasts, setToasts] = useState<Toast[]>([])
  const [ready, setReady] = useState(Boolean(initial))

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

  const lastLoad = useRef(0)
  const inflight = useRef<Promise<void> | null>(null)
  const sessionRef = useRef(session)
  useEffect(() => { sessionRef.current = session }, [session])

  const endSession = useCallback((message?: string) => {
    void signOut()
    setLiveLoader(null)
    setSession(null)
    setData(blank())
    setReady(false)
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
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) endSession(e.message)
        throw e
      } finally {
        inflight.current = null
      }
    })()
    return inflight.current
  }, [endSession])

  // Page loads refresh data, unless it was loaded in the last few seconds
  const pageLoader = useCallback(() => (Date.now() - lastLoad.current < 5000 ? Promise.resolve() : refresh()), [refresh])
  useEffect(() => {
    setLiveLoader(session ? pageLoader : null)
  }, [session, pageLoader])

  // Restoring a session after a page reload
  useEffect(() => {
    if (sessionRef.current && !ready) refresh().catch(() => setReady(true))
  }, [ready, refresh])

  const login = useCallback<StoreValue['login']>(async (email, password) => {
    pageCache.clear()
    try {
      await signIn(email, password)
      const me = await getMe()
      const next = await loadWorkspace(me)
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
  }, [pageLoader])

  const logout = useCallback(() => endSession(), [endSession])
  const viewAsMerchant = useCallback((merchantId: string | null) => {
    setSession((s) => (s && s.role === 'admin' ? { ...s, merchantId } : s))
  }, [])
  const toggleTheme = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), [])

  const value = useMemo<StoreValue>(() => ({
    data, ready, refresh, session, theme, toasts, update, toast, dismissToast, login, logout, viewAsMerchant, toggleTheme,
  }), [data, ready, refresh, session, theme, toasts, update, toast, dismissToast, login, logout, viewAsMerchant, toggleTheme])

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used inside AppStoreProvider')
  return ctx
}

// ---------------------------------------------------------------------------
// Actions: every change goes through the Oryne API.
// Features whose backend arrives with the payments phase report "not live yet".
// ---------------------------------------------------------------------------

export function useActions() {
  const { update, session, toast, data } = useStore()
  const asAdmin = session?.role === 'admin'

  return useMemo(() => {
    /** Put the API's copy of a merchant into local state */
    const putMerchant = (m: Merchant) => update((d) => ({
      ...d,
      merchants: d.merchants.some((x) => x.apiId === m.apiId) ? d.merchants.map((x) => (x.apiId === m.apiId ? m : x)) : [...d.merchants, m],
    }))
    const failed = (title: string) => (e: unknown) => {
      toast({ tone: 'error', title, body: e instanceof Error ? e.message : 'Please try again.' })
      return false as const
    }
    const notYet = (what: string) => toast({ tone: 'info', title: `${what} is not live yet`, body: 'This arrives with payments in the next backend phase.' })
    const findMerchant = (id: string) => data.merchants.find((x) => x.id === id)
    const markRequest = (id: string, status: 'Approved' | 'Rejected') =>
      update((d) => ({ ...d, accessRequests: d.accessRequests?.map((x) => (x.id === id ? { ...x, status } : x)) }))

    return {
      /** Resolves true once saved. */
      async createMerchant(input: Omit<Merchant, 'id' | 'registeredAt' | 'referencePrefix'>): Promise<boolean> {
        return live.createMerchant(input, input.status).then((m) => {
          putMerchant(m)
          toast({ tone: 'success', title: 'Merchant created', body: `${m.name} is ${m.id}.` })
          return true
        }, failed('Could not create merchant'))
      },

      /** Admin edit of any merchant field. Resolves true once saved. */
      async updateMerchant(id: string, patch: Partial<Merchant>, _note?: string): Promise<boolean> {
        const target = findMerchant(id)
        if (!target) return false
        return live.updateMerchant(target, patch).then((m) => {
          putMerchant(m)
          toast({ tone: 'success', title: 'Changes saved' })
          return true
        }, failed('Could not save changes'))
      },

      /** The merchant's own contact details (Business Profile page). */
      async updateProfile(id: string, patch: Pick<Merchant, 'contactName' | 'phone' | 'location' | 'industry'>): Promise<boolean> {
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
        const target = findMerchant(id)
        if (!target) return
        void live.setStatus(target, status).then((m) => {
          putMerchant(m)
          toast({ tone: status === 'Suspended' ? 'info' : 'success', title: `Merchant ${status === 'Suspended' ? 'suspended' : 'activated'}` })
        }, failed('Could not change status'))
      },

      /** Payout accounts. These throw on failure so the caller's useAsyncAction can show the error inline. */
      async addPayoutAccount(merchantId: string, method: Merchant['payoutMethod'], details: SettlementDetails, makeDefault: boolean) {
        const m = findMerchant(merchantId)
        if (!m) return
        putMerchant(await live.addPayoutAccount(m, method, details, makeDefault, asAdmin))
        toast({ tone: 'success', title: 'Payout account added' })
      },

      async setDefaultPayoutAccount(merchantId: string, accountId: string) {
        const m = findMerchant(merchantId)
        if (!m) return
        putMerchant(await live.setDefaultPayoutAccount(m, accountId, asAdmin))
        toast({ tone: 'success', title: 'Default account changed' })
      },

      async removePayoutAccount(merchantId: string, accountId: string) {
        const m = findMerchant(merchantId)
        if (!m) return
        putMerchant(await live.removePayoutAccount(m, accountId, asAdmin))
        toast({ tone: 'info', title: 'Payout account removed' })
      },

      async setPayoutSchedule(merchantId: string, schedule: Merchant['payoutSchedule']): Promise<boolean> {
        const m = findMerchant(merchantId)
        if (!m) return false
        return live.setPayoutSchedule(m, schedule, asAdmin).then((saved) => {
          putMerchant(saved)
          toast({ tone: 'success', title: `Payouts set to ${schedule.toLowerCase()}` })
          return true
        }, failed('Could not change schedule'))
      },

      /** Set a new password for the merchant's owner and (optionally) email it. Throws on failure. */
      async sendLogin(merchantId: string, sendEmail: boolean): Promise<LoginIssued> {
        const m = findMerchant(merchantId)
        if (!m?.apiId) throw new Error('Merchant not found.')
        return live.sendLogin(m.apiId, sendEmail)
      },

      /** Public "Request access" form on the sign-in page. */
      requestAccess(r: { business: string; name: string; email: string; phone: string; domain: string; volume: string; message: string }) {
        return live.requestAccess(r)
      },

      /** Creates the merchant account and the requester's login. Throws on failure; the caller shows the error. */
      async approveAccessRequest(id: string, account: Partial<Merchant>, sendEmail: boolean): Promise<{ merchant: Merchant; login: LoginIssued }> {
        const res = await live.approveAccessRequest(id, account, sendEmail)
        putMerchant(res.merchant)
        markRequest(id, 'Approved')
        return res
      },

      async rejectAccessRequest(id: string, reason = ''): Promise<boolean> {
        return live.rejectAccessRequest(id, reason).then(() => {
          markRequest(id, 'Rejected')
          toast({ tone: 'info', title: 'Request rejected' })
          return true
        }, failed('Could not reject request'))
      },

      markNotificationsRead(audience: string) {
        const uuid = audience === 'admin' ? 'admin' : findMerchant(audience)?.apiId
        if (uuid && data.notifications.some((n) => n.audience === audience && !n.read)) void live.markRead(uuid).catch(() => undefined)
        update((d) => ({ ...d, notifications: d.notifications.map((n) => (n.audience === audience ? { ...n, read: true } : n)) }))
      },

      saveExpense(e: Omit<Expense, 'id'> & { id?: string }) {
        void live.saveExpense(e).then((saved) => {
          update((d) => ({
            ...d,
            expenses: d.expenses.some((x) => x.id === saved.id) ? d.expenses.map((x) => (x.id === saved.id ? saved : x)) : [saved, ...d.expenses],
          }))
          toast({ tone: 'success', title: e.id ? 'Expense updated' : 'Expense recorded' })
        }, failed('Could not save expense'))
      },

      deleteExpense(id: string) {
        void live.deleteExpense(id).then(() => {
          update((d) => ({ ...d, expenses: d.expenses.filter((x) => x.id !== id) }))
          toast({ tone: 'info', title: 'Expense deleted' })
        }, failed('Could not delete expense'))
      },

      // --- Payments phase -------------------------------------------------------------------------
      requestPayout(_merchantId: string, _amount: number, _destination: string, _initiatedBy: Payout['initiatedBy']): Payout | null {
        notYet('Payouts')
        return null
      },
      setPayoutStatus(_id: string, _status: Payout['status'], _failureReason?: string) { notYet('Payouts') },
      remitPayout(_id: string, _mode: 'B2C' | 'Manual') { notYet('Payouts') },
      /** No config endpoint yet: applies for this session only and says so. */
      updateConfig(patch: Partial<PlatformConfig>, title = 'Changes saved') {
        update((d) => ({ ...d, config: { ...d.config, ...patch } }))
        toast({ tone: 'success', title, body: 'Applies to this session. Server storage arrives with the config API.' })
      },
      attributeTransaction(_txId: string, _merchantId: string) { notYet('Attribution') },
      refundTransaction(_txId: string) { notYet('Refunds') },
      createPaymentLink(_merchantId: string, _title: string, _amount: number | null) { notYet('Payment links') },
      togglePaymentLink(_id: string) { notYet('Payment links') },
      /** SMS alerts go to the merchant's own phones. Throws on failure. */
      async updateSmsAlerts(merchantId: string, enabled: boolean, recipients: string[]) {
        const m = findMerchant(merchantId)
        if (!m) return
        putMerchant(await live.updateSmsAlerts(m, enabled, recipients, asAdmin))
        toast({ tone: 'success', title: enabled ? 'SMS alerts on' : 'SMS alerts off' })
      },

      /** Sends a sample alert to the saved numbers. Throws if it could not be sent. */
      async testSms(merchantId: string) {
        const m = findMerchant(merchantId)
        if (!m) return
        const r = await live.testSms(m, asAdmin)
        if (r.sent.length === 0) throw new Error(r.error ?? 'The test SMS was not sent.')
        toast({ tone: 'success', title: 'Test SMS sent', body: r.failed.length ? `Sent to ${r.sent.length}, failed for ${r.failed.length}.` : undefined })
      },
      topUpSms(_merchantId: string, _amount: number, _method: SmsTopUp['method']): boolean {
        notYet('SMS credit')
        return false
      },
      simulatePayment(_merchantId: string, _amount: number, _phone: string, _outcome?: 'success' | 'failure', _duplicate?: boolean): string {
        notYet('Test payments')
        return ''
      },
    }
  }, [update, toast, data, asAdmin])
}
