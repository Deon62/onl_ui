import type { ReactNode } from 'react'
import { BarChart3 } from 'lucide-react'
import { useStore } from '../../store/AppStore'
import { fmtKES, fmtInt } from '../../lib/format'

// Categorical palette validated for CVD separation against the card surfaces (light + dark).
const SERIES_LIGHT = ['#007AFF', '#D9822B', '#2A9D74', '#8A5CC2', '#D0507A']
const SERIES_DARK = ['#3D8EF0', '#C97A2E', '#279A70', '#9677D6', '#CC5A82']

export function useChartColors() {
  const { theme, data } = useStore()
  const dark = theme === 'dark'
  const series = dark ? SERIES_DARK : SERIES_LIGHT
  const other = dark ? '#5d6560' : '#a7abb3'
  /** Colour follows the merchant entity (fixed slot by registration order), never its rank */
  const merchantColor = (merchantId: string | null) => {
    const i = data.merchants.findIndex((m) => m.id === merchantId)
    return i >= 0 && i < series.length ? series[i] : other
  }
  return {
    series,
    other,
    merchantColor,
    grid: dark ? '#202924' : '#eef0f2',
    axis: dark ? '#959ba2' : '#777d87',
    baseline: dark ? '#38403b' : '#d1d5db',
    success: dark ? '#3fae72' : '#16834a',
    error: dark ? '#ec6a6a' : '#dc4545',
    warning: dark ? '#e0952f' : '#b45f06',
    neutral: dark ? '#5d6560' : '#b8bcc4',
    primary: dark ? '#3d8ef0' : '#007aff',
    ink: dark ? '#e8e6e0' : '#17191c',
    surface: dark ? '#141a17' : '#ffffff',
  }
}

export const axisProps = (color: string) => ({
  tick: { fontSize: 11.5, fill: color },
  tickLine: false,
  axisLine: false,
})

interface TooltipRow {
  name?: string | number
  value?: number | string | (number | string)[]
  color?: string
  dataKey?: string | number
  payload?: Record<string, unknown>
}

/** Card-styled tooltip; values in ink, colour carried by the swatch only */
export function ChartTooltip({ active, payload, label, money = true, labelFormatter, extra }: {
  active?: boolean; payload?: TooltipRow[]; label?: ReactNode; money?: boolean; labelFormatter?: (l: ReactNode) => ReactNode; extra?: (p: Record<string, unknown>) => ReactNode
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="min-w-[180px] rounded-md border border-line bg-card px-3 py-2.5 text-[12px] shadow-[0_4px_16px_rgba(0,0,0,0.06)]">
      {label !== undefined && <div className="mb-1.5 font-medium text-ink">{labelFormatter ? labelFormatter(label) : label}</div>}
      <div className="space-y-1">
        {payload.map((p, i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted">
              <span className="h-2 w-2 rounded-[2px]" style={{ background: p.color }} />
              {p.name}
            </span>
            <span className="num font-medium text-ink">{money ? fmtKES(Number(p.value)) : fmtInt(Number(p.value))}</span>
          </div>
        ))}
      </div>
      {extra && payload[0]?.payload && <div className="mt-1.5 border-t border-line-soft pt-1.5">{extra(payload[0].payload)}</div>}
    </div>
  )
}

export function Legend({ items }: { items: { label: string; color: string; value?: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px]">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5 text-muted">
          <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: i.color }} />
          {i.label}
          {i.value && <span className="num text-ink">{i.value}</span>}
        </span>
      ))}
    </div>
  )
}

export function ChartCard({ title, subtitle, legend, actions, children, height = 240, className, empty }: {
  title: string; subtitle?: ReactNode; legend?: ReactNode; actions?: ReactNode; children: ReactNode; height?: number; className?: string
  /** Show the empty placeholder instead of the chart; a string replaces the default message */
  empty?: boolean | string
}) {
  return (
    <section className={`flex flex-col rounded-md border border-line bg-card ${className ?? ''}`}>
      <header className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4">
        <div>
          <h2 className="text-[14px] font-semibold text-ink">{title}</h2>
          {subtitle && <p className="mt-0.5 text-[12.5px] text-muted">{subtitle}</p>}
        </div>
        {actions}
      </header>
      {legend && !empty && <div className="px-5 pt-3">{legend}</div>}
      <div className="px-2 pb-3 pt-3" style={{ height }}>{empty ? <ChartEmpty message={typeof empty === 'string' ? empty : undefined} /> : children}</div>
    </section>
  )
}

/** Placeholder shown instead of empty axes when a chart has no data yet */
export function ChartEmpty({ message = 'Data will appear here once there is activity.' }: { message?: string }) {
  return (
    <div className="relative flex h-full flex-col items-center justify-center px-6 text-center">
      <div className="pointer-events-none absolute inset-x-3 inset-y-4 flex flex-col justify-between" aria-hidden>
        {[0, 1, 2, 3].map((i) => <div key={i} className="border-t border-dashed border-line-soft" />)}
      </div>
      <div className="relative flex flex-col items-center bg-card px-4 py-2">
        <BarChart3 size={18} strokeWidth={1.75} className="text-faint" />
        <div className="mt-2 text-[13px] font-medium text-ink">No data yet</div>
        <p className="mt-0.5 max-w-[260px] text-[12px] text-muted">{message}</p>
      </div>
    </div>
  )
}
