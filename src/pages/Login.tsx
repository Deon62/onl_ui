import { useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, CheckCircle2 } from 'lucide-react'
import { useActions, useStore } from '../store/AppStore'
import { normalizePhone } from '../lib/format'
import { Logo } from '../components/shared/Layout'
import { Select } from '../components/shared/ui'
import { PasswordInput } from '../components/shared/Password'
import { Spinner } from '../components/shared/Spinner'
import { useAsyncAction } from '../components/shared/Loading'

const sharpInput = 'h-10 w-full border border-line bg-surface px-3 text-[13.5px] text-ink placeholder:text-faint focus:border-ink focus:outline-none'
const primaryBtn = 'mt-6 inline-flex h-10 w-full items-center justify-center gap-2 bg-sidebar text-[13.5px] font-medium text-white transition-colors hover:brightness-125 disabled:opacity-60'

export function LoginPage() {
  const [view, setView] = useState<'login' | 'request'>('login')
  return (
    <div className="grid min-h-full lg:grid-cols-2">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-12 lg:flex">
        <Logo />
        <h1 className="text-[40px] font-semibold leading-[1.1] tracking-[-0.02em] text-white">
          One network.<br />Every transaction.
        </h1>
        <p className="text-[12px] text-sidebar-muted">Oryne Network Limited</p>
        <svg className="pointer-events-none absolute -right-40 -top-40 opacity-[0.07]" width="560" height="560" viewBox="0 0 560 560" aria-hidden>
          {[270, 210, 150, 90].map((r) => <circle key={r} cx="280" cy="280" r={r} fill="none" stroke="#fff" strokeWidth="1.5" />)}
        </svg>
      </aside>

      <main className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-[380px]">
          <div className="mb-8 lg:hidden"><Logo light={false} /></div>
          {view === 'login' ? <LoginForm onRequest={() => setView('request')} /> : <RequestForm onBack={() => setView('login')} />}
        </div>
      </main>
    </div>
  )
}

function LoginForm({ onRequest }: { onRequest: () => void }) {
  const { login } = useStore()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    if (!email.trim() || !password) {
      setLoading(false)
      return setError('Enter your email and password.')
    }
    login(email, password)
      .then((res) => {
        if (!res.ok) return setError(res.error)
        navigate(res.role === 'merchant' ? '/merchant' : '/admin', { replace: true })
      })
      .finally(() => setLoading(false))
  }

  return (
    <>
      <form onSubmit={submit} className="anim-fade border border-line bg-card p-8">
        <h2 className="text-[18px] font-semibold tracking-[-0.01em]">Sign in</h2>
        <SharpField label="Email" className="mt-7">
          <input className={sharpInput} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        </SharpField>
        <SharpField label="Password" className="mt-4">
          <PasswordInput inputClassName={sharpInput} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </SharpField>
        {error && <p role="alert" className="mt-3 text-[12.5px] text-error">{error}</p>}
        <button type="submit" disabled={loading} className={primaryBtn}>
          {loading ? <><Spinner size={15} /> Signing in</> : <>Sign in <ArrowRight size={15} /></>}
        </button>
      </form>
      <p className="mt-5 text-center text-[13px] text-muted">
        No account?{' '}
        <button type="button" onClick={onRequest} className="font-medium text-ink underline-offset-4 hover:underline">Request access</button>
      </p>
    </>
  )
}

const empty = { business: '', name: '', email: '', phone: '', domain: '', volume: '', message: '' }

/** "https://www.Shop.co.ke/path" -> "shop.co.ke"; null if it is not a domain */
function cleanDomain(raw: string): string | null {
  const d = raw.trim().toLowerCase().replace(/^[a-z]+:\/\//, '').split(/[/?#]/)[0].replace(/:\d+$/, '').replace(/^www\./, '').replace(/\.$/, '')
  return /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(d) ? d : null
}

function RequestForm({ onBack }: { onBack: () => void }) {
  const actions = useActions()
  const { run, pending, error: netError } = useAsyncAction()
  const [f, setF] = useState(empty)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof typeof empty, v: string) => setF((p) => ({ ...p, [k]: v }))

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!normalizePhone(f.phone)) return setError('Enter a valid Kenyan phone number.')
    const domain = cleanDomain(f.domain)
    if (!domain) return setError('Enter your website, e.g. mybusiness.co.ke')
    if (!f.volume) return setError('Select your expected monthly volume.')
    setError(null)
    void run(() => actions.requestAccess({ ...f, domain })).then((r) => { if (r.ok) setSent(true) })
  }

  if (sent) {
    return (
      <div className="anim-fade border border-line bg-card p-8 text-center">
        <CheckCircle2 size={32} strokeWidth={1.5} className="mx-auto text-success" />
        <h2 className="mt-4 text-[17px] font-semibold">Request received</h2>
        <p className="mt-2 text-[13px] text-muted">We will review {f.business} and contact you at {f.email}.</p>
        <button type="button" onClick={onBack} className={primaryBtn}>Back to sign in</button>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="anim-fade border border-line bg-card p-8">
      <button type="button" onClick={onBack} className="mb-5 inline-flex items-center gap-1.5 text-[12.5px] text-muted hover:text-ink">
        <ArrowLeft size={14} /> Sign in
      </button>
      <h2 className="text-[18px] font-semibold tracking-[-0.01em]">Request access</h2>
      <SharpField label="Business name" className="mt-6">
        <input className={sharpInput} value={f.business} onChange={(e) => set('business', e.target.value)} required autoFocus />
      </SharpField>
      <SharpField label="Your name" className="mt-4">
        <input className={sharpInput} value={f.name} onChange={(e) => set('name', e.target.value)} required autoComplete="name" />
      </SharpField>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <SharpField label="Email">
          <input className={sharpInput} type="email" value={f.email} onChange={(e) => set('email', e.target.value)} required autoComplete="email" />
        </SharpField>
        <SharpField label="Phone">
          <input className={sharpInput} value={f.phone} onChange={(e) => set('phone', e.target.value)} placeholder="07XX XXX XXX" required autoComplete="tel" />
        </SharpField>
      </div>
      <SharpField label="Website" className="mt-4">
        <input className={sharpInput} value={f.domain} onChange={(e) => set('domain', e.target.value)} placeholder="mybusiness.co.ke" required autoComplete="url" inputMode="url" />
      </SharpField>
      <SharpField label="Expected monthly volume" className="mt-4" as="div">
        <Select value={f.volume} onChange={(e) => set('volume', e.target.value)} placeholder="Select" className="h-10! rounded-none!" aria-label="Expected monthly volume">
          <option>Under KES 100,000</option>
          <option>KES 100,000 - 500,000</option>
          <option>KES 500,000 - 2,000,000</option>
          <option>Over KES 2,000,000</option>
        </Select>
      </SharpField>
      <SharpField label="Anything else (optional)" className="mt-4">
        <textarea className={`${sharpInput} h-20 resize-none py-2`} value={f.message} onChange={(e) => set('message', e.target.value)} />
      </SharpField>
      {(error || netError) && <p role="alert" className="mt-3 text-[12.5px] text-error">{error || netError}</p>}
      <button type="submit" disabled={pending} className={primaryBtn}>{pending ? <><Spinner size={15} /> Submitting</> : 'Submit request'}</button>
    </form>
  )
}

function SharpField({ label, children, className, as = 'label' }: { label: string; children: ReactNode; className?: string; as?: 'label' | 'div' }) {
  const Tag = as
  return (
    <Tag className={`block ${className ?? ''}`}>
      <span className="mb-1.5 block text-[12px] font-medium text-muted">{label}</span>
      {children}
    </Tag>
  )
}
