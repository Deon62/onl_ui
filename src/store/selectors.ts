import { useMemo } from 'react'
import { useStore } from './AppStore'
import { allLedgers, merchantLedger } from '../lib/finance'

/** The merchant whose data the current merchant-facing view is scoped to. */
export function useMerchantScope() {
  const { data, session } = useStore()
  const merchantId = session?.merchantId ?? null
  const merchant = data.merchants.find((m) => m.id === merchantId) ?? null
  return { merchant, merchantId, isAdminViewing: session?.role === 'admin' }
}

export function useMerchantLedger(merchantId: string | null) {
  const { data } = useStore()
  return useMemo(
    () => (merchantId ? merchantLedger(merchantId, data) : null),
    [merchantId, data],
  )
}

export function useAllLedgers() {
  const { data } = useStore()
  return useMemo(() => allLedgers(data), [data])
}
