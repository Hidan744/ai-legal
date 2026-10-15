import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowDownUp, FileText, ShieldAlert, Wallet } from 'lucide-react'
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

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDesc((d) => !d)
    else {
      setSortKey(key)
      setSortDesc(false)
    }
  }

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

      <div className="flex flex-wrap gap-2">
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

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-500 border-b border-ink-800">
                <SortableHeader label="Договор" active={sortKey === 'title'} desc={sortDesc} onClick={() => toggleSort('title')} align="left" />
                <SortableHeader label="Контрагент" active={sortKey === 'counterparty'} desc={sortDesc} onClick={() => toggleSort('counterparty')} align="left" />
                <SortableHeader label="Тип" active={sortKey === 'type'} desc={sortDesc} onClick={() => toggleSort('type')} align="left" />
                <SortableHeader label="Дата окончания" active={sortKey === 'endDate'} desc={sortDesc} onClick={() => toggleSort('endDate')} />
                <SortableHeader label="Дедлайн уведомления" active={sortKey === 'deadline'} desc={sortDesc} onClick={() => toggleSort('deadline')} />
                <SortableHeader label="Автопрод." active={sortKey === 'autoRenew'} desc={sortDesc} onClick={() => toggleSort('autoRenew')} />
                <SortableHeader label="Сумма" active={sortKey === 'value'} desc={sortDesc} onClick={() => toggleSort('value')} />
                <SortableHeader label="Статус" active={sortKey === 'status'} desc={sortDesc} onClick={() => toggleSort('status')} align="left" />
                <SortableHeader label="Риски" active={sortKey === 'riskCount'} desc={sortDesc} onClick={() => toggleSort('riskCount')} />
                <th className="py-3 px-3 font-medium text-left">Источник</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ contract, deadline, riskCount }) => {
                const counterparty = counterpartyById.get(contract.counterpartyId)
                return (
                  <tr key={contract.id} className="border-b border-ink-800/60 last:border-0 hover:bg-ink-900/40">
                    <td className="py-3 px-5 text-ink-100 max-w-56 truncate" title={contract.title}>{contract.title}</td>
                    <td className="py-3 px-3 text-ink-300 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {counterparty?.name ?? '—'}
                        {counterparty && <CategoryBadge category={counterparty.category} />}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-ink-300 whitespace-nowrap">{CONTRACT_TYPE_LABELS[contract.type]}</td>
                    <td className="py-3 px-3 text-right text-ink-300 whitespace-nowrap">
                      {contract.endDate ? new Date(contract.endDate).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: '2-digit' }) : 'Бессрочный'}
                    </td>
                    <td className="py-3 px-3 text-right whitespace-nowrap">
                      {deadline ? (
                        <div className="flex flex-col items-end gap-1">
                          <UrgencyBadge urgency={deadline.urgency} />
                          <span className="text-[11px] text-ink-500">
                            {deadline.urgency === 'passed'
                              ? `просрочено на ${Math.abs(Math.round(deadline.daysUntilDeadline))} дн.`
                              : `осталось ${Math.round(deadline.daysUntilDeadline)} дн.`}
                          </span>
                        </div>
                      ) : (
                        <span className="text-ink-600">—</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right whitespace-nowrap">
                      <span className={cn(contract.autoRenew ? 'text-warning-500' : 'text-ink-400')}>{contract.autoRenew ? 'Да' : 'Нет'}</span>
                    </td>
                    <td className="py-3 px-3 text-right text-ink-100 font-medium whitespace-nowrap">{formatCurrency(contract.value)}</td>
                    <td className="py-3 px-3"><ContractStatusBadge status={contract.status} /></td>
                    <td className="py-3 px-3 text-right whitespace-nowrap">
                      <span className={cn(riskCount > 0 ? 'text-warning-500 font-medium' : 'text-ink-500')}>{riskCount}</span>
                    </td>
                    <td className="py-3 px-3"><SourceBadge source={contract.source} /></td>
                  </tr>
                )
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-ink-500">Нет договоров по выбранным фильтрам</td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}

function SortableHeader({
  label,
  active,
  desc,
  onClick,
  align = 'right',
}: {
  label: string
  active: boolean
  desc: boolean
  onClick: () => void
  align?: 'left' | 'right'
}) {
  return (
    <th className={cn('py-3 px-3 font-medium', align === 'right' ? 'text-right' : 'text-left')}>
      <button
        type="button"
        onClick={onClick}
        className={cn('inline-flex items-center gap-1 hover:text-ink-200 whitespace-nowrap', active ? 'text-ink-200' : 'text-ink-500')}
      >
        {label}
        <ArrowDownUp className={cn('size-3', active && desc && 'rotate-180')} />
      </button>
    </th>
  )
}
