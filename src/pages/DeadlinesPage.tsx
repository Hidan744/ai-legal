import { useMemo } from 'react'
import { CalendarClock } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { UrgencyBadge } from '@/features/contracts/UrgencyBadge'
import { formatCurrency } from '@/lib/utils'
import { useLegalStore } from '@/store/legalStore'
import { calculateRenewalDeadlines, type RenewalDeadline } from '@/lib/legal/formulas'

/** Горизонт планирования календаря — ближайшие 6 месяцев, пропорционально ForecastPage у ai-rop. */
const HORIZON_MONTHS = 6

const MONTH_FORMATTER = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' })

function monthKey(iso: string): string {
  return iso.slice(0, 7)
}

export function DeadlinesPage() {
  const contracts = useLegalStore((s) => s.contracts)
  const counterparties = useLegalStore((s) => s.counterparties)
  const referenceISO = new Date().toISOString()
  const counterpartyById = useMemo(() => new Map(counterparties.map((c) => [c.id, c])), [counterparties])

  const deadlines = useMemo(() => calculateRenewalDeadlines(contracts, referenceISO), [contracts, referenceISO])

  const horizonEnd = useMemo(() => {
    const d = new Date(referenceISO)
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + HORIZON_MONTHS, d.getUTCDate())).getTime()
  }, [referenceISO])

  const withinHorizon = useMemo(
    () => deadlines.filter((d) => d.urgency === 'passed' || new Date(d.noticeDeadlineISO).getTime() <= horizonEnd),
    [deadlines, horizonEnd],
  )

  const groups = useMemo(() => {
    const map = new Map<string, RenewalDeadline[]>()
    for (const d of withinHorizon) {
      const key = d.urgency === 'passed' ? 'passed' : monthKey(d.noticeDeadlineISO)
      const arr = map.get(key) ?? []
      arr.push(d)
      map.set(key, arr)
    }
    for (const arr of map.values()) arr.sort((a, b) => a.daysUntilDeadline - b.daysUntilDeadline)
    const monthKeys = [...map.keys()].filter((k) => k !== 'passed').sort()
    const ordered: Array<{ key: string; label: string; items: RenewalDeadline[] }> = []
    if (map.has('passed')) {
      ordered.push({ key: 'passed', label: 'Срок уведомления уже прошёл', items: map.get('passed')! })
    }
    for (const k of monthKeys) {
      const [year, month] = k.split('-').map(Number)
      ordered.push({ key: k, label: MONTH_FORMATTER.format(new Date(Date.UTC(year, month - 1, 1))), items: map.get(k)! })
    }
    return ordered
  }, [withinHorizon])

  const totalValueInHorizon = withinHorizon.reduce((sum, d) => sum + d.contract.value, 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-50">Календарь дедлайнов</h1>
        <p className="text-sm text-ink-500 mt-1">
          Дедлайны уведомления об отказе от продления на ближайшие {HORIZON_MONTHS} месяцев, сгруппированные по срочности
        </p>
      </div>

      <Card className="p-5 flex items-center gap-3">
        <div className="flex size-9 items-center justify-center rounded-xl bg-ink-800 text-ink-400 shrink-0">
          <CalendarClock className="size-4" />
        </div>
        <div className="text-sm text-ink-300">
          В горизонте {HORIZON_MONTHS} месяцев <span className="text-ink-50 font-medium">{withinHorizon.length}</span> дедлайнов продления на
          сумму <span className="text-ink-50 font-medium">{formatCurrency(totalValueInHorizon)}</span>.
        </div>
      </Card>

      {groups.length === 0 && (
        <Card className="p-8 text-center text-sm text-ink-500">В выбранном горизонте дедлайнов продления не найдено.</Card>
      )}

      {groups.map((group) => (
        <Card key={group.key}>
          <CardHeader>
            <CardTitle className="capitalize">{group.label}</CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-500 border-b border-ink-800">
                  <th className="py-2.5 px-5 font-medium">Договор</th>
                  <th className="py-2.5 px-3 font-medium text-left">Контрагент</th>
                  <th className="py-2.5 px-3 font-medium text-left">Срочность</th>
                  <th className="py-2.5 px-3 font-medium text-right">Срок уведомления</th>
                  <th className="py-2.5 px-3 font-medium text-right">Сумма</th>
                </tr>
              </thead>
              <tbody>
                {group.items.map((d) => (
                  <tr key={d.contract.id} className="border-b border-ink-800/60 last:border-0 hover:bg-ink-900/40">
                    <td className="py-3 px-5 text-ink-100 max-w-56 truncate" title={d.contract.title}>{d.contract.title}</td>
                    <td className="py-3 px-3 text-ink-300 whitespace-nowrap">{counterpartyById.get(d.contract.counterpartyId)?.name ?? '—'}</td>
                    <td className="py-3 px-3"><UrgencyBadge urgency={d.urgency} /></td>
                    <td className="py-3 px-3 text-right text-ink-300 whitespace-nowrap">
                      {new Date(d.noticeDeadlineISO).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: '2-digit' })}
                    </td>
                    <td className="py-3 px-3 text-right text-ink-100 font-medium whitespace-nowrap">{formatCurrency(d.contract.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
