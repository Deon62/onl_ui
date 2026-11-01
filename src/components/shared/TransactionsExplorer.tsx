import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, ChevronDown, Download, FileDown, SlidersHorizontal } from 'lucide-react'
import type { Transaction, TxStatus } from '../../types'
import { useStore } from '../../store/AppStore'
import { allTime, customRange, inRange, rangeFromPreset, toInputDate, type DateRange } from '../../lib/dates'
import { exportCsv } from '../../lib/csv'
import { fmtAmount, fmtDateTime, fmtKES, maskPhone } from '../../lib/format'
import { netAmount } from '../../lib/finance'
import { DataTable, type Column } from './DataTable'
import { TransactionDrawer, downloadReceipt } from './TransactionDrawer'
import { Button, cx, Field, IconButton, Input, Mono, SearchInput, Select, StatusBadge } from './ui'

export const ALL_STATUSES: TxStatus[] = ['Initiated', 'Pending', 'Successful', 'Failed', 'Cancelled', 'Reversed', 'Refunded', 'Unmatched']

export function TransactionsExplorer({ mode, merchantId, pageSize = 15, initialStatus = '', withDateFilter = true, title, limit, viewAllTo, status: statusProp, onStatusChange }: {
  mode: 'admin' | 'merchant'
  /** Restricts the data set to a single merchant. Required in merchant mode. */
  merchantId?: string | null
  pageSize?: number
  initialStatus?: TxStatus | ''
  withDateFilter?: boolean
  title?: string
  /** Compact list: show only the newest N rows, no toolbar */
  limit?: number
  /** Destination of the "View all" link in compact mode */
  viewAllTo?: string
  /** Optional controlled status filter */
  status?: TxStatus | ''
  onStatusChange?: (s: TxStatus | '') => void
}) {
  const { data } = useStore()
  const [q, setQ] = useState('')
  const [statusState, setStatusState] = useState<TxStatus | ''>(initialStatus)
  const status = statusProp ?? statusState
  const setStatus = onStatusChange ?? setStatusState
  const [merchant, setMerchant] = useState('')
  const [range, setRange] = useState<DateRange>(allTime())
  const [selected, setSelected] = useState<Transaction | null>(null)

  const merchantName = useMemo(() => Object.fromEntries(data.merchants.map((m) => [m.id, m.name])), [data.merchants])

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return data.transactions.filter((t) => {
      // Tenant isolation: merchant views only ever see their own records.
      if (mode === 'merchant' && t.merchantId !== merchantId) return false
      if (mode === 'admin' && merchantId && t.merchantId !== merchantId) return false
      if (status && t.status !== status) return false
      if (merchant && (merchant === '__none' ? t.merchantId !== null : t.merchantId !== merchant)) return false
      if (range.preset !== 'custom' || range.from.getFullYear() > 2020) {
        if (!inRange(t.initiatedAt, range)) return false
      }
      if (needle) {
        const hay = `${t.id} ${t.reference} ${t.mpesaReceipt ?? ''} ${t.customerPhone} ${t.customerName} ${t.domain ?? ''} ${t.merchantId ? merchantName[t.merchantId] : ''} ${t.amount}`.toLowerCase()
        if (!hay.includes(needle)) return false
      }
      return true
    })
  }, [data.transactions, mode, merchantId, status, merchant, range, q, merchantName])

  const totals = useMemo(() => {
    let amount = 0, fee = 0
    for (const t of rows) if (t.status === 'Successful') { amount += t.amount; fee += t.fee }
    return { amount, fee }
  }, [rows])

  const adminCols: Column<Transaction>[] = [
    { key: 'id', header: 'Transaction ID', cell: (t) => <Mono>{t.id}</Mono>, sort: (t) => t.id },
    { key: 'receipt', header: 'M-Pesa receipt', cell: (t) => <Mono className="text-muted">{t.mpesaReceipt ?? '-'}</Mono>, hideBelow: 'md' },
    ...(!merchantId ? [{
      key: 'merchant', header: 'Merchant', sort: (t: Transaction) => (t.merchantId ? merchantName[t.merchantId] : 'zzz'),
      cell: (t: Transaction) => t.merchantId
        ? <div className="leading-tight"><div>{merchantName[t.merchantId]}</div><div className="text-[11.5px] text-muted">{t.domain}</div></div>
        : <span className="text-warning">Unattributed</span>,
    }] : []),
    { key: 'phone', header: 'Customer', cell: (t) => <span className="mono text-muted">{maskPhone(t.customerPhone)}</span>, hideBelow: 'lg' },
    { key: 'amount', header: 'Amount', align: 'right', cell: (t) => fmtAmount(t.amount), sort: (t) => t.amount },
    { key: 'fee', header: 'Oryne fee', align: 'right', cell: (t) => (t.fee ? fmtAmount(t.fee) : <span className="text-faint">-</span>), sort: (t) => t.fee, hideBelow: 'sm' },
    { key: 'status', header: 'Status', cell: (t) => <StatusBadge status={t.status} /> },
    { key: 'date', header: 'Date & time', cell: (t) => <span className="text-muted">{fmtDateTime(t.initiatedAt)}</span>, sort: (t) => t.initiatedAt, hideBelow: 'md' },
  ]

  const merchantCols: Column<Transaction>[] = [
    { key: 'id', header: 'Transaction ID', cell: (t) => <Mono>{t.id}</Mono>, sort: (t) => t.id },
    { key: 'receipt', header: 'M-Pesa receipt', cell: (t) => <Mono className="text-muted">{t.mpesaReceipt ?? '-'}</Mono>, hideBelow: 'md' },
    { key: 'customer', header: 'Customer', cell: (t) => <div className="leading-tight"><div>{t.customerName}</div><div className="mono text-[11.5px] text-muted">{maskPhone(t.customerPhone)}</div></div>, hideBelow: 'sm' },
    { key: 'amount', header: 'Amount', align: 'right', cell: (t) => fmtAmount(t.amount), sort: (t) => t.amount },
    { key: 'fee', header: 'Fee', align: 'right', cell: (t) => (t.fee ? fmtAmount(t.fee) : <span className="text-faint">-</span>), hideBelow: 'lg' },
    { key: 'net', header: 'Net amount', align: 'right', cell: (t) => (t.fee ? fmtAmount(netAmount(t)) : <span className="text-faint">-</span>), sort: (t) => (t.fee ? netAmount(t) : 0), hideBelow: 'sm' },
    { key: 'status', header: 'Status', cell: (t) => <StatusBadge status={t.status} /> },
    { key: 'date', header: 'Date', cell: (t) => <span className="text-muted">{fmtDateTime(t.initiatedAt)}</span>, sort: (t) => t.initiatedAt, hideBelow: 'md' },
    {
      key: 'rcpt', header: '', align: 'right',
      cell: (t) => ['Successful', 'Refunded', 'Reversed'].includes(t.status)
        ? <IconButton icon={FileDown} label="Download receipt" onClick={(e) => { e.stopPropagation(); downloadReceipt(t, merchantName[t.merchantId!] ?? '') }} />
        : null,
    },
  ]

  const doExport = () => {
    const name = mode === 'merchant' ? `${merchantId}-transactions` : merchantId ? `${merchantId}-transactions` : 'oryne-transactions'
    exportCsv(`${name}-${new Date().toISOString().slice(0, 10)}.csv`, rows, [
      { header: 'Transaction ID', value: (t) => t.id },
      { header: 'Reference', value: (t) => t.reference },
      { header: 'M-Pesa receipt', value: (t) => t.mpesaReceipt },
      ...(mode === 'admin' ? [{ header: 'Merchant ID', value: (t: Transaction) => t.merchantId }, { header: 'Domain', value: (t: Transaction) => t.domain }] : []),
      { header: 'Customer phone (masked)', value: (t) => maskPhone(t.customerPhone) },
      { header: 'Amount (KES)', value: (t) => t.amount.toFixed(2) },
      { header: 'Oryne fee (KES)', value: (t) => t.fee.toFixed(2) },
      { header: 'SMS alert (from SMS credit, KES)', value: (t) => t.smsFee.toFixed(2) },
      { header: 'Net amount (KES)', value: (t) => (t.fee ? netAmount(t).toFixed(2) : '') },
      ...(mode === 'admin' ? [{ header: 'Provider charge (KES)', value: (t: Transaction) => t.providerCharge.toFixed(2) }] : []),
      { header: 'Status', value: (t) => t.status },
      { header: 'Channel', value: (t) => t.channel },
      { header: 'Initiated at', value: (t) => t.initiatedAt },
      { header: 'Confirmed at', value: (t) => t.confirmedAt },
    ])
  }

  const activeFilters = (status ? 1 : 0) + (merchant ? 1 : 0) + (range.from.getFullYear() > 2020 ? 1 : 0)

  if (limit) {
    return (
      <section className="rounded-md border border-line bg-card">
        <div className="flex items-center justify-between gap-3 border-b border-line-soft px-5 py-3.5">
          <h2 className="text-[14px] font-semibold text-ink">{title ?? 'Recent transactions'}</h2>
          {viewAllTo && (
            <Link to={viewAllTo} className="inline-flex items-center gap-1 text-[12.5px] font-medium text-muted transition-colors hover:text-ink">
              View all <ArrowRight size={13} />
            </Link>
          )}
        </div>
        <DataTable
          columns={mode === 'admin' ? adminCols : merchantCols}
          rows={rows.slice(0, limit)}
          rowKey={(t) => t.id}
          onRowClick={setSelected}
          pageSize={limit}
          emptyTitle="No transactions yet"
          emptyDescription={mode === 'merchant' ? 'Payments from your customers will show up here.' : 'Payments will show up here once merchants start collecting.'}
        />
        <TransactionDrawer tx={selected} onClose={() => setSelected(null)} mode={mode} />
      </section>
    )
  }

  return (
    <section className="rounded-md border border-line bg-card">
      <div className="flex flex-col gap-3 border-b border-line-soft px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          {title && <h2 className="text-[14px] font-semibold text-ink">{title}</h2>}
          <p className="num text-[12.5px] text-muted">{rows.length.toLocaleString()} records · {fmtKES(totals.amount)} successful</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={q} onChange={setQ} placeholder="Search transactions" className="w-full sm:w-[260px]" />
          <FilterMenu
            count={activeFilters}
            onClear={() => { setStatus(''); setMerchant(''); setRange(allTime()) }}
          >
            <Field label="Status">
              <Select value={status} onChange={(e) => setStatus(e.target.value as TxStatus | '')}>
                <option value="">All statuses</option>
                {ALL_STATUSES.filter((s) => mode === 'admin' || s !== 'Unmatched').map((s) => <option key={s}>{s}</option>)}
              </Select>
            </Field>
            {mode === 'admin' && !merchantId && (
              <Field label="Merchant">
                <Select value={merchant} onChange={(e) => setMerchant(e.target.value)}>
                  <option value="">All merchants</option>
                  {data.merchants.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  <option value="__none">Unattributed</option>
                </Select>
              </Field>
            )}
            {withDateFilter && <DatePicker value={range} onChange={setRange} />}
          </FilterMenu>
          <Button icon={Download} onClick={doExport} disabled={!rows.length}>Export</Button>
        </div>
      </div>
      <DataTable
        columns={mode === 'admin' ? adminCols : merchantCols}
        rows={rows}
        rowKey={(t) => t.id}
        onRowClick={setSelected}
        pageSize={pageSize}
        emptyTitle={q || activeFilters ? 'No matching transactions' : 'No transactions yet'}
        emptyDescription={q || activeFilters ? 'Try a different search or clear the filters.' : mode === 'merchant' ? 'Payments from your customers will show up here.' : 'Payments will show up here once merchants start collecting.'}
      />
      <TransactionDrawer tx={selected} onClose={() => setSelected(null)} mode={mode} />
    </section>
  )
}

function FilterMenu({ count, onClear, children }: { count: number; onClear: () => void; children: ReactNode }) {
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
  return (
    <div className="relative" ref={ref}>
      <Button icon={SlidersHorizontal} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="dialog">
        Filters
        {count > 0 && <span className="num ml-0.5 rounded-[3px] bg-sidebar px-1.5 text-[11px] leading-[17px] text-sidebar-ink">{count}</span>}
        <ChevronDown size={13} className="text-muted" />
      </Button>
      {open && (
        <div role="dialog" aria-label="Filters" className="anim-pop absolute right-0 top-11 z-30 w-[300px] max-w-[calc(100vw-40px)] rounded-md border border-line bg-card shadow-[0_8px_30px_rgba(0,0,0,0.08)]">
          <div className="space-y-4 p-4">{children}</div>
          <div className="flex justify-between border-t border-line-soft px-4 py-3">
            <Button variant="ghost" size="sm" disabled={!count} onClick={onClear}>Clear all</Button>
            <Button variant="primary" size="sm" onClick={() => setOpen(false)}>Done</Button>
          </div>
        </div>
      )}
    </div>
  )
}

const PRESETS = [
  { value: 'all', label: 'All time' }, { value: 'today', label: 'Today' }, { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' }, { value: '90d', label: '90 days' }, { value: 'custom', label: 'Custom' },
] as const

function DatePicker({ value, onChange }: { value: DateRange; onChange: (r: DateRange) => void }) {
  const isAll = value.from.getFullYear() <= 2020
  const current = isAll ? 'all' : value.preset
  const [from, setFrom] = useState(toInputDate(isAll ? new Date(Date.now() - 29 * 86_400_000) : value.from))
  const [to, setTo] = useState(toInputDate(value.to))
  const [custom, setCustom] = useState(current === 'custom')
  return (
    <Field label="Date">
      <div className="grid grid-cols-3 gap-1">
        {PRESETS.map((p) => {
          const active = p.value === 'custom' ? custom : !custom && current === p.value
          return (
            <button
              key={p.value}
              onClick={() => {
                if (p.value === 'custom') {
                  setCustom(true)
                  if (from && to && from <= to) onChange(customRange(from, to))
                  return
                }
                setCustom(false)
                onChange(p.value === 'all' ? allTime() : rangeFromPreset(p.value))
              }}
              className={cx('rounded-[4px] border px-2 py-1.5 text-[12px] font-medium transition-colors', active ? 'border-sidebar bg-sidebar text-sidebar-ink' : 'border-line bg-surface text-muted hover:text-ink')}
            >
              {p.label}
            </button>
          )
        })}
      </div>
      {custom && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Input type="date" value={from} max={to} onChange={(e) => { setFrom(e.target.value); if (e.target.value && e.target.value <= to) onChange(customRange(e.target.value, to)) }} aria-label="From date" />
          <Input type="date" value={to} min={from} onChange={(e) => { setTo(e.target.value); if (e.target.value && from <= e.target.value) onChange(customRange(from, e.target.value)) }} aria-label="To date" />
        </div>
      )}
    </Field>
  )
}
