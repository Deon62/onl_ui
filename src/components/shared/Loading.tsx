import { Component, useCallback, useEffect, useState, type ErrorInfo, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { LineWobble } from 'ldrs/react'
import 'ldrs/react/LineWobble.css'
import { AlertTriangle, RotateCw, WifiOff } from 'lucide-react'
import { NetworkError, loadPage, pageCache } from '../../lib/net'
import { Button, cx } from './ui'
import { Spinner } from './Spinner'
import { PageSkeleton, PageSpinner, Skel } from './PageSkeletons'

export { PageSkeleton, PageSpinner, Skel, Spinner }

/** Slim animated bar across the top of the content while a page loads */
export function TopProgress() {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] lg:left-[248px]" aria-hidden>
      <LineWobble size={4000} stroke={2} bgOpacity={0.12} speed={1.4} color="var(--primary)" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Loaders (ldrs)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Error states
// ---------------------------------------------------------------------------

export function ErrorState({ error, onRetry, compact }: { error?: unknown; onRetry?: () => void; compact?: boolean }) {
  const network = error instanceof NetworkError || (error as { code?: string } | null)?.code === 'network'
  const Icon = network ? WifiOff : AlertTriangle
  return (
    <div role="alert" className={cx('flex flex-col items-center justify-center text-center', compact ? 'px-6 py-10' : 'min-h-[50vh] px-6')}>
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-md border border-error/25 bg-error-soft">
        <Icon size={19} strokeWidth={1.75} className="text-error" />
      </div>
      <div className="text-[15px] font-semibold text-ink">{network ? 'Connection problem' : 'Something went wrong'}</div>
      <p className="mt-1 max-w-sm text-[13px] text-muted">
        {network ? (error as Error).message : 'This page failed to load. Try again, and contact support if it keeps happening.'}
      </p>
      {onRetry && <Button className="mt-5" icon={RotateCw} onClick={onRetry}>Try again</Button>}
    </div>
  )
}

/** Catches render errors so one broken page never blanks the whole app */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('[Oryne] Page crashed', error, info.componentStack) }
  componentDidUpdate(prev: { resetKey?: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null })
  }
  render() {
    return this.state.error ? <ErrorState error={this.state.error} onRetry={() => this.setState({ error: null })} /> : this.props.children
  }
}

// ---------------------------------------------------------------------------
// Route loader: fetch -> skeleton -> page | error
// ---------------------------------------------------------------------------

type LoadState = { status: 'loading' } | { status: 'ready' } | { status: 'error'; error: unknown }

export function usePageLoad(key: string) {
  const [state, setState] = useState<LoadState>(() => (pageCache.has(key) ? { status: 'ready' } : { status: 'loading' }))
  const [attempt, setAttempt] = useState(0)
  const [prevKey, setPrevKey] = useState(key)
  if (prevKey !== key) {
    setPrevKey(key)
    setState(pageCache.has(key) ? { status: 'ready' } : { status: 'loading' })
  }

  useEffect(() => {
    if (pageCache.has(key)) return
    let live = true
    loadPage()
      .then(() => { if (live) { pageCache.add(key); setState({ status: 'ready' }) } })
      .catch((error) => { if (live) setState({ status: 'error', error }) })
    return () => { live = false }
  }, [key, attempt])

  const retry = useCallback(() => { setState({ status: 'loading' }); setAttempt((a) => a + 1) }, [])
  return { state, retry }
}

export function RouteLoader({ children, scope }: { children: ReactNode; scope: string }) {
  const { pathname } = useLocation()
  const key = `${scope}:${pathname}`
  const { state, retry } = usePageLoad(key)
  if (state.status === 'loading') return <><TopProgress /><PageSkeleton path={pathname} /></>
  if (state.status === 'error') return <ErrorState error={state.error} onRetry={retry} />
  return <ErrorBoundary resetKey={key}>{children}</ErrorBoundary>
}

/** For buttons that call the API: tracks pending state and surfaces failures */
export function useAsyncAction() {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = useCallback(async <T,>(fn: () => T): Promise<{ ok: true; value: T } | { ok: false }> => {
    setPending(true)
    setError(null)
    try {
      return { ok: true, value: await fn() }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed. Please try again.')
      return { ok: false }
    } finally {
      setPending(false)
    }
  }, [])
  return { run, pending, error, clearError: () => setError(null) }
}
