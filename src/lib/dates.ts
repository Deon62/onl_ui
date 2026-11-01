export type RangePreset = 'today' | '7d' | '30d' | '90d' | 'custom'

export interface DateRange {
  preset: RangePreset
  from: Date
  to: Date
}

export const DAY = 86_400_000

export function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}
export function endOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(23, 59, 59, 999)
  return x
}

export function rangeFromPreset(preset: Exclude<RangePreset, 'custom'>, now = new Date()): DateRange {
  const to = endOfDay(now)
  const days = { today: 1, '7d': 7, '30d': 30, '90d': 90 }[preset]
  const from = startOfDay(new Date(now.getTime() - (days - 1) * DAY))
  return { preset, from, to }
}

export function customRange(fromIso: string, toIso: string): DateRange {
  return { preset: 'custom', from: startOfDay(new Date(fromIso)), to: endOfDay(new Date(toIso)) }
}

export const allTime = (): DateRange => ({ preset: 'custom', from: new Date(2020, 0, 1), to: endOfDay(new Date()) })

export function inRange(iso: string | null | undefined, r: DateRange): boolean {
  if (!iso) return false
  const t = new Date(iso).getTime()
  return t >= r.from.getTime() && t <= r.to.getTime()
}

/** Length of a range in days (inclusive) */
export const rangeDays = (r: DateRange) => Math.max(1, Math.round((r.to.getTime() - r.from.getTime()) / DAY))

/** The equivalent preceding range, for period-over-period comparison */
export function previousRange(r: DateRange): DateRange {
  const span = r.to.getTime() - r.from.getTime()
  return { preset: 'custom', from: new Date(r.from.getTime() - span - 1), to: new Date(r.from.getTime() - 1) }
}

export interface Bucket {
  key: string
  label: string
  start: number
  end: number
}

/** Chart buckets: hourly for one day, daily up to 31 days, weekly beyond */
export function bucketsFor(r: DateRange): Bucket[] {
  const out: Bucket[] = []
  const days = rangeDays(r)
  if (days <= 1) {
    const s = startOfDay(r.from).getTime()
    for (let h = 0; h < 24; h++) {
      const start = s + h * 3_600_000
      out.push({ key: `h${h}`, label: `${String(h).padStart(2, '0')}:00`, start, end: start + 3_600_000 - 1 })
    }
    return out
  }
  const step = days <= 31 ? DAY : 7 * DAY
  const fmt = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short' })
  for (let start = startOfDay(r.from).getTime(); start <= r.to.getTime(); start += step) {
    const end = Math.min(start + step - 1, r.to.getTime())
    out.push({ key: String(start), label: fmt.format(new Date(start)), start, end })
  }
  return out
}

export function bucketIndex(buckets: Bucket[], iso: string): number {
  const t = new Date(iso).getTime()
  let lo = 0
  let hi = buckets.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (t < buckets[mid].start) hi = mid - 1
    else if (t > buckets[mid].end) lo = mid + 1
    else return mid
  }
  return -1
}

export const toInputDate = (d: Date) => {
  const x = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return x.toISOString().slice(0, 10)
}

export function rangeLabel(r: DateRange): string {
  switch (r.preset) {
    case 'today': return 'Today'
    case '7d': return 'Last 7 days'
    case '30d': return 'Last 30 days'
    case '90d': return 'Last 90 days'
    default: {
      const f = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
      return `${f.format(r.from)} - ${f.format(r.to)}`
    }
  }
}
