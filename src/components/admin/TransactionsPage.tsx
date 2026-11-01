import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { useStore } from '../../store/AppStore'
import { fmtInt } from '../../lib/format'
import { TransactionsExplorer } from '../shared/TransactionsExplorer'
import { Button, cx, PageHeader, StatusBadge } from '../shared/ui'
import type { TxStatus } from '../../types'

export function AdminTransactionsPage() {
  const { data } = useStore()
  const [status, setStatus] = useState<TxStatus | ''>('')
  const counts = useMemo(() => {
    const c: Partial<Record<TxStatus, number>> = {}
    for (const t of data.transactions) c[t.status] = (c[t.status] ?? 0) + 1
    return (Object.entries(c) as [TxStatus, number][]).sort((a, b) => b[1] - a[1])
  }, [data.transactions])

  return (
    <>
      <PageHeader title="Transactions" actions={<StatusMenu value={status} onChange={setStatus} counts={counts} total={data.transactions.length} />} />
      <TransactionsExplorer mode="admin" pageSize={20} status={status} onStatusChange={setStatus} />
    </>
  )
}

function StatusMenu({ value, onChange, counts, total }: {
  value: TxStatus | ''; onChange: (s: TxStatus | '') => void; counts: [TxStatus, number][]; total: number
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', h)
    document.addEventListener('keydown', k)
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k) }
  }, [open])

  const current = value ? counts.find(([s]) => s === value)?.[1] ?? 0 : total
  const pick = (s: TxStatus | '') => { onChange(s); setOpen(false) }

  return (
    <div className="relative" ref={ref}>
      <Button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="listbox">
        {value ? <StatusBadge status={value} /> : <span>All statuses</span>}
        <span className="num text-muted">{fmtInt(current)}</span>
        <ChevronDown size={13} className="text-muted" />
      </Button>
      {open && (
        <ul role="listbox" aria-label="Filter by status" className="anim-pop absolute right-0 top-11 z-30 w-[220px] rounded-md border border-line bg-card py-1 shadow-[0_8px_30px_rgba(0,0,0,0.08)]">
          {([['', total], ...counts] as [TxStatus | '', number][]).map(([s, n]) => (
            <li key={s || 'all'}>
              <button
                role="option"
                aria-selected={value === s}
                onClick={() => pick(s)}
                className={cx('flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[13px] transition-colors hover:bg-subtle', value === s && 'bg-subtle/70')}
              >
                <span className="flex items-center gap-2">
                  <Check size={13} className={value === s ? 'text-ink' : 'invisible'} />
                  {s ? <StatusBadge status={s} /> : <span className="text-ink">All statuses</span>}
                </span>
                <span className="num text-muted">{fmtInt(n)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
