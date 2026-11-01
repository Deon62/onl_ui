import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Banknote } from 'lucide-react'
import { useStore } from '../../store/AppStore'
import { useMerchantLedger, useMerchantScope } from '../../store/selectors'
import { fmtKES } from '../../lib/format'
import { displayDestination } from '../../lib/settlement'
import { BalanceStatement, PayoutsTable } from '../shared/FinancePanels'
import { PayoutRequestModal } from '../shared/PayoutRequestModal'
import { Button, Card, KeyValue, PageHeader, StatCard } from '../shared/ui'

export function MerchantPayoutsPage() {
  const { data } = useStore()
  const { merchant } = useMerchantScope()
  const ledger = useMerchantLedger(merchant?.id ?? null)
  const [open, setOpen] = useState(false)
  if (!merchant || !ledger) return null
  const payouts = data.payouts.filter((p) => p.merchantId === merchant.id)
  const pending = payouts.filter((p) => p.status === 'Pending' || p.status === 'Processing')
  const completed = payouts.filter((p) => p.status === 'Completed')
  return (
    <>
      <PageHeader
        title="Payouts"
        description="Withdraw settled funds to your registered account. Money collected becomes available for payout after the settlement window."
        actions={<Button variant="primary" icon={Banknote} onClick={() => setOpen(true)} disabled={merchant.status !== 'Active'}>Request payout</Button>}
      />
      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Available balance" value={fmtKES(ledger.available)} hint="withdrawable now" accent="var(--success)" />
        <StatCard label="Pending settlement" value={fmtKES(ledger.pendingSettlement)} hint="collected, not yet withdrawable" />
        <StatCard label="Pending payouts" value={fmtKES(ledger.payoutsInProgress)} hint={`${pending.length} requests in progress`} />
        <StatCard label="Completed payouts" value={fmtKES(ledger.paidOutNet)} hint={`${completed.length} payouts received`} />
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)]">
        <Card flush title="Payout history"><PayoutsTable payouts={payouts} /></Card>
        <div className="space-y-4">
          <Card title="Balance breakdown"><BalanceStatement ledger={ledger} /></Card>
          <Card title="Payout settings">
            <KeyValue rows={[
              ['Schedule', merchant.payoutSchedule],
              ['Method', merchant.payoutMethod],
              ['Destination', displayDestination(merchant.payoutMethod, merchant.payoutDestination)],
              ['Payout fee', fmtKES(data.config.payout.feeFixed)],
              ['Minimum payout', fmtKES(data.config.payout.minAmount)],
            ]} />
            <Link to="/merchant/settlement" className="mt-3 inline-flex items-center gap-1 text-[12.5px] font-medium text-primary hover:underline">Change settlement account <ArrowRight size={13} /></Link>
          </Card>
        </div>
      </div>
      <PayoutRequestModal open={open} merchant={merchant} onClose={() => setOpen(false)} />
    </>
  )
}
