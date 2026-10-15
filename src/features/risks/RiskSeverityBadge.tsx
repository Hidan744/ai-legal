import { STATUS } from '@/lib/chartColors'
import { RISK_CLAUSE_SEVERITY_LABELS, type RiskClauseSeverity } from '@/types/legal'

/** Цвет берётся напрямую из STATUS (chartColors.ts) — риск-пункты используют тот же
 *  4-ступенчатый набор good/warning/serious/critical, что и dataviz skill резервирует под
 *  состояние, а не произвольные Tailwind-оттенки. */
const SEVERITY_COLOR: Record<RiskClauseSeverity, string> = {
  good: STATUS.good,
  warning: STATUS.warning,
  serious: STATUS.serious,
  critical: STATUS.critical,
}

export function RiskSeverityBadge({ severity }: { severity: RiskClauseSeverity }) {
  const color = SEVERITY_COLOR[severity]
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium whitespace-nowrap"
      style={{ color, backgroundColor: `${color}1a` }}
    >
      <span className="size-1.5 rounded-full" style={{ backgroundColor: color }} aria-hidden />
      {RISK_CLAUSE_SEVERITY_LABELS[severity]}
    </span>
  )
}
