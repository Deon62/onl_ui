import { useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { Spinner } from './Spinner'
import {
  AlertTriangle, ArrowDownRight, ArrowUpRight, Ban, CheckCircle2, CircleDashed, Clock, HelpCircle, Loader2, RotateCcw, Search, Undo2, X, XCircle,
  type LucideIcon,
} from 'lucide-react'

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dark'
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BtnVariant
  size?: 'sm' | 'md'
  icon?: LucideIcon
  iconRight?: LucideIcon
  loading?: boolean
}

export function Button({ variant = 'secondary', size = 'md', icon: Icon, iconRight: IconRight, loading, className, children, disabled, ...rest }: ButtonProps) {
  const styles: Record<BtnVariant, string> = {
    primary: 'bg-primary text-primary-ink border-primary hover:brightness-110',
    secondary: 'bg-surface text-ink border-line hover:bg-subtle',
    ghost: 'bg-transparent text-ink border-transparent hover:bg-subtle',
    danger: 'bg-surface text-error border-line hover:bg-error-soft',
    dark: 'bg-sidebar text-sidebar-ink border-sidebar hover:brightness-125',
  }
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[5px] border font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'h-7 px-2.5 text-[12.5px]' : 'h-9 px-3.5 text-[13px]',
        styles[variant],
        className,
      )}
    >
      {loading ? <Spinner size={14} /> : Icon && <Icon size={size === 'sm' ? 13 : 15} strokeWidth={1.75} />}
      {children}
      {IconRight && <IconRight size={14} strokeWidth={1.75} />}
    </button>
  )
}

export function IconButton({ icon: Icon, label, className, ...rest }: { icon: LucideIcon; label: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      aria-label={label}
      title={label}
      className={cx('inline-flex h-8 w-8 items-center justify-center rounded-[5px] text-muted transition-colors hover:bg-subtle hover:text-ink', className)}
    >
      <Icon size={16} strokeWidth={1.75} />
    </button>
  )
}

// ---------------------------------------------------------------------------
// Layout primitives
// ---------------------------------------------------------------------------

/**
 * Page-level toolbar. Titles and descriptions are not displayed (the sidebar shows where you are);
 * the title is kept for screen readers only.
 */
export function PageHeader({ title, actions }: { title: string; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <>
      <h1 className="sr-only">{title}</h1>
      {actions && <div className="mb-5 flex flex-wrap items-center justify-end gap-2">{actions}</div>}
    </>
  )
}

export function Card({ title, subtitle, actions, children, className, bodyClassName, flush }: {
  title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string; flush?: boolean
}) {
  return (
    <section className={cx('rounded-md border border-line bg-card', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line-soft px-5 py-3.5">
          <div className="min-w-0">
            {title && <h2 className="text-[14px] font-semibold text-ink">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-[12.5px] text-muted">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cx(!flush && 'p-5', bodyClassName)}>{children}</div>
    </section>
  )
}

export function StatCard({ label, value, hint, icon: Icon, delta, deltaGood = true, accent, footer }: {
  label: string; value: ReactNode; hint?: ReactNode; icon?: LucideIcon; delta?: number | null; deltaGood?: boolean; accent?: string; footer?: ReactNode
}) {
  const up = (delta ?? 0) >= 0
  const good = up === deltaGood
  return (
    <div className="flex flex-col rounded-md border border-line bg-card px-4 py-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12.5px] font-medium text-muted">{label}</span>
        {Icon && <Icon size={15} strokeWidth={1.75} className="text-faint" />}
      </div>
      <div className="num mt-2.5 text-[20px] font-semibold tracking-[-0.01em] text-ink" style={accent ? { color: accent } : undefined}>{value}</div>
      <div className="mt-1.5 flex min-h-[18px] flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted">
        {delta !== undefined && delta !== null && Number.isFinite(delta) && (
          <span className={cx('num inline-flex items-center gap-0.5 font-medium', good ? 'text-success' : 'text-error')}>
            {up ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
            {Math.abs(delta).toFixed(1)}%
          </span>
        )}
        {hint && <span>{hint}</span>}
      </div>
      {footer && <div className="mt-3 border-t border-line-soft pt-2.5 text-[12px] text-muted">{footer}</div>}
    </div>
  )
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{children}</div>
}

export function DemoBadge({ className, children = 'Demo data' }: { className?: string; children?: ReactNode }) {
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-[4px] border border-warning/40 bg-warning-soft px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-warning', className)}>
      {children}
    </span>
  )
}

export function Notice({ tone = 'info', title, children, icon }: { tone?: 'info' | 'warning' | 'success' | 'error'; title?: ReactNode; children?: ReactNode; icon?: LucideIcon }) {
  const t = {
    info: ['bg-info-soft border-line', 'text-muted', HelpCircle],
    warning: ['bg-warning-soft border-warning/30', 'text-warning', AlertTriangle],
    success: ['bg-success-soft border-success/30', 'text-success', CheckCircle2],
    error: ['bg-error-soft border-error/30', 'text-error', XCircle],
  }[tone] as [string, string, LucideIcon]
  const Icon = icon ?? t[2]
  return (
    <div className={cx('flex gap-3 rounded-md border px-4 py-3 text-[13px]', t[0])}>
      <Icon size={16} strokeWidth={1.75} className={cx('mt-0.5 shrink-0', t[1])} />
      <div className="min-w-0 leading-relaxed text-ink">
        {title && <div className="font-medium">{title}</div>}
        {children && <div className={cx(!!title && 'mt-0.5', 'text-muted')}>{children}</div>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

export type Tone = 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'primary'

export function Badge({ tone = 'neutral', icon: Icon, children, className }: { tone?: Tone; icon?: LucideIcon; children: ReactNode; className?: string }) {
  const t: Record<Tone, string> = {
    success: 'bg-success-soft text-success',
    warning: 'bg-warning-soft text-warning',
    error: 'bg-error-soft text-error',
    info: 'bg-info-soft text-muted',
    neutral: 'bg-subtle text-muted',
    primary: 'bg-primary-soft text-primary',
  }
  return (
    <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-[4px] px-1.5 py-[3px] text-[11.5px] font-medium leading-none', t[tone], className)}>
      {Icon && <Icon size={12} strokeWidth={2} />}
      {children}
    </span>
  )
}

const STATUS_MAP: Record<string, [Tone, LucideIcon]> = {
  Successful: ['success', CheckCircle2],
  Completed: ['success', CheckCircle2],
  Active: ['success', CheckCircle2],
  Paid: ['success', CheckCircle2],
  Attributed: ['success', CheckCircle2],
  Matched: ['success', CheckCircle2],
  'Manually attributed': ['primary', CheckCircle2],
  Pending: ['warning', Clock],
  Processing: ['warning', Loader2],
  'Pending Review': ['warning', Clock],
  'Awaiting callback': ['warning', Clock],
  Awaiting: ['warning', Clock],
  Initiated: ['info', CircleDashed],
  Failed: ['error', XCircle],
  'Failed payment': ['error', XCircle],
  Overdue: ['error', AlertTriangle],
  Cancelled: ['neutral', Ban],
  Suspended: ['error', Ban],
  Revoked: ['neutral', Ban],
  Disabled: ['neutral', Ban],
  Reversed: ['neutral', RotateCcw],
  Refunded: ['neutral', Undo2],
  Unmatched: ['warning', AlertTriangle],
  'Duplicate ignored': ['info', CircleDashed],
  'Not applicable': ['neutral', CircleDashed],
}

export function StatusBadge({ status }: { status: string }) {
  const [tone, Icon] = STATUS_MAP[status] ?? ['neutral', CircleDashed]
  return <Badge tone={tone} icon={Icon}>{status}</Badge>
}

// ---------------------------------------------------------------------------
// Form controls
// ---------------------------------------------------------------------------

const controlCls = 'h-9 w-full rounded-[5px] border border-line bg-surface px-3 text-[13px] text-ink placeholder:text-faint transition-colors focus:border-primary focus:outline-none disabled:opacity-60'

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={cx(controlCls, className)} />
}

export { Select } from './Select'

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} className={cx(controlCls, 'h-auto min-h-[80px] py-2', className)} />
}

export function Field({ label, hint, error, children, className }: { label: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1.5 block text-[12.5px] font-medium text-ink">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-[12px] text-error">{error}</span> : hint ? <span className="mt-1 block text-[12px] text-muted">{hint}</span> : null}
    </label>
  )
}

export function SearchInput({ value, onChange, placeholder = 'Search', className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={cx('relative', className)}>
      <Search size={15} strokeWidth={1.75} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={cx(controlCls, 'pl-8')} />
      {value && (
        <button onClick={() => onChange('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 text-faint hover:text-ink">
          <X size={14} />
        </button>
      )}
    </div>
  )
}

export function Segmented<T extends string>({ options, value, onChange, size = 'md' }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; size?: 'sm' | 'md' }) {
  return (
    <div className="inline-flex rounded-[6px] border border-line bg-surface p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'rounded-[4px] font-medium transition-colors',
            size === 'sm' ? 'px-2 py-1 text-[12px]' : 'px-2.5 py-1 text-[12.5px]',
            value === o.value ? 'bg-sidebar text-sidebar-ink' : 'text-muted hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cx('relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors', checked ? 'bg-primary' : 'bg-line')}
    >
      <span className={cx('inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform', checked ? 'translate-x-[18px]' : 'translate-x-0.5')} />
    </button>
  )
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { value: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="mb-5 flex gap-5 overflow-x-auto border-b border-line">
      {tabs.map((t) => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          className={cx(
            '-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 pb-2.5 pt-1 text-[13px] font-medium transition-colors',
            value === t.value ? 'border-primary text-ink' : 'border-transparent text-muted hover:text-ink',
          )}
        >
          {t.label}
          {t.count !== undefined && <span className="num rounded-[4px] bg-subtle px-1.5 text-[11px] text-muted">{t.count}</span>}
        </button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Overlays
// ---------------------------------------------------------------------------

function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', h)
      document.body.style.overflow = prev
    }
  }, [open, onClose])
}

export function Modal({ open, onClose, title, description, children, footer, size = 'md' }: {
  open: boolean; onClose: () => void; title: ReactNode; description?: ReactNode; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg'
}) {
  useEscape(open, onClose)
  if (!open) return null
  const w = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl' }[size]
  return (
    <div className="anim-fade fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" className={cx('anim-pop flex max-h-[92vh] w-full flex-col rounded-t-lg border border-line bg-card sm:rounded-lg', w)} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-line-soft px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
            {description && <p className="mt-0.5 text-[12.5px] text-muted">{description}</p>}
          </div>
          <IconButton icon={X} label="Close" onClick={onClose} className="-mr-1.5 -mt-1" />
        </div>
        <div className="overflow-y-auto px-5 py-5">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line-soft px-5 py-3.5">{footer}</div>}
      </div>
    </div>
  )
}

export function Drawer({ open, onClose, title, subtitle, children, footer }: {
  open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode
}) {
  useEscape(open, onClose)
  if (!open) return null
  return (
    <div className="anim-fade fixed inset-0 z-50 flex justify-end bg-black/30" onMouseDown={onClose}>
      <aside role="dialog" aria-modal="true" className="anim-slide flex h-full w-full max-w-[520px] flex-col border-l border-line bg-card" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-line-soft px-6 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-semibold text-ink">{title}</h2>
            {subtitle && <div className="mt-0.5 text-[12.5px] text-muted">{subtitle}</div>}
          </div>
          <IconButton icon={X} label="Close" onClick={onClose} className="-mr-2" />
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line-soft px-6 py-3.5">{footer}</div>}
      </aside>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Data display helpers
// ---------------------------------------------------------------------------

export function KeyValue({ rows, className }: { rows: [ReactNode, ReactNode][]; className?: string }) {
  return (
    <dl className={cx('divide-y divide-line-soft', className)}>
      {rows.map(([k, v], i) => (
        <div key={i} className="flex items-start justify-between gap-6 py-2.5 text-[13px]">
          <dt className="shrink-0 text-muted">{k}</dt>
          <dd className="min-w-0 break-words text-right text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Accounting statement: label/amount lines with subtotal rules */
export function Statement({ lines }: { lines: { label: ReactNode; value: string; kind?: 'add' | 'less' | 'total' | 'subtotal' | 'muted'; note?: ReactNode }[] }) {
  return (
    <div className="text-[13px]">
      {lines.map((l, i) => (
        <div
          key={i}
          className={cx(
            'flex items-baseline justify-between gap-4 py-2',
            l.kind === 'total' && 'mt-1 border-t-2 border-ink/80 pt-3 text-[14px] font-semibold',
            l.kind === 'subtotal' && 'border-t border-line font-medium',
            l.kind === 'muted' && 'text-muted',
          )}
        >
          <div className="min-w-0">
            <span className={cx(l.kind === 'less' && 'text-muted')}>{l.kind === 'less' ? 'Less: ' : ''}</span>
            <span>{l.label}</span>
            {l.note && <div className="text-[12px] font-normal text-muted">{l.note}</div>}
          </div>
          <span className={cx('num shrink-0', l.kind === 'less' && 'text-muted')}>{l.kind === 'less' ? `(${l.value})` : l.value}</span>
        </div>
      ))}
    </div>
  )
}

export function EmptyState({ icon: Icon = Search, title, description, action }: { icon?: LucideIcon; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md border border-line bg-surface">
        <Icon size={18} strokeWidth={1.75} className="text-muted" />
      </div>
      <div className="text-[14px] font-medium text-ink">{title}</div>
      {description && <p className="mt-1 max-w-sm text-[13px] text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function MerchantAvatar({ name, size = 28 }: { name: string; size?: number }) {
  const initials = name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-[5px] bg-sidebar font-semibold text-sidebar-ink"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials}
    </span>
  )
}

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx('mono text-ink', className)}>{children}</span>
}
