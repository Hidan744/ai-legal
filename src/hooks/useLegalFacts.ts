import { useMemo } from 'react'
import { useLegalStore } from '@/store/legalStore'
import {
  buildCounterpartyObligationFacts,
  buildRiskClauseBreakdown,
  calculateRenewalDeadlines,
  calculateValueAtRisk,
  flagRenewalRisks,
  flagWorseningCounterparties,
} from '@/lib/legal/formulas'

/** Единая точка расчёта фактов из доменного слоя поверх текущего состояния стора — как
 *  useSalesFacts у AI РОП. Используется дашбордом, договорами, контрагентами и рисками. */
export function useLegalFacts(referenceISO: string = new Date().toISOString()) {
  const contracts = useLegalStore((s) => s.contracts)
  const counterparties = useLegalStore((s) => s.counterparties)
  const riskClauses = useLegalStore((s) => s.riskClauses)
  const obligationEvents = useLegalStore((s) => s.obligationEvents)

  return useMemo(() => {
    const renewalDeadlines = calculateRenewalDeadlines(contracts, referenceISO)
    const renewalRisks = flagRenewalRisks(contracts, referenceISO)
    const valueAtRisk = calculateValueAtRisk(contracts, referenceISO)
    const activeContracts = contracts.filter((c) => c.status !== 'terminated')
    const counterpartyIds = [...new Set(activeContracts.map((c) => c.counterpartyId))]
    const obligationFacts = buildCounterpartyObligationFacts(obligationEvents, counterpartyIds, referenceISO)
    const worseningCounterparties = flagWorseningCounterparties(obligationFacts)
    const activeRiskClauses = riskClauses.filter((rc) => {
      const contract = contracts.find((c) => c.id === rc.contractId)
      return contract && contract.status !== 'terminated' && contract.status !== 'expired'
    })
    const riskClauseBreakdown = buildRiskClauseBreakdown(activeRiskClauses)
    const criticalRiskClauses = activeRiskClauses.filter((rc) => rc.severity === 'critical')

    return {
      renewalDeadlines,
      renewalRisks,
      valueAtRisk,
      obligationFacts,
      worseningCounterparties,
      activeRiskClauses,
      riskClauseBreakdown,
      criticalRiskClauses,
      counterparties,
    }
  }, [contracts, counterparties, riskClauses, obligationEvents, referenceISO])
}
