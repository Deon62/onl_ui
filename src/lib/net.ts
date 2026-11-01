/**
 * Simulated network layer. Every page load and key action goes through `simulateRequest`, so loading and
 * error states behave as they will once the FastAPI backend replaces local state. Latency and failure rate
 * are adjustable from Settings to preview slow connections and outages.
 */
export interface NetConfig {
  /** Average response time in ms */
  latency: number
  /** Probability (0-1) that a request fails */
  failureRate: number
}

const KEY = 'oryne-net-sim'
const DEFAULT: NetConfig = { latency: 650, failureRate: 0 }

export function getNetConfig(): NetConfig {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...DEFAULT, ...(JSON.parse(raw) as Partial<NetConfig>) } : DEFAULT
  } catch {
    return DEFAULT
  }
}

export function setNetConfig(c: NetConfig) {
  localStorage.setItem(KEY, JSON.stringify(c))
  loaded.clear()
}

export class NetworkError extends Error {
  constructor(message = 'We could not reach the server. Check your connection and try again.') {
    super(message)
    this.name = 'NetworkError'
  }
}

/**
 * Live mode: no simulated latency or failures (real requests have their own), and page loads refresh data from
 * the API through `liveLoader` instead of waiting on a timer.
 */
let liveLoader: (() => Promise<void>) | null = null
export function setLiveLoader(fn: (() => Promise<void>) | null) {
  liveLoader = fn
}
export const isLive = () => liveLoader !== null
export const loadPage = (): Promise<void> => (liveLoader ? liveLoader() : simulateRequest())

export function simulateRequest<T = void>(result?: () => T, opts: { latency?: number } = {}): Promise<T> {
  if (liveLoader) return Promise.resolve().then(() => (result ? result() : (undefined as T)))
  const { latency, failureRate } = getNetConfig()
  const base = opts.latency ?? latency
  const ms = Math.max(120, base * (0.7 + Math.random() * 0.6))
  return new Promise((resolve, reject) => {
    window.setTimeout(() => {
      if (Math.random() < failureRate) reject(new NetworkError())
      else {
        try { resolve(result ? result() : (undefined as T)) } catch (e) { reject(e) }
      }
    }, ms)
  })
}

/** Pages already fetched this session load instantly afterwards (like a query cache). */
const loaded = new Set<string>()
export const pageCache = {
  has: (k: string) => loaded.has(k),
  add: (k: string) => loaded.add(k),
  clear: () => loaded.clear(),
}
