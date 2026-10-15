import { useMemo } from 'react'
import { ShieldAlert } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { KpiCard } from '@/features/dashboard/KpiCard'
import { RiskClauseBreakdown } from '@/features/risks/RiskClauseBreakdown'
import { RiskSeverityBadge } from '@/features/risks/RiskSeverityBadge'
import { formatCurrency } from '@/lib/utils'
import { useLegalStore } from '@/store/legalStore'
import { RISK_CLAUSE_CATEGORY_LABELS } from '@/types/legal'

const SEVERITY_RANK = { critical: 0, serious: 1, warning: 2, good: 3 } as const

export function RisksPage() {
  const contracts = useLegalStore((s) => s.contracts)
  const counterparties = useLegalStore((s) => s.counterparties)
  const riskClauses = useLegalStore((s) => s.riskClauses)

  const contractById = useMemo(() => new Map(contracts.map((c) => [c.id, c])), [contracts])
  const counterpartyById = useMemo(() => new Map(counterparties.map((c) => [c.id, c])), [counterparties])

  const activeRiskClauses = useMemo(
    () => riskClauses.filter((rc) => {
      const contract = contractById.get(rc.contractId)
      return contract && contract.status !== 'terminated' && contract.status !== 'expired'
    }),
    [riskClauses, contractById],
  )

  const criticalCount = activeRiskClauses.filter((rc) => rc.severity === 'critical').length
  const seriousCount = activeRiskClauses.filter((rc) => rc.severity === 'serious').length

  const severeList = useMemo(
    () =>
      [...activeRiskClauses]
        .filter((rc) => rc.severity === 'critical' || rc.severity === 'serious')
        .sort((a, b) => {
          const byRank = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
          if (byRank !== 0) return byRank
          const va = contractById.get(a.contractId)?.value ?? 0
          const vb = contractById.get(b.contractId)?.value ?? 0
          return vb - va
        }),
    [activeRiskClauses, contractById],
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-50">Риски</h1>
        <p className="text-sm text-ink-500 mt-1">Разбивка риск-пунктов по категориям и договоры с наиболее серьёзными условиями</p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Риск-пунктов (действующие)" value={String(activeRiskClauses.length)} tooltip="Все риск-пункты, привязанные к действующим или скоро истекающим договорам." icon={<ShieldAlert className="size-4 text-ink-500" />} />
        <KpiCard label="Критических" value={String(criticalCount)} tooltip="Риск-пункты наивысшей серьёзности — требуют немедленной юридической проверки." icon={<ShieldAlert className="size-4 text-ink-500" />} accent={criticalCount > 0 ? 'negative' : 'neutral'} />
        <KpiCard label="Серьёзных" value={String(seriousCount)} tooltip="Риск-пункты высокой серьёзности, не требующие немедленного действия, но заслуживающие внимания." icon={<ShieldAlert className="size-4 text-ink-500" />} accent={seriousCount > 0 ? 'negative' : 'neutral'} />
        <KpiCard
          label="Категорий риска"
          value={String(new Set(activeRiskClauses.map((rc) => rc.category)).size)}
          tooltip="Число уникальных категорий риск-пунктов, встречающихся в портфеле."
          icon={<ShieldAlert className="size-4 text-ink-500" />}
        />
      </div>

      <RiskClauseBreakdown riskClauses={activeRiskClauses} />

      <Card>
        <CardHeader>
          <CardTitle>Договоры с наиболее серьёзными риск-пунктами</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-500 border-b border-ink-800">
                <th className="py-2.5 px-5 font-medium">Договор</th>
                <th className="py-2.5 px-3 font-medium text-left">Контрагент</th>
                <th className="py-2.5 px-3 font-medium text-left">Категория риска</th>
                <th className="py-2.5 px-3 font-medium text-left">Серьёзность</th>
                <th className="py-2.5 px-3 font-medium text-right">Сумма договора</th>
              </tr>
            </thead>
            <tbody>
              {severeList.map((rc) => {
                const contract = contractById.get(rc.contractId)
                const counterparty = contract ? counterpartyById.get(contract.counterpartyId) : undefined
                return (
                  <tr key={rc.id} className="border-b border-ink-800/60 last:border-0 hover:bg-ink-900/40">
                    <td className="py-3 px-5 text-ink-100 max-w-56 truncate" title={contract?.title}>{contract?.title ?? '—'}</td>
                    <td className="py-3 px-3 text-ink-300 whitespace-nowrap">{counterparty?.name ?? '—'}</td>
                    <td className="py-3 px-3 text-ink-300 whitespace-nowrap">{RISK_CLAUSE_CATEGORY_LABELS[rc.category]}</td>
                    <td className="py-3 px-3"><RiskSeverityBadge severity={rc.severity} /></td>
                    <td className="py-3 px-3 text-right text-ink-100 font-medium whitespace-nowrap">{contract ? formatCurrency(contract.value) : '—'}</td>
                  </tr>
                )
              })}
              {severeList.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-ink-500">Критических или серьёзных риск-пунктов не найдено</td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
