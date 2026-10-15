import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Minus, TrendingDown, TrendingUp } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CategoryBadge } from '@/features/counterparties/CategoryBadge'
import { cn, formatCurrency } from '@/lib/utils'
import { useLegalStore } from '@/store/legalStore'
import { buildCounterpartyObligationFacts } from '@/lib/legal/formulas'

export function CounterpartiesPage() {
  const counterparties = useLegalStore((s) => s.counterparties)
  const contracts = useLegalStore((s) => s.contracts)
  const obligationEvents = useLegalStore((s) => s.obligationEvents)
  const navigate = useNavigate()
  const referenceISO = new Date().toISOString()

  const obligationFacts = useMemo(
    () => buildCounterpartyObligationFacts(obligationEvents, counterparties.map((c) => c.id), referenceISO),
    [obligationEvents, counterparties, referenceISO],
  )
  const factByCounterparty = useMemo(() => new Map(obligationFacts.map((f) => [f.counterpartyId, f])), [obligationFacts])

  const rows = counterparties.map((cp) => {
    const cpContracts = contracts.filter((c) => c.counterpartyId === cp.id)
    const activeContracts = cpContracts.filter((c) => c.status === 'active' || c.status === 'expiring_soon')
    const totalValue = activeContracts.reduce((sum, c) => sum + c.value, 0)
    const fact = factByCounterparty.get(cp.id)
    return {
      counterparty: cp,
      activeCount: activeContracts.length,
      totalContracts: cpContracts.length,
      totalValue,
      fact,
    }
  })

  rows.sort((a, b) => (b.fact?.currentCount ?? 0) - (a.fact?.currentCount ?? 0) || b.totalValue - a.totalValue)

  const totalDisputes = obligationEvents.filter((e) => e.type === 'dispute').length
  const totalMissedDeadlines = obligationEvents.filter((e) => e.type === 'missed_deadline').length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-50">Контрагенты</h1>
        <p className="text-sm text-ink-500 mt-1">Надёжность контрагентов по истории споров и нарушений — клик по строке открывает договоры</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Сводка по контрагентам</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-500 border-b border-ink-800">
                <th className="py-2.5 pr-4 font-medium">Контрагент</th>
                <th className="py-2.5 pr-4 font-medium text-left">Категория</th>
                <th className="py-2.5 pr-4 font-medium text-right">Действующих договоров</th>
                <th className="py-2.5 pr-4 font-medium text-right">Сумма активных договоров</th>
                <th className="py-2.5 pr-4 font-medium text-right">Споры/нарушения (90 дн.)</th>
                <th className="py-2.5 font-medium text-right">Тренд</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ counterparty, activeCount, totalValue, fact }) => (
                <tr
                  key={counterparty.id}
                  onClick={() => navigate(`/app/contracts?counterparty=${counterparty.id}`)}
                  className="cursor-pointer border-b border-ink-800/60 last:border-0 hover:bg-ink-900/40"
                >
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2.5">
                      <div className="flex size-8 items-center justify-center rounded-full bg-ink-800 text-xs font-medium text-ink-200 shrink-0">
                        {counterparty.name.slice(0, 2).toUpperCase()}
                      </div>
                      <span className="text-ink-100">{counterparty.name}</span>
                    </div>
                  </td>
                  <td className="py-3 pr-4"><CategoryBadge category={counterparty.category} /></td>
                  <td className="py-3 pr-4 text-right text-ink-200">{activeCount}</td>
                  <td className="py-3 pr-4 text-right text-ink-100 font-medium whitespace-nowrap">{formatCurrency(totalValue)}</td>
                  <td className="py-3 pr-4 text-right">
                    <span className={cn('font-medium', (fact?.currentCount ?? 0) > 0 ? 'text-warning-500' : 'text-ink-400')}>
                      {fact?.currentCount ?? 0}
                    </span>
                  </td>
                  <td className="py-3 text-right">
                    <TrendBadge value={fact?.changePct ?? null} />
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-ink-500">Нет контрагентов</td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Журнал обязательств — сводка</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Stat label="Всего контрагентов" value={String(counterparties.length)} />
          <Stat label="Споры/претензии (всего)" value={String(totalDisputes)} />
          <Stat label="Нарушения сроков (всего)" value={String(totalMissedDeadlines)} />
        </CardContent>
      </Card>
    </div>
  )
}

function TrendBadge({ value }: { value: number | null }) {
  if (value === null) return <span className="text-ink-500 inline-flex items-center gap-1 justify-end"><Minus className="size-3.5" />—</span>
  if (Math.abs(value) < 1) return <span className="text-ink-500 inline-flex items-center gap-1 justify-end"><Minus className="size-3.5" />0%</span>
  const isUp = value > 0
  return (
    <span className={cn('inline-flex items-center gap-1 justify-end font-medium', isUp ? 'text-negative-500' : 'text-positive-500')}>
      {isUp ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
      {Math.abs(Math.round(value))}%
    </span>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-ink-500 mb-1.5">{label}</div>
      <div className="font-display text-lg font-semibold text-ink-50">{value}</div>
    </div>
  )
}
