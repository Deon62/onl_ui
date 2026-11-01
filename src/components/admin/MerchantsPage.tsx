import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Download, Plus } from 'lucide-react'
import type { Merchant } from '../../types'
import { useStore } from '../../store/AppStore'
import { useAllLedgers } from '../../store/selectors'
import { exportCsv } from '../../lib/csv'
import { fmtAmount, fmtDate, fmtKES } from '../../lib/format'
import { DataTable, type Column } from '../shared/DataTable'
import { Button, Card, MerchantAvatar, Mono, PageHeader, SearchInput, Select, StatCard, StatusBadge } from '../shared/ui'
import { MerchantFormModal } from './MerchantForm'

export function MerchantsPage() {
  const { data } = useStore()
  const ledgers = useAllLedgers()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [creating, setCreating] = useState(false)

  const rows = useMemo(() => {
    const n = q.trim().toLowerCase()
    return data.merchants.filter((m) => (!status || m.status === status) && (!n || `${m.name} ${m.id} ${m.domain} ${m.email}`.toLowerCase().includes(n)))
  }, [data.merchants, q, status])

  const totals = useMemo(() => {
    const ls = Object.values(ledgers)
    return {
      processed: ls.reduce((s, l) => s + l.grossCollections, 0),
      available: ls.reduce((s, l) => s + l.available, 0),
      pending: ls.reduce((s, l) => s + l.pendingSettlement, 0),
      paid: ls.reduce((s, l) => s + l.paidOutNet, 0),
    }
  }, [ledgers])

  const cols: Column<Merchant>[] = [
    {
      key: 'name', header: 'Business', sort: (m) => m.name,
      cell: (m) => (
        <div className="flex items-center gap-3">
          <MerchantAvatar name={m.name} />
          <div className="leading-tight">
            <div className="font-medium">{m.name}</div>
            <div className="text-[12px] text-muted">{m.domain}</div>
          </div>
        </div>
      ),
    },
    { key: 'id', header: 'Merchant ID', cell: (m) => <Mono>{m.id}</Mono>, hideBelow: 'md' },
    { key: 'status', header: 'Status', cell: (m) => <StatusBadge status={m.status} /> },
    { key: 'fee', header: 'Fee rate', align: 'right', cell: (m) => `${m.pricing.percentRate.toFixed(2)}%`, sort: (m) => m.pricing.percentRate, hideBelow: 'sm' },
    { key: 'processed', header: 'Total processed', align: 'right', cell: (m) => fmtAmount(ledgers[m.id]?.grossCollections ?? 0), sort: (m) => ledgers[m.id]?.grossCollections ?? 0, hideBelow: 'lg' },
    { key: 'available', header: 'Available', align: 'right', cell: (m) => fmtAmount(ledgers[m.id]?.available ?? 0), sort: (m) => ledgers[m.id]?.available ?? 0 },
    { key: 'pending', header: 'Pending', align: 'right', cell: (m) => fmtAmount(ledgers[m.id]?.pendingSettlement ?? 0), hideBelow: 'xl' },
    { key: 'paid', header: 'Total paid out', align: 'right', cell: (m) => fmtAmount(ledgers[m.id]?.paidOutNet ?? 0), sort: (m) => ledgers[m.id]?.paidOutNet ?? 0, hideBelow: 'xl' },
    { key: 'reg', header: 'Registered', cell: (m) => <span className="text-muted">{fmtDate(m.registeredAt)}</span>, sort: (m) => m.registeredAt, hideBelow: 'lg' },
  ]

  return (
    <>
      <PageHeader
        title="Merchants"
        description="Businesses collecting through the Oryne business Till. Each has an isolated ledger."
        actions={
          <>
            <Button
              icon={Download}
              onClick={() => exportCsv('oryne-merchants.csv', rows, [
                { header: 'Merchant ID', value: (m) => m.id }, { header: 'Business name', value: (m) => m.name }, { header: 'Domain', value: (m) => m.domain },
                { header: 'Email', value: (m) => m.email }, { header: 'Phone', value: (m) => m.phone }, { header: 'Status', value: (m) => m.status },
                { header: 'Registered', value: (m) => m.registeredAt }, { header: 'Fee rate %', value: (m) => m.pricing.percentRate },
                { header: 'Total processed', value: (m) => ledgers[m.id]?.grossCollections.toFixed(2) }, { header: 'Available balance', value: (m) => ledgers[m.id]?.available.toFixed(2) },
                { header: 'Pending balance', value: (m) => ledgers[m.id]?.pendingSettlement.toFixed(2) }, { header: 'Total paid out', value: (m) => ledgers[m.id]?.paidOutNet.toFixed(2) },
              ])}
            >
              Export
            </Button>
            <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>New merchant</Button>
          </>
        }
      />
      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active merchants" value={`${data.merchants.filter((m) => m.status === 'Active').length} of ${data.merchants.length}`} hint="registered businesses" />
        <StatCard label="Lifetime processed" value={fmtKES(totals.processed)} hint="gross collections" />
        <StatCard label="Available balances" value={fmtKES(totals.available)} hint={`${fmtKES(totals.pending)} pending settlement`} />
        <StatCard label="Total paid out" value={fmtKES(totals.paid)} hint="net sent to merchants" />
      </div>
      <Card flush>
        <div className="flex flex-col gap-2.5 border-b border-line-soft px-5 py-4 sm:flex-row">
          <SearchInput value={q} onChange={setQ} placeholder="Search name, ID, domain or email" className="sm:w-[320px]" />
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="sm:w-[170px]" aria-label="Status filter">
            <option value="">All statuses</option><option>Active</option><option>Pending Review</option><option>Suspended</option>
          </Select>
        </div>
        <DataTable columns={cols} rows={rows} rowKey={(m) => m.id} onRowClick={(m) => navigate(`/admin/merchants/${m.id}`)} emptyTitle={data.merchants.length ? 'No matching merchants' : 'No merchants yet'} emptyDescription={data.merchants.length ? 'Try a different search or status.' : 'Create a merchant account to start collecting payments.'} />
      </Card>
      {creating && <MerchantFormModal open onClose={() => setCreating(false)} />}
    </>
  )
}

