// Deterministic pseudo-random generator so mock data is reproducible.
export function createRng(seed: number) {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    int: (min: number, max: number) => Math.floor(next() * (max - min + 1)) + min,
    float: (min: number, max: number) => next() * (max - min) + min,
    pick: <T,>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)],
    chance: (p: number) => next() < p,
    /** Log-uniform sample: realistic for payment amounts (many small, few large) */
    logUniform: (min: number, max: number) => Math.exp(Math.log(min) + next() * (Math.log(max) - Math.log(min))),
    weighted: <T,>(items: readonly [T, number][]): T => {
      const total = items.reduce((s, [, w]) => s + w, 0)
      let r = next() * total
      for (const [item, w] of items) {
        r -= w
        if (r <= 0) return item
      }
      return items[items.length - 1][0]
    },
    poisson: (lambda: number) => {
      const L = Math.exp(-lambda)
      let k = 0
      let p = 1
      do {
        k++
        p *= next()
      } while (p > L)
      return k - 1
    },
  }
}
export type Rng = ReturnType<typeof createRng>

const ALNUM = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export function randomCode(len: number, rnd: () => number = Math.random): string {
  let s = ''
  for (let i = 0; i < len; i++) s += ALNUM[Math.floor(rnd() * ALNUM.length)]
  return s
}

/** Mock M-Pesa receipt, e.g. TKJ4X8Y2QZ */
export const mpesaReceipt = (rnd: () => number = Math.random) => 'T' + randomCode(9, rnd)

export const uid = (prefix: string) => `${prefix}${Date.now().toString(36).toUpperCase()}${randomCode(4)}`
