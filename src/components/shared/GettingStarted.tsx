import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Check, X } from 'lucide-react'
import { cx, IconButton } from './ui'

export interface SetupStep {
  title: string
  description: string
  to?: string
  cta?: string
  /** undefined = review step, marked done once the user opens it */
  done?: boolean
  optional?: boolean
}

/** Onboarding checklist shown to new accounts until they have activity */
export function GettingStarted({ id, title = 'Get started', steps }: { id: string; title?: string; steps: SetupStep[] }) {
  const storageKey = `oryne-setup-dismissed:${id}`
  const visitedKey = `${storageKey}:visited`
  const [hidden, setHidden] = useState(() => localStorage.getItem(storageKey) === '1')
  const [visited, setVisited] = useState<string[]>(() => JSON.parse(localStorage.getItem(visitedKey) ?? '[]') as string[])
  if (hidden) return null
  const dismiss = () => { localStorage.setItem(storageKey, '1'); setHidden(true) }
  const visit = (title: string) => {
    if (visited.includes(title)) return
    const next = [...visited, title]
    localStorage.setItem(visitedKey, JSON.stringify(next))
    setVisited(next)
  }
  const resolved = steps.map((s) => ({ ...s, done: s.done ?? visited.includes(s.title) }))
  const tracked = resolved.filter((s) => !s.optional)
  const complete = tracked.filter((s) => s.done).length
  return (
    <section className="mb-6 rounded-md border border-line bg-card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft px-5 py-3.5">
        <h2 className="text-[14px] font-semibold text-ink">{title}</h2>
        <div className="flex items-center gap-2.5 text-[12px] text-muted">
          <span className="num">{complete} of {tracked.length} done</span>
          <span className="h-1.5 w-24 overflow-hidden rounded-full bg-subtle">
            <span className="block h-full rounded-full bg-success transition-[width]" style={{ width: `${tracked.length ? (complete / tracked.length) * 100 : 0}%` }} />
          </span>
          <IconButton icon={X} label="Close setup checklist" onClick={dismiss} className="-mr-1.5" />
        </div>
      </header>
      <ol className="divide-y divide-line-soft">
        {resolved.map((s, i) => (
          <li key={s.title} className="flex items-center gap-4 px-5 py-3.5">
            <span className={cx(
              'num flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11.5px] font-semibold',
              s.done ? 'border-success bg-success text-white' : 'border-line text-muted',
            )}>
              {s.done ? <Check size={13} strokeWidth={2.5} /> : i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className={cx('text-[13.5px] font-medium', s.done ? 'text-muted line-through decoration-line' : 'text-ink')}>
                {s.title}{s.optional && <span className="ml-1.5 text-[11.5px] font-normal text-muted no-underline">Optional</span>}
              </div>
              <div className="text-[12.5px] text-muted">{s.description}</div>
            </div>
            {s.to && !s.done && (
              <Link to={s.to} onClick={() => visit(s.title)} className="inline-flex shrink-0 items-center gap-1 rounded-[5px] border border-line px-2.5 py-1.5 text-[12.5px] font-medium text-ink transition-colors hover:bg-subtle">
                {s.cta ?? 'Open'} <ArrowRight size={13} />
              </Link>
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}
