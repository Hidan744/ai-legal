import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CATEGORICAL } from '@/lib/chartColors'
import { buildRiskClauseBreakdown } from '@/lib/legal/formulas'
import { formatPercent } from '@/lib/utils'
import { RISK_CLAUSE_CATEGORY_LABELS, type RiskClause, type RiskClauseCategory } from '@/types/legal'

// Фиксированный порядок категорий по слоту палитры — НЕ пересортировывается по величине доли
// (см. dataviz skill: категориальный цвет закреплён за категорией, а не за рангом).
const CATEGORY_ORDER: RiskClauseCategory[] = [
  'penalty',
  'unilateral_termination',
  'unlimited_liability',
  'auto_renewal_no_notice',
  'no_force_majeure',
  'other',
]
const CATEGORY_COLOR: Record<RiskClauseCategory, string> = {
  penalty: CATEGORICAL.slot1,
  unilateral_termination: CATEGORICAL.slot2,
  unlimited_liability: CATEGORICAL.slot3,
  auto_renewal_no_notice: CATEGORICAL.slot4,
  no_force_majeure: CATEGORICAL.slot5,
  other: CATEGORICAL.slot6,
}

/** Бар-лист категорий риск-пунктов — переданные `riskClauses` уже отфильтрованы вызывающей
 *  страницей (обычно только действующие договоры). */
export function RiskClauseBreakdown({ riskClauses, title = 'Риск-пункты по категориям' }: { riskClauses: RiskClause[]; title?: string }) {
  const breakdown = buildRiskClauseBreakdown(riskClauses)
  if (breakdown.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-ink-500">Риск-пункты не найдены в активном портфеле договоров.</p>
        </CardContent>
      </Card>
    )
  }
  const byCategory = new Map(breakdown.map((b) => [b.category as RiskClauseCategory, b]))

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {CATEGORY_ORDER.filter((c) => byCategory.has(c)).map((category) => {
          const item = byCategory.get(category)!
          return (
            <div key={category} className="flex items-center gap-3">
              <span className="w-56 text-xs text-ink-300 shrink-0 truncate">{RISK_CLAUSE_CATEGORY_LABELS[category]}</span>
              <div className="flex-1 h-2 rounded-full bg-ink-800 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${Math.max(2, item.sharePct)}%`, backgroundColor: CATEGORY_COLOR[category] }} />
              </div>
              <span className="w-14 text-right text-xs text-ink-200 font-medium">
                {item.count} · {formatPercent(item.sharePct, 0)}
              </span>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
