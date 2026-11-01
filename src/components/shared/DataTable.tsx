import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Inbox } from 'lucide-react'
import { cx, EmptyState } from './ui'

export interface Column<T> {
  key: string
  header: ReactNode
  cell: (row: T) => ReactNode
  align?: 'left' | 'right' | 'center'
  className?: string
  /** Provide to make the column sortable */
  sort?: (row: T) => number | string
  /** Hide below this breakpoint */
  hideBelow?: 'sm' | 'md' | 'lg' | 'xl'
}

const hideCls = { sm: 'hidden sm:table-cell', md: 'hidden md:table-cell', lg: 'hidden lg:table-cell', xl: 'hidden xl:table-cell' }

export function DataTable<T>({ columns, rows, rowKey, onRowClick, pageSize = 12, emptyTitle = 'No records found', emptyDescription, footer, dense }: {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  onRowClick?: (row: T) => void
  pageSize?: number
  emptyTitle?: string
  emptyDescription?: string
  footer?: ReactNode
  dense?: boolean
}) {
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null)

  const sorted = useMemo(() => {
    if (!sort) return rows
    const col = columns.find((c) => c.key === sort.key)
    if (!col?.sort) return rows
    const get = col.sort
    return [...rows].sort((a, b) => {
      const va = get(a), vb = get(b)
      return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir
    })
  }, [rows, sort, columns])

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize))
  useEffect(() => { setPage(1) }, [rows.length, pageSize])
  const current = Math.min(page, pages)
  const visible = sorted.slice((current - 1) * pageSize, current * pageSize)

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-line">
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={cx(
                    'whitespace-nowrap bg-card px-4 py-2.5 text-[11.5px] font-medium uppercase tracking-[0.05em] text-muted first:pl-5 last:pr-5',
                    c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left',
                    c.hideBelow && hideCls[c.hideBelow],
                  )}
                >
                  {c.sort ? (
                    <button
                      className={cx('inline-flex items-center gap-1 uppercase hover:text-ink', c.align === 'right' && 'flex-row-reverse')}
                      onClick={() => setSort((s) => (s?.key === c.key ? (s.dir === -1 ? { key: c.key, dir: 1 } : null) : { key: c.key, dir: -1 }))}
                    >
                      {c.header}
                      {sort?.key === c.key && (sort.dir === -1 ? <ArrowDown size={12} /> : <ArrowUp size={12} />)}
                    </button>
                  ) : c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr
                key={rowKey(r)}
                onClick={onRowClick ? () => onRowClick(r) : undefined}
                className={cx('border-b border-line-soft last:border-b-0', onRowClick && 'cursor-pointer transition-colors hover:bg-subtle/60')}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cx(
                      'whitespace-nowrap px-4 text-ink first:pl-5 last:pr-5',
                      dense ? 'py-2' : 'py-3',
                      c.align === 'right' ? 'num text-right' : c.align === 'center' ? 'text-center' : 'text-left',
                      c.hideBelow && hideCls[c.hideBelow],
                      c.className,
                    )}
                  >
                    {c.cell(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <EmptyState icon={Inbox} title={emptyTitle} description={emptyDescription} />}
      </div>
      {footer}
      {rows.length > pageSize && <Pagination page={current} pages={pages} total={rows.length} pageSize={pageSize} onChange={setPage} />}
    </div>
  )
}

export function Pagination({ page, pages, total, pageSize, onChange }: { page: number; pages: number; total: number; pageSize: number; onChange: (p: number) => void }) {
  const from = (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)
  const nums: (number | '...')[] = []
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || Math.abs(i - page) <= 1) nums.push(i)
    else if (nums[nums.length - 1] !== '...') nums.push('...')
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft px-5 py-3 text-[12.5px] text-muted">
      <span className="num">
        Showing {from.toLocaleString()}-{to.toLocaleString()} of {total.toLocaleString()}
      </span>
      <div className="flex items-center gap-1">
        <PageBtn disabled={page === 1} onClick={() => onChange(page - 1)} label="Previous page"><ChevronLeft size={14} /></PageBtn>
        {nums.map((n, i) =>
          n === '...' ? (
            <span key={`e${i}`} className="px-1.5">...</span>
          ) : (
            <PageBtn key={n} active={n === page} onClick={() => onChange(n)} label={`Page ${n}`}>{n}</PageBtn>
          ),
        )}
        <PageBtn disabled={page === pages} onClick={() => onChange(page + 1)} label="Next page"><ChevronRight size={14} /></PageBtn>
      </div>
    </div>
  )
}

function PageBtn({ children, active, disabled, onClick, label }: { children: ReactNode; active?: boolean; disabled?: boolean; onClick: () => void; label: string }) {
  return (
    <button
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        'num inline-flex h-7 min-w-7 items-center justify-center rounded-[4px] border px-1.5 transition-colors disabled:opacity-40',
        active ? 'border-sidebar bg-sidebar text-sidebar-ink' : 'border-line bg-surface text-ink hover:bg-subtle',
      )}
    >
      {children}
    </button>
  )
}
