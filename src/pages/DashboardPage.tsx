import { CheckCircle2, FileText, ShieldAlert, Users, Wallet } from 'lucide-react'
import { KpiCard } from '@/features/dashboard/KpiCard'
import { RecommendationCard } from '@/features/dashboard/RecommendationCard'
import { LegalHealthPanel, type LegalHealthStatus } from '@/features/dashboard/LegalHealthPanel'
import { Card } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils'
import { useLegalStore } from '@/store/legalStore'
import { useRecommendations } from '@/hooks/useRecommendations'
import { useLegalFacts } from '@/hooks/useLegalFacts'

export function DashboardPage() {
  const profile = useLegalStore((s) => s.profile)
  const contracts = useLegalStore((s) => s.contracts)
  const referenceISO = new Date().toISOString()
  const recommendations = useRecommendations(referenceISO)
  const facts = useLegalFacts(referenceISO)

  if (!profile) return null

  const criticalCount = recommendations.filter((r) => r.severity === 'critical').length
  const warningCount = recommendations.filter((r) => r.severity === 'warning').length
  const healthStatus: LegalHealthStatus = criticalCount > 0 ? 'critical' : warningCount > 0 ? 'attention' : 'stable'

  const activeContractsCount = contracts.filter((c) => c.status === 'active' || c.status === 'expiring_soon').length
  const deadlineRiskCount = facts.renewalRisks.length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-50">Dashboard</h1>
        <p className="text-sm text-ink-500 mt-1">{profile.companyName}</p>
      </div>

      {/* Рекомендации — герой дашборда: продукт говорит «вот что делать», а не только показывает цифры. */}
      <div>
        <h2 className="text-sm font-semibold text-ink-200 mb-3">Рекомендации на сегодня</h2>
        {recommendations.length > 0 ? (
          <div className="space-y-3">
            {recommendations.map((rec) => (
              <RecommendationCard key={rec.id} recommendation={rec} />
            ))}
          </div>
        ) : (
          <Card className="p-5 flex items-center gap-3 border-positive-500/30 bg-positive-500/10">
            <CheckCircle2 className="size-5 text-positive-500 shrink-0" />
            <p className="text-sm text-ink-100">
              Явных проблем не найдено. Дедлайны продления и риск-пункты портфеля в норме.
            </p>
          </Card>
        )}
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Дедлайн уже просрочен/срочен"
          value={String(deadlineRiskCount)}
          tooltip="Договоры, у которых срок уведомления об отказе от продления уже прошёл или наступает в ближайшие 14 дней."
          icon={<FileText className="size-4 text-ink-500" />}
          accent={deadlineRiskCount > 0 ? 'negative' : 'neutral'}
        />
        <KpiCard
          label="Сумма под риском дедлайна"
          value={formatCurrency(facts.valueAtRisk)}
          tooltip="Суммарная стоимость договоров с просроченным или срочным сроком уведомления."
          icon={<Wallet className="size-4 text-ink-500" />}
          accent={facts.valueAtRisk > 0 ? 'negative' : 'neutral'}
        />
        <KpiCard
          label="Контрагентов с ухудшением"
          value={String(facts.worseningCounterparties.length)}
          tooltip="Контрагенты, у которых число споров и нарушений сроков заметно выросло за последние 90 дней."
          icon={<Users className="size-4 text-ink-500" />}
          accent={facts.worseningCounterparties.length > 0 ? 'negative' : 'neutral'}
        />
        <KpiCard
          label="Критических риск-пунктов"
          value={String(facts.criticalRiskClauses.length)}
          tooltip="Риск-пункты наивысшей серьёзности в действующих договорах — требуют юридической проверки."
          icon={<ShieldAlert className="size-4 text-ink-500" />}
          accent={facts.criticalRiskClauses.length > 0 ? 'negative' : 'neutral'}
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <LegalHealthPanel
            status={healthStatus}
            activeContractsCount={activeContractsCount}
            valueAtRisk={facts.valueAtRisk}
            worseningCounterpartiesCount={facts.worseningCounterparties.length}
            criticalRiskClausesCount={facts.criticalRiskClauses.length}
          />
        </div>

        <Card className="p-5">
          <div className="text-sm font-medium text-ink-200 mb-3">Портфель договоров</div>
          <div className="space-y-2.5 text-sm">
            <Row label="Всего договоров" value={String(contracts.length)} />
            <Row label="Действующих" value={String(activeContractsCount)} />
            <Row label="Истёкших" value={String(contracts.filter((c) => c.status === 'expired').length)} />
            <Row label="Расторгнутых" value={String(contracts.filter((c) => c.status === 'terminated').length)} />
          </div>
        </Card>
      </div>

      {facts.renewalRisks.length > 0 && (
        <Card className="p-5">
          <div className="text-sm font-medium text-ink-200 mb-3">Ближайшие дедлайны продления</div>
          <div className="space-y-2">
            {facts.renewalRisks.slice(0, 5).map((flag) => (
              <div key={flag.contract.id} className="flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <div className="text-ink-100 truncate">{flag.contract.title}</div>
                  <div className="text-xs text-ink-500">
                    {facts.counterparties.find((c) => c.id === flag.contract.counterpartyId)?.name ?? '—'}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-ink-100 font-medium">{formatCurrency(flag.contract.value)}</div>
                  <div className={flag.urgency === 'passed' ? 'text-xs text-negative-500' : 'text-xs text-warning-500'}>
                    {flag.urgency === 'passed'
                      ? `Просрочен на ${Math.abs(Math.round(flag.daysUntilDeadline))} дн.`
                      : `Осталось ${Math.round(flag.daysUntilDeadline)} дн.`}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-ink-400">{label}</span>
      <span className="text-ink-100 font-medium">{value}</span>
    </div>
  )
}
