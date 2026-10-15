import { generateBusinessId, generateId } from '@/lib/id'
import type {
  Contract,
  ContractType,
  Counterparty,
  CounterpartyCategory,
  LegalProfile,
  ObligationEvent,
  ObligationEventType,
  RiskClause,
  RiskClauseCategory,
  RiskClauseSeverity,
} from '@/types/legal'

export interface DemoWorkspace {
  profile: LegalProfile
  counterparties: Counterparty[]
  contracts: Contract[]
  riskClauses: RiskClause[]
  obligationEvents: ObligationEvent[]
}

/** Простой seeded PRNG (mulberry32) — стабильный демо-датасет между перезапусками/тестами. */
function createRng(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Смещение от `now` на `days` дней — отрицательное значение возвращает дату в прошлом,
 *  положительное — в будущем (в отличие от ai-rop/ai-coo daysAgoISO, здесь нужны оба направления
 *  для будущих дедлайнов продления договоров). */
function offsetDaysISO(now: Date, days: number): string {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString()
}

function dateOnly(iso: string): string {
  return iso.slice(0, 10)
}

function pick<T>(rng: () => number, items: T[]): T {
  return items[Math.floor(rng() * items.length)]
}

interface CounterpartySeed {
  key: string
  name: string
  category: CounterpartyCategory
  inn: string | null
}

const COUNTERPARTIES: CounterpartySeed[] = [
  { key: 'technosnab', name: 'ТехноСнаб', category: 'supplier', inn: '7701234567' },
  { key: 'logistex', name: 'Логистик Экспресс', category: 'supplier', inn: '7704455123' },
  { key: 'plastprom', name: 'ПластПром', category: 'supplier', inn: '7802234119' },
  { key: 'optorg', name: 'ОптТоргРитейл', category: 'client', inn: '7703321456' },
  { key: 'megastroy', name: 'Мегастрой', category: 'client', inn: '7812098765' },
  { key: 'retailug', name: 'Ритейл Юг', category: 'client', inn: '6161234578' },
  { key: 'torgset', name: 'ТоргСеть', category: 'client', inn: '7726554433' },
  { key: 'stroymontazh', name: 'СтройМонтаж', category: 'contractor', inn: '7709887766' },
  { key: 'itservicepro', name: 'ИТ-Сервис Про', category: 'contractor', inn: '7718223344' },
  { key: 'elektromontazh', name: 'ЭлектроМонтаж', category: 'contractor', inn: '7840099887' },
  { key: 'bizpark', name: 'Бизнес Парк', category: 'landlord', inn: '7705112233' },
  { key: 'officecenter', name: 'Офис Центр', category: 'landlord', inn: '7801445566' },
]

const CONTRACT_TITLE_BY_CATEGORY: Record<CounterpartyCategory, string[]> = {
  supplier: ['Поставка сырья и материалов', 'Поставка упаковочных материалов', 'Поставка комплектующих', 'Рамочный договор поставки'],
  client: ['Поставка готовой продукции', 'Дистрибуция продукции', 'Договор на регулярные отгрузки'],
  contractor: ['Строительно-монтажные работы', 'ИТ-сопровождение и поддержка', 'Электромонтажные работы', 'Ремонтные работы на объекте'],
  landlord: ['Аренда складского помещения', 'Аренда офисного помещения', 'Аренда производственного цеха'],
  other: ['Договор оказания услуг'],
}

/**
 * Демо-датасет компании «Полимер Трейд» — оптовая торговля полимерными материалами и
 * упаковкой, 12 контрагентов, ~28 договоров за последний год и ближайшие 12 месяцев вперёд.
 * Числа подобраны так, чтобы движок рекомендаций (recommendations.ts) реально находил
 * headline-историю из брифа продукта: поставщик «ТехноСнаб», чей договор автопролонгируется
 * через 9 дней при уже прошедшем 30-дневном сроке уведомления об отказе — то есть демо
 * доказывает, что правила работают, а не просто иллюстрирует UI.
 */
export function buildDemoWorkspace(now: Date = new Date()): DemoWorkspace {
  const rng = createRng(7)

  const counterparties: Counterparty[] = COUNTERPARTIES.map((seed) => ({
    id: `cp_${seed.key}`,
    name: seed.name,
    inn: seed.inn,
    category: seed.category,
    createdAt: offsetDaysISO(now, -(360 + Math.floor(rng() * 300))),
  }))
  const cpId = (key: string) => `cp_${key}`

  const contracts: Contract[] = []
  const riskClauses: RiskClause[] = []

  function addContract(input: {
    counterpartyKey: string
    title: string
    type: ContractType
    startDaysAgo: number
    endOffsetDays: number | null
    autoRenew: boolean
    renewalNoticePeriodDays: number
    value: number
    status: Contract['status']
  }): Contract {
    const contract: Contract = {
      id: generateId('contract'),
      counterpartyId: cpId(input.counterpartyKey),
      title: input.title,
      type: input.type,
      startDate: dateOnly(offsetDaysISO(now, -input.startDaysAgo)),
      endDate: input.endOffsetDays === null ? null : dateOnly(offsetDaysISO(now, input.endOffsetDays)),
      autoRenew: input.autoRenew,
      renewalNoticePeriodDays: input.renewalNoticePeriodDays,
      value: input.value,
      status: input.status,
      source: 'manual',
      createdAt: offsetDaysISO(now, -input.startDaysAgo),
    }
    contracts.push(contract)
    return contract
  }

  function addRiskClause(contract: Contract, category: RiskClauseCategory, severity: RiskClauseSeverity, description: string) {
    riskClauses.push({ id: generateId('risk'), contractId: contract.id, category, severity, description })
  }

  // --- ТехноСнаб: headline-история брифа продукта ---------------------------------------
  // Договор автопролонгируется через 9 дней; 30-дневный срок уведомления об отказе уже
  // истёк 21 день назад — ровно та ситуация, которую движок рекомендаций должен поднять
  // в топ дашборда с формулировкой, дословно совпадающей с примером из брифа.
  const technosnabMain = addContract({
    counterpartyKey: 'technosnab',
    title: 'Поставка полимерного сырья',
    type: 'supply',
    startDaysAgo: 360,
    endOffsetDays: 9,
    autoRenew: true,
    renewalNoticePeriodDays: 30,
    value: 2_400_000,
    status: 'expiring_soon',
  })
  addRiskClause(
    technosnabMain,
    'auto_renewal_no_notice',
    'critical',
    'Договор автоматически продлевается на 1 год, если ни одна из сторон не уведомит об отказе за 30 дней — уведомление о расторжении не зафиксировано.',
  )
  addRiskClause(
    technosnabMain,
    'penalty',
    'warning',
    'Пеня за просрочку оплаты 0.3% в день от суммы задолженности — выше рыночной практики (обычно 0.1%).',
  )
  // Более ранний, уже завершённый договор с ТехноСнаб — для реалистичной истории отношений.
  addContract({
    counterpartyKey: 'technosnab',
    title: 'Поставка упаковочной плёнки (годовой)',
    type: 'supply',
    startDaysAgo: 720,
    endOffsetDays: -360,
    autoRenew: false,
    renewalNoticePeriodDays: 30,
    value: 620_000,
    status: 'expired',
  })

  // --- Остальные поставщики ---------------------------------------------------------------
  const logistexMain = addContract({
    counterpartyKey: 'logistex',
    title: 'Транспортно-логистическое обслуживание',
    type: 'services',
    startDaysAgo: 200,
    endOffsetDays: 25,
    autoRenew: true,
    renewalNoticePeriodDays: 14,
    value: 980_000,
    status: 'active',
  })
  addRiskClause(logistexMain, 'unilateral_termination', 'warning', 'Контрагент может расторгнуть договор в одностороннем порядке с уведомлением за 10 дней без объяснения причин.')

  addContract({
    counterpartyKey: 'logistex',
    title: 'Разовая перевозка оборудования',
    type: 'services',
    startDaysAgo: 40,
    endOffsetDays: -10,
    autoRenew: false,
    renewalNoticePeriodDays: 0,
    value: 145_000,
    status: 'terminated',
  })

  const plastpromMain = addContract({
    counterpartyKey: 'plastprom',
    title: 'Поставка гранулята ПВД',
    type: 'supply',
    startDaysAgo: 150,
    endOffsetDays: 50,
    autoRenew: true,
    renewalNoticePeriodDays: 21,
    value: 2_250_000,
    status: 'active',
  })
  addRiskClause(plastpromMain, 'unlimited_liability', 'critical', 'В договоре отсутствует пункт об ограничении ответственности — риск неограниченных убытков при браке партии.')
  addRiskClause(plastpromMain, 'no_force_majeure', 'serious', 'Пункт о форс-мажоре сформулирован расплывчато, не покрывает перебои поставок у субподрядчиков контрагента.')

  addContract({
    counterpartyKey: 'plastprom',
    title: 'Поставка гранулята ПНД (резервная партия)',
    type: 'supply',
    startDaysAgo: 90,
    endOffsetDays: 270,
    autoRenew: false,
    renewalNoticePeriodDays: 30,
    value: 740_000,
    status: 'active',
  })

  // --- Клиенты ------------------------------------------------------------------------------
  const optorg1 = addContract({
    counterpartyKey: 'optorg',
    title: 'Дистрибуция упаковки для розничных сетей',
    type: 'supply',
    startDaysAgo: 300,
    endOffsetDays: 70,
    autoRenew: true,
    renewalNoticePeriodDays: 30,
    value: 3_400_000,
    status: 'active',
  })
  addRiskClause(optorg1, 'penalty', 'warning', 'Штраф за недопоставку объёма — 1% от суммы недопоставленной партии за каждый день, без верхнего предела.')

  addContract({
    counterpartyKey: 'optorg',
    title: 'Дополнительная поставка к сезону',
    type: 'supply',
    startDaysAgo: 60,
    endOffsetDays: -5,
    autoRenew: false,
    renewalNoticePeriodDays: 14,
    value: 410_000,
    status: 'expired',
  })

  const megastroyMain = addContract({
    counterpartyKey: 'megastroy',
    title: 'Поставка строительных полимерных материалов',
    type: 'supply',
    startDaysAgo: 400,
    endOffsetDays: 95,
    autoRenew: true,
    renewalNoticePeriodDays: 45,
    value: 5_200_000,
    status: 'active',
  })
  addRiskClause(megastroyMain, 'other', 'good', 'Предусмотрена ежеквартальная индексация цены по согласованной формуле — риск минимален, условие стандартное.')

  addContract({
    counterpartyKey: 'retailug',
    title: 'Поставка упаковочных материалов для филиалов на Юге',
    type: 'supply',
    startDaysAgo: 180,
    endOffsetDays: 48,
    autoRenew: false,
    renewalNoticePeriodDays: 30,
    value: 1_120_000,
    status: 'active',
  })

  const torgsetMain = addContract({
    counterpartyKey: 'torgset',
    title: 'Регулярные поставки в сеть магазинов',
    type: 'supply',
    startDaysAgo: 260,
    endOffsetDays: 40,
    autoRenew: true,
    renewalNoticePeriodDays: 30,
    value: 2_780_000,
    status: 'active',
  })
  addRiskClause(torgsetMain, 'unilateral_termination', 'serious', 'Контрагент вправе расторгнуть договор без штрафных санкций при задержке поставки более 3 дней — несимметрично нашим обязательствам.')

  addContract({
    counterpartyKey: 'torgset',
    title: 'Поставка сезонной линейки упаковки (прошлый сезон)',
    type: 'supply',
    startDaysAgo: 400,
    endOffsetDays: -220,
    autoRenew: false,
    renewalNoticePeriodDays: 14,
    value: 560_000,
    status: 'terminated',
  })

  // --- Подрядчики ---------------------------------------------------------------------------
  const stroyMain = addContract({
    counterpartyKey: 'stroymontazh',
    title: 'Строительно-монтажные работы на новом складе',
    type: 'works',
    startDaysAgo: 120,
    endOffsetDays: 60,
    autoRenew: false,
    renewalNoticePeriodDays: 14,
    value: 6_400_000,
    status: 'active',
  })
  addRiskClause(stroyMain, 'penalty', 'serious', 'Неустойка за нарушение сроков сдачи этапов работ — 0.5% в день без ограничения общей суммы неустойки.')

  addContract({
    counterpartyKey: 'stroymontazh',
    title: 'Ремонт фасада офисного здания',
    type: 'works',
    startDaysAgo: 500,
    endOffsetDays: -400,
    autoRenew: false,
    renewalNoticePeriodDays: 0,
    value: 1_300_000,
    status: 'expired',
  })

  const itserviceMain = addContract({
    counterpartyKey: 'itservicepro',
    title: 'ИТ-сопровождение учётной системы',
    type: 'services',
    startDaysAgo: 220,
    endOffsetDays: 45,
    autoRenew: true,
    renewalNoticePeriodDays: 30,
    value: 890_000,
    status: 'active',
  })
  addRiskClause(itserviceMain, 'unlimited_liability', 'warning', 'Ответственность подрядчика за ошибки в системе ограничена суммой одного ежемесячного платежа — несоразмерно возможным убыткам от простоя.')

  addContract({
    counterpartyKey: 'itservicepro',
    title: 'Разработка модуля электронного документооборота',
    type: 'services',
    startDaysAgo: 80,
    endOffsetDays: 160,
    autoRenew: false,
    renewalNoticePeriodDays: 30,
    value: 1_450_000,
    status: 'active',
  })

  const elektroMain = addContract({
    counterpartyKey: 'elektromontazh',
    title: 'Электромонтажные работы на производственной площадке',
    type: 'works',
    startDaysAgo: 70,
    endOffsetDays: 140,
    autoRenew: false,
    renewalNoticePeriodDays: 14,
    value: 2_100_000,
    status: 'active',
  })
  addRiskClause(elektroMain, 'no_force_majeure', 'warning', 'Форс-мажор определён узко — не покрывает перебои электроснабжения у подрядчика.')

  // --- Арендодатели ---------------------------------------------------------------------------
  const bizparkMain = addContract({
    counterpartyKey: 'bizpark',
    title: 'Аренда складского помещения, 1200 м²',
    type: 'lease',
    startDaysAgo: 540,
    endOffsetDays: 35,
    autoRenew: true,
    renewalNoticePeriodDays: 14,
    value: 4_320_000,
    status: 'active',
  })
  addRiskClause(bizparkMain, 'penalty', 'good', 'Штрафные санкции симметричны для обеих сторон — риск умеренный, типовое условие.')

  addContract({
    counterpartyKey: 'bizpark',
    title: 'Аренда парковочных мест при складе',
    type: 'lease',
    startDaysAgo: 540,
    endOffsetDays: 35,
    autoRenew: true,
    renewalNoticePeriodDays: 14,
    value: 180_000,
    status: 'active',
  })

  const officeMain = addContract({
    counterpartyKey: 'officecenter',
    title: 'Аренда офисного помещения, 340 м²',
    type: 'lease',
    startDaysAgo: 300,
    endOffsetDays: 170,
    autoRenew: true,
    renewalNoticePeriodDays: 60,
    value: 2_640_000,
    status: 'active',
  })
  addRiskClause(officeMain, 'unilateral_termination', 'serious', 'Арендодатель вправе расторгнуть договор в одностороннем порядке с уведомлением за 14 дней, в том числе без нарушения со стороны арендатора.')

  addContract({
    counterpartyKey: 'officecenter',
    title: 'Аренда переговорной комнаты (почасовая)',
    type: 'lease',
    startDaysAgo: 30,
    endOffsetDays: 335,
    autoRenew: false,
    renewalNoticePeriodDays: 7,
    value: 95_000,
    status: 'active',
  })

  // --- Дополнительные договоры для реалистичного объёма портфеля (разные статусы/типы) -----
  const extraTemplates: Array<{
    counterpartyKey: string
    type: ContractType
    startDaysAgo: number
    endOffsetDays: number | null
    autoRenew: boolean
    noticeDays: number
    status: Contract['status']
  }> = [
    { counterpartyKey: 'megastroy', type: 'nda', startDaysAgo: 150, endOffsetDays: null, autoRenew: false, noticeDays: 0, status: 'active' },
    { counterpartyKey: 'retailug', type: 'nda', startDaysAgo: 90, endOffsetDays: null, autoRenew: false, noticeDays: 0, status: 'active' },
    { counterpartyKey: 'logistex', type: 'nda', startDaysAgo: 200, endOffsetDays: null, autoRenew: false, noticeDays: 0, status: 'active' },
    { counterpartyKey: 'optorg', type: 'services', startDaysAgo: 30, endOffsetDays: 215, autoRenew: false, noticeDays: 30, status: 'active' },
    { counterpartyKey: 'torgset', type: 'services', startDaysAgo: 15, endOffsetDays: 345, autoRenew: true, noticeDays: 30, status: 'active' },
    { counterpartyKey: 'stroymontazh', type: 'works', startDaysAgo: 10, endOffsetDays: 110, autoRenew: false, noticeDays: 14, status: 'active' },
    { counterpartyKey: 'plastprom', type: 'supply', startDaysAgo: 5, endOffsetDays: 175, autoRenew: false, noticeDays: 21, status: 'active' },
  ]
  for (const t of extraTemplates) {
    const seed = COUNTERPARTIES.find((c) => c.key === t.counterpartyKey)!
    addContract({
      counterpartyKey: t.counterpartyKey,
      title: pick(rng, CONTRACT_TITLE_BY_CATEGORY[seed.category]),
      type: t.type,
      startDaysAgo: t.startDaysAgo,
      endOffsetDays: t.endOffsetDays,
      autoRenew: t.autoRenew,
      renewalNoticePeriodDays: t.noticeDays,
      value: 120_000 + Math.floor(rng() * 1_600_000),
      status: t.status,
    })
  }

  // --- Журнал обязательств: споры и нарушения сроков по контрагентам ------------------------
  // ОптТоргРитейл — явный ухудшающийся тренд: мало нарушений в прошлом 90-дневном окне,
  // заметный рост в последнем — движок рекомендаций (flagWorseningCounterparties) должен
  // поднять этот контрагент в список.
  const obligationEvents: ObligationEvent[] = []
  function addEvent(counterpartyKey: string, daysAgo: number, type: ObligationEventType, description: string, contractId: string | null = null) {
    obligationEvents.push({
      id: generateId('obligation'),
      counterpartyId: cpId(counterpartyKey),
      contractId,
      date: dateOnly(offsetDaysISO(now, -daysAgo)),
      type,
      description,
    })
  }

  // Предыдущее 90-дневное окно (91-180 дней назад): 1 нарушение.
  addEvent('optorg', 160, 'missed_deadline', 'Задержка оплаты на 6 дней по счёту за июньскую партию.')
  // Текущее 90-дневное окно (0-90 дней назад): 3 события — рост более чем в 2 раза.
  addEvent('optorg', 75, 'missed_deadline', 'Задержка приёмки партии на складе на 4 дня, повлекла простой транспорта.')
  addEvent('optorg', 40, 'dispute', 'Претензия по качеству партии упаковки — направлена рекламация, спор не урегулирован.')
  addEvent('optorg', 12, 'missed_deadline', 'Повторная задержка оплаты, уже на 9 дней сверх срока по договору.')

  // СтройМонтаж — стабильный (не ухудшающийся) уровень нарушений в обоих окнах.
  addEvent('stroymontazh', 150, 'missed_deadline', 'Срыв промежуточного срока по этапу фундамента на 5 дней.', stroyMain.id)
  addEvent('stroymontazh', 30, 'missed_deadline', 'Срыв срока поставки материалов субподрядчиком на 3 дня.', stroyMain.id)

  // Логистик Экспресс — единичный случай, недостаточно для тренда.
  addEvent('logistex', 20, 'dispute', 'Претензия по повреждению груза при транспортировке — на урегулировании.')

  // ТехноСнаб — одно нарушение в прошлом, напоминание о истории отношений (не образует тренд).
  addEvent('technosnab', 200, 'missed_deadline', 'Просрочка поставки партии сырья на 7 дней.', technosnabMain.id)

  const profile: LegalProfile = {
    id: generateBusinessId(),
    companyName: 'Полимер Трейд',
    businessType: 'manufacturing',
    createdAt: new Date().toISOString(),
  }

  return { profile, counterparties, contracts, riskClauses, obligationEvents }
}
