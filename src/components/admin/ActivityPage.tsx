import { useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { useStore } from '../../store/AppStore'
import { exportCsv } from '../../lib/csv'
import { ActivityList } from '../shared/FinancePanels'
import { Pagination } from '../shared/DataTable'
import { Button, Card, PageHeader, SearchInput, Select } from '../shared/ui'

const PAGE = 25

export function ActivityPage() {
  const { data } = useStore()
  const [q, setQ] = useState('')
  const [role, setRole] = useState('')
  const [merchant, setMerchant] = useState('')
  const [page, setPage] = useState(1)
  const rows = useMemo(() => {
    const n = q.toLowerCase()
    return data.activity.filter((a) => (!role || a.role === role) && (!merchant || a.merchantId === merchant) && (!n || `${a.action} ${a.target} ${a.actor}`.toLowerCase().includes(n)))
  }, [data.activity, q, role, merchant])
  const pages = Math.max(1, Math.ceil(rows.length / PAGE))
  const cur = Math.min(page, pages)
  return (
    <>
      <PageHeader
        title="Activity logs"
        description="Audit trail of administrative, merchant and system actions."
        actions={<Button icon={Download} onClick={() => exportCsv('oryne-activity.csv', rows, [{ header: 'Time', value: (a) => a.at }, { header: 'Actor', value: (a) => a.actor }, { header: 'Role', value: (a) => a.role }, { header: 'Action', value: (a) => a.action }, { header: 'Target', value: (a) => a.target }, { header: 'Merchant ID', value: (a) => a.merchantId }])}>Export</Button>}
      />
      <Card flush>
        <div className="flex flex-col gap-2.5 border-b border-line-soft px-5 py-3 md:flex-row">
          <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1) }} placeholder="Search actions, targets, actors" className="md:w-[320px]" />
          <Select value={role} onChange={(e) => { setRole(e.target.value); setPage(1) }} className="md:w-[150px]" aria-label="Role filter">
            <option value="">All actors</option><option value="admin">Admin</option><option value="merchant">Merchant</option><option value="system">System</option>
          </Select>
          <Select value={merchant} onChange={(e) => { setMerchant(e.target.value); setPage(1) }} className="md:w-[190px]" aria-label="Merchant filter">
            <option value="">All merchants</option>
            {data.merchants.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </Select>
        </div>
        <ActivityList items={rows.slice((cur - 1) * PAGE, cur * PAGE)} />
        {rows.length > PAGE && <Pagination page={cur} pages={pages} total={rows.length} pageSize={PAGE} onChange={setPage} />}
      </Card>
    </>
  )
}
