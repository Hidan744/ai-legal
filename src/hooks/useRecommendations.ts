import { useMemo } from 'react'
import { buildRecommendations } from '@/lib/legal/recommendations'
import { useLegalStore } from '@/store/legalStore'

export function useRecommendations(referenceISO: string = new Date().toISOString()) {
  const contracts = useLegalStore((s) => s.contracts)
  const counterparties = useLegalStore((s) => s.counterparties)
  const riskClauses = useLegalStore((s) => s.riskClauses)
  const obligationEvents = useLegalStore((s) => s.obligationEvents)
  return useMemo(
    () => buildRecommendations(contracts, counterparties, riskClauses, obligationEvents, referenceISO),
    [contracts, counterparties, riskClauses, obligationEvents, referenceISO],
  )
}
