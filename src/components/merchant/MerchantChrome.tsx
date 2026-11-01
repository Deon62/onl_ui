import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Eye } from 'lucide-react'
import type { Merchant } from '../../types'
import { useStore } from '../../store/AppStore'
import { MerchantAvatar, StatusBadge } from '../shared/ui'

export function AdminViewBanner({ merchant }: { merchant: Merchant }) {
  const { viewAsMerchant } = useStore()
  const navigate = useNavigate()
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-primary px-4 py-2 text-[12.5px] text-white sm:px-6 lg:px-8">
      <Eye size={14} />
      <span>Admin view - you are seeing exactly what <b className="font-semibold">{merchant.name}</b> sees. Data is scoped to {merchant.id}.</span>
      <button
        onClick={() => { viewAsMerchant(null); navigate(`/admin/merchants/${merchant.id}`) }}
        className="ml-auto inline-flex items-center gap-1 font-medium underline-offset-2 hover:underline"
      >
        <ArrowLeft size={13} /> Return to admin console
      </button>
    </div>
  )
}

export function MerchantSidebarCard({ merchant }: { merchant: Merchant }) {
  return (
    <div className="flex items-center gap-2.5 rounded-[5px] px-2 py-1.5">
      <MerchantAvatar name={merchant.name} size={30} />
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate text-[13px] font-medium text-white">{merchant.name}</div>
        <div className="truncate text-[11.5px] text-sidebar-muted">{merchant.id}</div>
      </div>
      {merchant.status !== 'Active' && <StatusBadge status={merchant.status} />}
    </div>
  )
}
