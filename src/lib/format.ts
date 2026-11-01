// Consistent formatting for money, numbers, dates and identifiers.

const moneyFmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const intFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

/** KES 125,000.00 */
export function fmtKES(n: number): string {
  const sign = n < 0 ? '-' : ''
  return `${sign}KES ${moneyFmt.format(Math.abs(round2(n)))}`
}

/** 125,000.00 (no currency prefix, for dense tables) */
export function fmtAmount(n: number): string {
  const sign = n < 0 ? '-' : ''
  return sign + moneyFmt.format(Math.abs(round2(n)))
}

/** Compact for chart axes: 1.2M, 450K */
export function fmtCompact(n: number): string {
  const a = Math.abs(n)
  if (a >= 1_000_000) return `${(n / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1)}M`
  if (a >= 1_000) return `${(n / 1_000).toFixed(a >= 100_000 ? 0 : 1)}K`
  return intFmt.format(n)
}

export const fmtKESCompact = (n: number) => `KES ${fmtCompact(n)}`
export const fmtInt = (n: number) => intFmt.format(n)
export const fmtPct = (n: number, digits = 1) => `${(Number.isFinite(n) ? n : 0).toFixed(digits)}%`

const dateFmt = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
const dateTimeFmt = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
})
const timeFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })

export const fmtDate = (iso: string | Date) => dateFmt.format(new Date(iso))
export const fmtDateTime = (iso: string | Date) => dateTimeFmt.format(new Date(iso)).replace(',', '')
export const fmtTime = (iso: string | Date) => timeFmt.format(new Date(iso))

export function fmtRelative(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`
  return fmtDate(iso)
}

/** 254712345489 -> 0712 *** 489 */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  const local = digits.startsWith('254') ? '0' + digits.slice(3) : digits
  if (local.length < 7) return local
  return `${local.slice(0, 4)} *** ${local.slice(-3)}`
}

/** 254712345489 -> +254 712 345 489 */
export function fmtPhone(phone: string): string {
  const d = phone.replace(/\D/g, '')
  if (d.startsWith('254') && d.length === 12) return `+254 ${d.slice(3, 6)} ${d.slice(6, 9)} ${d.slice(9)}`
  return phone
}

/** Accepts 07XXXXXXXX, 01XXXXXXXX, 2547XXXXXXXX, +254... Returns 254XXXXXXXXX or null. */
export function normalizePhone(input: string): string | null {
  const d = input.replace(/\D/g, '')
  if (/^0[17]\d{8}$/.test(d)) return '254' + d.slice(1)
  if (/^254[17]\d{8}$/.test(d)) return d
  if (/^[17]\d{8}$/.test(d)) return '254' + d
  return null
}
