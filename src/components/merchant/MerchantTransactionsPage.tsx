import { useMerchantScope } from '../../store/selectors'
import { TransactionsExplorer } from '../shared/TransactionsExplorer'
import { PageHeader } from '../shared/ui'

export function MerchantTransactionsPage() {
  const { merchant } = useMerchantScope()
  if (!merchant) return null
  return (
    <>
      <PageHeader title="Transactions" description="Every payment made to your business through Oryne. Select a transaction for details or to download a receipt." />
      <TransactionsExplorer mode="merchant" merchantId={merchant.id} pageSize={20} />
    </>
  )
}
