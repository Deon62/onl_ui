import { useState, type InputHTMLAttributes } from 'react'
import { Check, Copy, Eye, EyeOff, MailCheck, MailX } from 'lucide-react'
import { changePassword, type LoginIssued } from '../../lib/api'
import { useStore } from '../../store/AppStore'
import { Button, Card, Field, Modal, Notice, cx } from './ui'

/** Password input with a show/hide eye. `inputClassName` styles the input itself. */
export function PasswordInput({ inputClassName, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { inputClassName?: string }) {
  const [show, setShow] = useState(false)
  return (
    <div className={cx('relative', className)}>
      <input {...rest} type={show ? 'text' : 'password'} className={cx(inputClassName, 'pr-10')} />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? 'Hide password' : 'Show password'}
        aria-pressed={show}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-faint transition-colors hover:text-ink"
      >
        {show ? <EyeOff size={16} strokeWidth={1.75} /> : <Eye size={16} strokeWidth={1.75} />}
      </button>
    </div>
  )
}

const controlCls = 'h-9 w-full rounded-[5px] border border-line bg-surface px-3 text-[13px] text-ink placeholder:text-faint transition-colors focus:border-primary focus:outline-none'

/** The signed-in user sets a new password (Supabase Auth). */
export function ChangePasswordCard() {
  const { toast } = useStore()
  const [pw, setPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (pw.length < 10) return setError('Use at least 10 characters.')
    if (pw !== confirm) return setError('The passwords do not match.')
    setError(null)
    setSaving(true)
    try {
      await changePassword(pw)
      setPw('')
      setConfirm('')
      toast({ tone: 'success', title: 'Password changed', body: 'Use your new password next time you sign in.' })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change the password.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card title="Password" subtitle="Replace the temporary password you were sent with one only you know.">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="New password">
          <PasswordInput inputClassName={controlCls} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
        </Field>
        <Field label="Confirm new password" error={error}>
          <PasswordInput inputClassName={controlCls} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
        </Field>
      </div>
      <div className="mt-4 flex justify-end">
        <Button variant="primary" loading={saving} disabled={!pw || !confirm} onClick={() => void save()}>Change password</Button>
      </div>
    </Card>
  )
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      size="sm"
      icon={copied ? Check : Copy}
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1800)
        })
      }}
    >
      {copied ? 'Copied' : label}
    </Button>
  )
}

/** Shows a freshly issued login once: email, password (copyable) and whether the email went out. */
export function CredentialsModal({ login, business, onClose }: { login: LoginIssued; business: string; onClose: () => void }) {
  const [show, setShow] = useState(true)
  const message = `Hi, your Oryne account for ${business} is ready.\n\nSign in: ${login.loginUrl}\nEmail: ${login.email}\nTemporary password: ${login.password}\n\nPlease change the password after you sign in (Settings > Password).`
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="Login details"
      description={`For ${business}. The password is shown only now, so copy it before closing.`}
      footer={<Button variant="primary" onClick={onClose}>Done</Button>}
    >
      <div className="space-y-4">
        {login.emailSent
          ? <Notice tone="success" icon={MailCheck} title="Email sent">We emailed these details to {login.email}.</Notice>
          : <Notice tone="warning" icon={MailX} title="Email not sent">{login.emailError ?? 'Send these details to the merchant yourself.'}</Notice>}
        <div className="rounded-md border border-line bg-subtle/60">
          <div className="flex items-center justify-between gap-3 border-b border-line-soft px-4 py-3">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Email</div>
              <div className="mt-0.5 truncate text-[13.5px] text-ink">{login.email}</div>
            </div>
            <CopyButton text={login.email} label="Copy" />
          </div>
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Temporary password</div>
              <div className="mt-0.5 flex items-center gap-2">
                <span className="font-mono text-[15px] tracking-[0.04em] text-ink">{show ? login.password : '•'.repeat(login.password.length)}</span>
                <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'} className="text-faint hover:text-ink">
                  {show ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
            <CopyButton text={login.password} label="Copy" />
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 text-[12.5px] text-muted">
          <span>Sending it yourself? Copy a ready-to-send message.</span>
          <CopyButton text={message} label="Copy message" />
        </div>
      </div>
    </Modal>
  )
}
