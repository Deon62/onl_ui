import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Bell, CheckCircle2, ChevronDown, ChevronsUpDown, Eye, Info, LogOut, Menu, Moon, Sun, X, XCircle, type LucideIcon,
} from 'lucide-react'
import { useStore } from '../../store/AppStore'
import { fmtRelative } from '../../lib/format'
import { cx, IconButton, MerchantAvatar } from './ui'
import { LogoMark } from './LogoMark'
import { RouteLoader } from './Loading'
import { ROLE_LABEL, type ApiRole } from '../../lib/api'

export interface NavSection {
  title: string
  items: { to: string; label: string; icon: LucideIcon; badge?: number }[]
}

export function Logo({ light = true, compact = false }: { light?: boolean; compact?: boolean }) {
  return <LogoMark tone={light ? 'light' : 'dark'} height={compact ? 22 : 28} />
}

function Sidebar({ sections, footer, onNavigate }: { sections: NavSection[]; footer?: ReactNode; onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-ink">
      <div className="flex h-16 shrink-0 items-center px-5">
        <Logo />
      </div>
      <nav className="flex-1 overflow-y-auto px-3 pb-6 pt-2" aria-label="Main">
        {sections.map((s) => (
          <div key={s.title} className="mb-5">
            <div className="mb-1.5 px-2.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-sidebar-muted">{s.title}</div>
            <ul className="space-y-0.5">
              {s.items.map((it) => (
                <li key={it.to}>
                  <NavLink
                    to={it.to}
                    end={it.to === '/admin' || it.to === '/merchant'}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cx(
                        'group relative flex items-center gap-2.5 rounded-[5px] px-2.5 py-[7px] text-[13px] transition-colors',
                        isActive
                          ? 'font-medium text-white before:absolute before:-left-1 before:top-1/2 before:h-4 before:w-[2px] before:-translate-y-1/2 before:rounded-full before:bg-[#3fae72]'
                          : 'text-sidebar-ink/65 hover:text-white',
                      )
                    }
                  >
                    <it.icon size={16} strokeWidth={1.75} className="shrink-0 opacity-90" />
                    <span className="flex-1 truncate">{it.label}</span>
                    {!!it.badge && <span className="num rounded-[4px] bg-[#d97706]/90 px-1.5 text-[10.5px] font-semibold leading-[17px] text-white">{it.badge}</span>}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      {footer && <div className="border-t border-sidebar-line p-3">{footer}</div>}
    </div>
  )
}

function Notifications({ audience }: { audience: string }) {
  const { data, update } = useStore()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const items = useMemo(() => data.notifications.filter((n) => n.audience === audience).slice(0, 12), [data.notifications, audience])
  const unread = items.filter((n) => !n.read).length
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])
  return (
    <div className="relative" ref={ref}>
      <button
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        onClick={() => setOpen((o) => !o)}
        className="relative inline-flex h-8 w-8 items-center justify-center rounded-[5px] text-muted hover:bg-subtle hover:text-ink"
      >
        <Bell size={16} strokeWidth={1.75} />
        {unread > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full border-2 border-bg bg-error" />}
      </button>
      {open && (
        <div className="anim-pop absolute right-0 top-10 z-40 w-[340px] max-w-[calc(100vw-24px)] rounded-md border border-line bg-card shadow-[0_8px_30px_rgba(0,0,0,0.08)]">
          <div className="flex items-center justify-between border-b border-line-soft px-4 py-3">
            <span className="text-[13px] font-semibold">Notifications</span>
            {unread > 0 && (
              <button
                className="text-[12px] font-medium text-primary hover:underline"
                onClick={() => update((d) => ({ ...d, notifications: d.notifications.map((n) => (n.audience === audience ? { ...n, read: true } : n)) }))}
              >
                Mark all as read
              </button>
            )}
          </div>
          <ul className="max-h-[380px] divide-y divide-line-soft overflow-y-auto">
            {items.length === 0 && <li className="px-4 py-8 text-center text-[13px] text-muted">You're all caught up.</li>}
            {items.map((n) => (
              <li key={n.id} className="flex gap-3 px-4 py-3">
                <span className={cx('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', n.read ? 'bg-transparent' : 'bg-primary')} />
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-ink">{n.title}</div>
                  <div className="mt-0.5 text-[12.5px] leading-snug text-muted">{n.body}</div>
                  <div className="mt-1 text-[11.5px] text-faint">{fmtRelative(n.at)}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/** Admin / Merchant view toggle for admins (merchant users only see their own dashboard) */
function ModeSwitch() {
  const { data, session, viewAsMerchant } = useStore()
  const navigate = useNavigate()
  const mode = useLocation().pathname.startsWith('/merchant') ? 'merchant' : 'admin'
  // Merchant users only ever see their own dashboard
  if (!session || session.role === 'merchant') return null
  const go = (m: 'admin' | 'merchant') => {
    if (m === mode) return
    if (m === 'merchant') {
      if (!session.merchantId) viewAsMerchant(data.merchants[0]?.id ?? null)
      navigate('/merchant')
    } else navigate('/admin')
  }
  return (
    <div role="radiogroup" aria-label="Dashboard mode" className="inline-flex h-8 items-center rounded-[5px] border border-line bg-surface p-0.5 text-[12.5px] font-medium">
      {(['admin', 'merchant'] as const).map((m) => (
        <button
          key={m}
          role="radio"
          aria-checked={mode === m}
          onClick={() => go(m)}
          className={cx('h-full rounded-[3px] px-2.5 transition-colors', mode === m ? 'bg-sidebar text-sidebar-ink' : 'text-muted hover:text-ink')}
        >
          {m === 'admin' ? 'Admin' : 'Merchant'}
        </button>
      ))}
    </div>
  )
}

function MerchantSwitcher() {
  const { data, session, viewAsMerchant } = useStore()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])
  const inMerchant = useLocation().pathname.startsWith('/merchant')
  if (!session || !inMerchant || session.role === 'merchant') return null
  const current = data.merchants.find((m) => m.id === session.merchantId)
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-8 items-center gap-2 rounded-[5px] border border-line bg-surface px-2.5 text-[12.5px] font-medium text-ink hover:bg-subtle"
      >
        {current ? <MerchantAvatar name={current.name} size={18} /> : <Eye size={14} strokeWidth={1.75} className="text-muted" />}
        <span className="hidden max-w-[160px] truncate sm:inline">{current ? current.name : 'Select merchant'}</span>
        <ChevronsUpDown size={13} className="text-muted" />
      </button>
      {open && (
        <div className="anim-pop absolute right-0 top-10 z-40 w-[280px] rounded-md border border-line bg-card py-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.08)]">
          <div className="px-3 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Switch merchant</div>
          {data.merchants.map((m) => (
            <button
              key={m.id}
              onClick={() => { viewAsMerchant(m.id); setOpen(false); navigate('/merchant') }}
              className={cx('flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-subtle', m.id === session.merchantId && 'bg-subtle')}
            >
              <MerchantAvatar name={m.name} size={24} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] text-ink">{m.name}</span>
                <span className="block truncate text-[11.5px] text-muted">{m.id} · {m.domain}</span>
              </span>
              {m.status !== 'Active' && <span className="text-[11px] text-error">{m.status}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function UserMenu() {
  const { session, logout, data } = useStore()
  const inMerchantMode = useLocation().pathname.startsWith('/merchant')
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])
  if (!session) return null
  const merchant = inMerchantMode ? data.merchants.find((m) => m.id === session.merchantId) : null
  const initials = session.name.split(' ').map((w) => w[0]).join('').slice(0, 2)
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-[5px] py-1 pl-1 pr-1.5 hover:bg-subtle">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-soft text-[11.5px] font-semibold text-primary">{initials}</span>
        <span className="hidden text-left leading-tight lg:block">
          <span className="block text-[12.5px] font-medium text-ink">{session.name}</span>
          <span className="block text-[11.5px] text-muted">{merchant ? merchant.name : session.apiRole ? ROLE_LABEL[session.apiRole as ApiRole] ?? 'Admin' : 'Super Admin'}</span>
        </span>
        <ChevronDown size={13} className="text-muted" />
      </button>
      {open && (
        <div className="anim-pop absolute right-0 top-10 z-40 w-56 rounded-md border border-line bg-card py-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.08)]">
          <div className="border-b border-line-soft px-3 pb-2.5 pt-1">
            <div className="text-[13px] font-medium text-ink">{session.name}</div>
            <div className="truncate text-[12px] text-muted">{session.email}</div>
          </div>
          <button
            onClick={() => { logout(); navigate('/login') }}
            className="flex w-full items-center gap-2 px-3 py-2 text-[13px] text-ink hover:bg-subtle"
          >
            <LogOut size={14} strokeWidth={1.75} /> Sign out
          </button>
        </div>
      )}
    </div>
  )
}

export function ToastStack() {
  const { toasts, dismissToast } = useStore()
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[360px] max-w-[calc(100vw-32px)] flex-col gap-2" aria-live="polite">
      {toasts.map((t) => {
        const Icon = t.tone === 'success' ? CheckCircle2 : t.tone === 'error' ? XCircle : Info
        return (
          <div key={t.id} className="anim-pop pointer-events-auto flex gap-3 rounded-md border border-line bg-card px-4 py-3 shadow-[0_8px_30px_rgba(0,0,0,0.1)]">
            <Icon size={16} strokeWidth={1.75} className={cx('mt-0.5 shrink-0', t.tone === 'success' ? 'text-success' : t.tone === 'error' ? 'text-error' : 'text-primary')} />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium text-ink">{t.title}</div>
              {t.body && <div className="mt-0.5 text-[12.5px] text-muted">{t.body}</div>}
            </div>
            <button onClick={() => dismissToast(t.id)} aria-label="Dismiss" className="text-faint hover:text-ink"><X size={14} /></button>
          </div>
        )
      })}
    </div>
  )
}

export function AppShell({ sections, audience, sidebarFooter, banner }: { sections: NavSection[]; audience: string; sidebarFooter?: ReactNode; banner?: ReactNode }) {
  const { theme, toggleTheme } = useStore()
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [location.pathname])

  return (
    <div className="min-h-full">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] lg:block">
        <Sidebar sections={sections} footer={sidebarFooter} />
      </aside>
      {/* Mobile sidebar */}
      {mobileOpen && (
        <div className="anim-fade fixed inset-0 z-50 bg-black/40 lg:hidden" onClick={() => setMobileOpen(false)}>
          <aside className="h-full w-[264px]" onClick={(e) => e.stopPropagation()}>
            <Sidebar sections={sections} footer={sidebarFooter} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}
      <div className="lg:pl-[248px]">
        {banner}
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-bg/90 px-4 backdrop-blur sm:px-6 lg:px-8">
          <IconButton icon={Menu} label="Open navigation" className="lg:hidden" onClick={() => setMobileOpen(true)} />
          <div className="lg:hidden"><Logo light={false} compact /></div>
          <div className="ml-auto flex items-center gap-1.5">
            <ModeSwitch />
            <MerchantSwitcher />
            <IconButton icon={theme === 'dark' ? Sun : Moon} label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} onClick={toggleTheme} />
            <Notifications audience={audience} />
            <div className="mx-1 h-6 w-px bg-line" />
            <UserMenu />
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <RouteLoader scope={audience}>
            <Outlet />
          </RouteLoader>
        </main>
      </div>
      <ToastStack />
    </div>
  )
}
