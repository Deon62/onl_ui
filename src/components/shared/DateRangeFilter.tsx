import { useState } from 'react'
import { CalendarRange } from 'lucide-react'
import { customRange, rangeFromPreset, toInputDate, type DateRange, type RangePreset } from '../../lib/dates'
import { Button, cx, Input, Modal } from './ui'

const PRESETS: { value: Exclude<RangePreset, 'custom'>; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
]

export function DateRangeFilter({ value, onChange }: { value: DateRange; onChange: (r: DateRange) => void }) {
  const [open, setOpen] = useState(false)
  const [from, setFrom] = useState(toInputDate(value.from))
  const [to, setTo] = useState(toInputDate(value.to))
  const invalid = !from || !to || from > to

  return (
    <>
      <div className="inline-flex flex-wrap rounded-[6px] border border-line bg-surface p-0.5" role="group" aria-label="Date range">
        {PRESETS.map((p) => (
          <button
            key={p.value}
            onClick={() => onChange(rangeFromPreset(p.value))}
            className={cx('rounded-[4px] px-2.5 py-1 text-[12.5px] font-medium transition-colors', value.preset === p.value ? 'bg-sidebar text-sidebar-ink' : 'text-muted hover:text-ink')}
          >
            {p.label}
          </button>
        ))}
        <button
          onClick={() => { setFrom(toInputDate(value.from)); setTo(toInputDate(value.to)); setOpen(true) }}
          className={cx('inline-flex items-center gap-1.5 rounded-[4px] px-2.5 py-1 text-[12.5px] font-medium transition-colors', value.preset === 'custom' ? 'bg-sidebar text-sidebar-ink' : 'text-muted hover:text-ink')}
        >
          <CalendarRange size={13} strokeWidth={1.75} />
          {value.preset === 'custom'
            ? `${value.from.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} - ${value.to.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}`
            : 'Custom'}
        </button>
      </div>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Custom date range"
        size="sm"
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" disabled={invalid} onClick={() => { onChange(customRange(from, to)); setOpen(false) }}>Apply range</Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <label className="text-[12.5px] font-medium">From<Input type="date" className="mt-1.5" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="text-[12.5px] font-medium">To<Input type="date" className="mt-1.5" value={to} min={from} max={toInputDate(new Date())} onChange={(e) => setTo(e.target.value)} /></label>
        </div>
        {invalid && from && to && <p className="mt-2 text-[12px] text-error">Start date must be before end date.</p>}
      </Modal>
    </>
  )
}
