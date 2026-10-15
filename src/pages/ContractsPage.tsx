import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowDownUp, FileText, ShieldAlert, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { KpiCard } from '@/features/dashboard/KpiCard'
import { UrgencyBadge } from '@/features/contracts/UrgencyBadge'
import { SourceBadge } from '@/features/contracts/SourceBadge'
import { ContractStatusBadge } from '@/features/contracts/ContractStatusBadge'
import { CategoryBadge } from '@/features/counterparties/CategoryBadge'
import { cn, formatCurrency } from '@/lib/utils'
import { useLegalStore } from '@/store/legalStore'
import { calculateRenewalDeadline } from '@/lib/legal/formulas'
import { CONTRACT_TYPE_LABELS, type ContractType, type CounterpartyCategory } from '@/types/legal'

const ALL = '__all__'

type SortKey = 'title' | 'counterparty' | 'type' | 'endDate' | 'deadline' | 'autoRenew' | 'value' | 'status' | 'riskCount'

const SORT_LABELS: Record<SortKey, string> = {
  title: 'Договору',
  counterparty: 'Контрагенту',
  type: 'Типу',
  endDate: 'Дате окончания',
  deadline: 'Дедлайну уведомления',
  autoRenew: 'Автопролонгации',
  value: 'Сумме',
  status: 'Статусу',
  riskCount: 'Числу рисков',
}
const SORT_KEYS = Object.keys(SORT_LABELS) as SortKey[]

type ChipFilter = 'all' | 'passed' | 'urgent' | 'thisMonth' | 'autoRenew' | 'big'

const CHIPS: Array<{ key: ChipFilter; label: string }> = [
  { key: 'all', label: 'Все' },
  { key: 'passed', label: 'Просрочен уведомление' },
  { key: 'urgent', label: 'Срочно' },
  { key: 'thisMonth', label: 'В этом месяце' },
  { key: 'autoRenew', label: 'Автопролонгация' },
  { key: 'big', label: 'Крупные' },
]

/** Порог «крупного» договора, ₽ — тот же порядок величины, что и у headline-истории ТехноСнаб. */
const BIG_CONTRACT_VALUE_THRESHOLD = 1_500_000

export function ContractsPage() {
  const contracts = useLegalStore((s) => s.contracts)
  const counterparties = useLegalStore((s) => s.counterparties)
  const riskClauses = useLegalStore((s) => s.riskClauses)
  const referenceISO = new Date().toISOString()
  const counterpartyById = useMemo(() => new Map(counterparties.map((c) => [c.id, c])), [counterparties])
  const riskCountByContract = useMemo(() => {
    const map = new Map<string, number>()
    for (const rc of riskClauses) map.set(rc.contractId, (map.get(rc.contractId) ?? 0) + 1)
    return map
  }, [riskClauses])

  const [searchParams] = useSearchParams()
  const counterpartyFromUrl = searchParams.get('counterparty')

  const [typeFilter, setTypeFilter] = useState<string>(ALL)
  const [counterpartyFilter, setCounterpartyFilter] = useState<string>(counterpartyFromUrl ?? ALL)
  const [categoryFilter, setCategoryFilter] = useState<string>(ALL)
  const [valueMin, setValueMin] = useState('')
  const [valueMax, setValueMax] = useState('')
  const [chip, setChip] = useState<ChipFilter>('all')
  const [sortKey, setSortKey] = useState<SortKey>('deadline')
  const [sortDesc, setSortDesc] = useState(false)

  const deadlineByContract = useMemo(() => {
    const map = new Map<string, ReturnType<typeof calculateRenewalDeadline>>()
    for (const c of contracts) map.set(c.id, calculateRenewalDeadline(c, referenceISO))
    return map
  }, [contracts, referenceISO])

  // --- KPI-строка ---
  const totalValue = contracts.reduce((sum, c) => sum + c.value, 0)
  const activeCount = contracts.filter((c) => c.status === 'active' || c.status === 'expiring_soon').length
  const passedCount = contracts.filter((c) => deadlineByContract.get(c.id)?.urgency === 'passed').length
  const urgentCount = contracts.filter((c) => deadlineByContract.get(c.id)?.urgency === 'urgent').length

  const nowMs = new Date(referenceISO).getTime()
  const monthEnd = useMemo(() => {
    const d = new Date(referenceISO)
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getTime()
  }, [referenceISO])

  const rows = useMemo(() => {
    let filtered = contracts
    if (typeFilter !== ALL) filtered = filtered.filter((c) => c.type === typeFilter)
    if (counterpartyFilter !== ALL) filtered = filtered.filter((c) => c.counterpartyId === counterpartyFilter)
    if (categoryFilter !== ALL) filtered = filtered.filter((c) => counterpartyById.get(c.counterpartyId)?.category === categoryFilter)
    if (valueMin) filtered = filtered.filter((c) => c.value >= Number(valueMin))
    if (valueMax) filtered = filtered.filter((c) => c.value <= Number(valueMax))

    switch (chip) {
      case 'all':
        break
      case 'passed':
        filtered = filtered.filter((c) => deadlineByContract.get(c.id)?.urgency === 'passed')
        break
      case 'urgent':
        filtered = filtered.filter((c) => deadlineByContract.get(c.id)?.urgency === 'urgent')
        break
      case 'thisMonth':
        filtered = filtered.filter((c) => c.endDate !== null && new Date(c.endDate).getTime() <= monthEnd && new Date(c.endDate).getTime() >= nowMs)
        break
      case 'autoRenew':
        filtered = filtered.filter((c) => c.autoRenew)
        break
      case 'big':
        filtered = filtered.filter((c) => c.value >= BIG_CONTRACT_VALUE_THRESHOLD)
        break
    }

    const withComputed = filtered.map((c) => ({
      contract: c,
      deadline: deadlineByContract.get(c.id) ?? null,
      riskCount: riskCountByContract.get(c.id) ?? 0,
    }))

    const urgencyRank: Record<string, number> = { passed: 0, urgent: 1, upcoming: 2, comfortable: 3 }
    withComputed.sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'title':
          cmp = a.contract.title.localeCompare(b.contract.title, 'ru')
          break
        case 'counterparty':
          cmp = (counterpartyById.get(a.contract.counterpartyId)?.name ?? '').localeCompare(
            counterpartyById.get(b.contract.counterpartyId)?.name ?? '',
            'ru',
          )
          break
        case 'type':
          cmp = CONTRACT_TYPE_LABELS[a.contract.type].localeCompare(CONTRACT_TYPE_LABELS[b.contract.type], 'ru')
          break
        case 'endDate': {
          const da = a.contract.endDate ? new Date(a.contract.endDate).getTime() : Number.POSITIVE_INFINITY
          const db = b.contract.endDate ? new Date(b.contract.endDate).getTime() : Number.POSITIVE_INFINITY
          cmp = da - db
          break
        }
        case 'deadline': {
          const ua = a.deadline ? urgencyRank[a.deadline.urgency] : 4
          const ub = b.deadline ? urgencyRank[b.deadline.urgency] : 4
          cmp = ua !== ub ? ua - ub : (a.deadline?.daysUntilDeadline ?? 0) - (b.deadline?.daysUntilDeadline ?? 0)
          break
        }
        case 'autoRenew':
          cmp = Number(a.contract.autoRenew) - Number(b.contract.autoRenew)
          break
        case 'value':
          cmp = a.contract.value - b.contract.value
          break
        case 'status':
          cmp = a.contract.status.localeCompare(b.contract.status)
          break
        case 'riskCount':
          cmp = a.riskCount - b.riskCount
          break
      }
      return sortDesc ? -cmp : cmp
    })
    return withComputed
  }, [
    contracts,
    typeFilter,
    counterpartyFilter,
    categoryFilter,
    valueMin,
    valueMax,
    chip,
    sortKey,
    sortDesc,
    counterpartyById,
    deadlineByContract,
    riskCountByContract,
    monthEnd,
    nowMs,
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-50">Договоры</h1>
        <p className="text-sm text-ink-500 mt-1">Реестр всех договоров с дедлайнами продления и фильтрами</p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Всего договоров" value={String(contracts.length)} tooltip="Все договоры в портфеле, включая истёкшие и расторгнутые." icon={<FileText className="size-4 text-ink-500" />} />
        <KpiCard label="Действующих" value={String(activeCount)} tooltip="Договоры со статусом «Действует» или «Скоро истекает»." icon={<FileText className="size-4 text-ink-500" />} />
        <KpiCard label="Общая сумма портфеля" value={formatCurrency(totalValue)} tooltip="Суммарная стоимость всех договоров." icon={<Wallet className="size-4 text-ink-500" />} />
        <KpiCard
          label="Просрочено / срочно"
          value={`${passedCount} / ${urgentCount}`}
          tooltip="Слева — договоры, где срок уведомления об отказе уже прошёл. Справа — где он наступает в ближайшие 14 дней."
          icon={<ShieldAlert className="size-4 text-ink-500" />}
          accent={passedCount > 0 ? 'negative' : urgentCount > 0 ? 'negative' : 'neutral'}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {CHIPS.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setChip(c.key)}
            className={cn(
              'rounded-full px-3 py-1.5 text-xs font-medium border transition-colors',
              chip === c.key ? 'bg-brand-500 text-ink-950 border-brand-500' : 'border-ink-700 text-ink-300 hover:bg-ink-800',
            )}
          >
            {c.label}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-1.5">
          <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
            <SelectTrigger className="w-44 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SORT_KEYS.map((key) => (
                <SelectItem key={key} value={key}>По {SORT_LABELS[key]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="button" variant="outline" size="sm" className="h-8 px-2" onClick={() => setSortDesc((d) => !d)} title={sortDesc ? 'По убыванию' : 'По возрастанию'}>
            <ArrowDownUp className={cn('size-3.5', sortDesc && 'rotate-180')} />
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Фильтры</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3 items-end">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Тип договора" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Все типы</SelectItem>
              {(Object.keys(CONTRACT_TYPE_LABELS) as ContractType[]).map((t) => (
                <SelectItem key={t} value={t}>{CONTRACT_TYPE_LABELS[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Категория контрагента" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Все категории</SelectItem>
              {(['supplier', 'client', 'contractor', 'landlord', 'other'] as CounterpartyCategory[]).map((cat) => (
                <SelectItem key={cat} value={cat}>{cat === 'supplier' ? 'Поставщик' : cat === 'client' ? 'Клиент' : cat === 'contractor' ? 'Подрядчик' : cat === 'landlord' ? 'Арендодатель' : 'Другое'}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={counterpartyFilter} onValueChange={setCounterpartyFilter}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Контрагент" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Все контрагенты</SelectItem>
              {counterparties.map((cp) => (
                <SelectItem key={cp.id} value={cp.id}>{cp.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="space-y-1">
            <div className="text-[11px] text-ink-500">Сумма, ₽</div>
            <div className="flex items-center gap-1.5">
              <Input type="number" value={valueMin} onChange={(e) => setValueMin(e.target.value)} placeholder="от" className="w-28 h-9 text-xs" />
              <Input type="number" value={valueMax} onChange={(e) => setValueMax(e.target.value)} placeholder="до" className="w-28 h-9 text-xs" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Карточки вместо таблицы на любом экране — 10-колоночная таблица с сайдбаром не влезает
          без нечитаемого сжатия или скролла ни на одной разумной ширине. Сортировка — через
          контрол над списком (см. выше), а не по клику на заголовок колонки. */}
      <div className="space-y-3">
        {rows.map(({ contract, deadline, riskCount }) => {
          const counterparty = counterpartyById.get(contract.counterpartyId)
          return (
            <div key={contract.id} className="rounded-xl border border-ink-800 bg-ink-900/40 p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-ink-100 truncate" title={contract.title}>{contract.title}</div>
                  <div className="flex items-center gap-1.5 mt-1 min-w-0">
                    <span className="text-xs text-ink-400 truncate max-w-40" title={counterparty?.name}>{counterparty?.name ?? '—'}</span>
                    {counterparty && <CategoryBadge category={counterparty.category} />}
                  </div>
                </div>
                <ContractStatusBadge status={contract.status} />
              </div>

              <div className="flex items-center justify-between text-xs text-ink-500">
                <span>{CONTRACT_TYPE_LABELS[contract.type]}</span>
                <span>{contract.endDate ? new Date(contract.endDate).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: '2-digit' }) : 'Бессрочный'}</span>
              </div>

              {deadline && (
                <div className="flex items-center justify-between">
                  <UrgencyBadge urgency={deadline.urgency} />
                  <span className="text-[11px] text-ink-500">
                    {deadline.urgency === 'passed'
                      ? `просрочено на ${Math.abs(Math.round(deadline.daysUntilDeadline))} дн.`
                      : `осталось ${Math.round(deadline.daysUntilDeadline)} дн.`}
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between pt-2 border-t border-ink-800/60">
                <span className="text-sm font-semibold text-ink-100">{formatCurrency(contract.value)}</span>
                <div className="flex items-center gap-2.5 text-xs">
                  {contract.autoRenew && <span className="text-warning-500">Автопрод.</span>}
                  {riskCount > 0 && <span className="text-warning-500 font-medium">Риски: {riskCount}</span>}
                  <SourceBadge source={contract.source} />
                </div>
              </div>
            </div>
          )
        })}
        {rows.length === 0 && <Card className="p-8 text-center text-sm text-ink-500">Нет договоров по выбранным фильтрам</Card>}
      </div>
    </div>
  )
}
