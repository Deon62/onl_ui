/**
 * Page loading. Each route loads once per session through `loadPage`, which refreshes data from the API
 * (see AppStore). Later visits render instantly from the cache.
 */

export class NetworkError extends Error {
  constructor(message = 'We could not reach the server. Check your connection and try again.') {
    super(message)
    this.name = 'NetworkError'
  }
}

let loader: (() => Promise<void>) | null = null
export function setLiveLoader(fn: (() => Promise<void>) | null) {
  loader = fn
}
export const loadPage = (): Promise<void> => (loader ? loader() : Promise.resolve())

const loaded = new Set<string>()
export const pageCache = {
  has: (k: string) => loaded.has(k),
  add: (k: string) => loaded.add(k),
  clear: () => loaded.clear(),
}
