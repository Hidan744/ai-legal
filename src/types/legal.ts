/** Категория контрагента — фиксированный набор, тот же для всех договоров. */
export type CounterpartyCategory = 'supplier' | 'client' | 'contractor' | 'landlord' | 'other'

export const COUNTERPARTY_CATEGORY_LABELS: Record<CounterpartyCategory, string> = {
  supplier: 'Поставщик',
  client: 'Клиент',
  contractor: 'Подрядчик',
  landlord: 'Арендодатель',
  other: 'Другое',
}

export interface Counterparty {
  id: string
  name: string
  /** Косметический ИНН-подобный идентификатор — не валидируется, только для правдоподобия демо. */
  inn: string | null
  category: CounterpartyCategory
  createdAt: string
}

/** Тип договора — фиксированный набор (бриф продукта). */
export type ContractType = 'supply' | 'lease' | 'services' | 'works' | 'nda' | 'employment' | 'other'

export const CONTRACT_TYPE_LABELS: Record<ContractType, string> = {
  supply: 'Поставка',
  lease: 'Аренда',
  services: 'Услуги',
  works: 'Подряд',
  nda: 'NDA',
  employment: 'Трудовой',
  other: 'Другое',
}

export type ContractStatus = 'active' | 'expiring_soon' | 'expired' | 'terminated'

export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  active: 'Действует',
  expiring_soon: 'Скоро истекает',
  expired: 'Истёк',
  terminated: 'Расторгнут',
}

/** Источник записи о договоре — у этого продукта нет «CRM»-аналога, поэтому концепция
 *  облегчена до двух значений: вручную занесён в демо или загружен через CSV. */
export type ContractSource = 'manual' | 'csv'

export const CONTRACT_SOURCE_LABELS: Record<ContractSource, string> = {
  manual: 'Вручную',
  csv: 'CSV',
}

/** Фиксированный набор категорий риск-пунктов (бриф продукта) — позволяет агрегировать
 *  риски в разбивку по категориям, а не хранить свободный текст. */
export type RiskClauseCategory =
  | 'penalty'
  | 'unilateral_termination'
  | 'unlimited_liability'
  | 'auto_renewal_no_notice'
  | 'no_force_majeure'
  | 'other'

export const RISK_CLAUSE_CATEGORY_LABELS: Record<RiskClauseCategory, string> = {
  penalty: 'Штрафные санкции',
  unilateral_termination: 'Одностороннее расторжение',
  unlimited_liability: 'Ответственность не ограничена',
  auto_renewal_no_notice: 'Автопролонгация без уведомления',
  no_force_majeure: 'Нет форс-мажора',
  other: 'Другое',
}

/** Серьёзность риск-пункта — переиспользует фиксированный STATUS-набор (chartColors.ts):
 *  good/warning/serious/critical, зарезервированный под состояние, а не категорию. */
export type RiskClauseSeverity = 'good' | 'warning' | 'serious' | 'critical'

export const RISK_CLAUSE_SEVERITY_LABELS: Record<RiskClauseSeverity, string> = {
  good: 'Незначительный',
  warning: 'Требует внимания',
  serious: 'Серьёзный',
  critical: 'Критический',
}

export interface RiskClause {
  id: string
  contractId: string
  category: RiskClauseCategory
  severity: RiskClauseSeverity
  description: string
}

export interface Contract {
  id: string
  counterpartyId: string
  title: string
  type: ContractType
  startDate: string
  /** null — договор бессрочный (нет даты окончания и, следовательно, дедлайна продления). */
  endDate: string | null
  autoRenew: boolean
  /** Сколько дней до endDate нужно уведомить о непродлении/расторжении. */
  renewalNoticePeriodDays: number
  value: number
  status: ContractStatus
  source: ContractSource
  createdAt: string
}

/** Тип события в лёгком журнале обязательств — основа для счёта «нарушений» по контрагенту. */
export type ObligationEventType = 'dispute' | 'missed_deadline'

export const OBLIGATION_EVENT_TYPE_LABELS: Record<ObligationEventType, string> = {
  dispute: 'Спор/претензия',
  missed_deadline: 'Нарушение срока контрагентом',
}

/** Лёгкий журнал обязательств/событий по контрагенту — не полноценный документооборот,
 *  только то, что нужно для расчёта надёжности контрагента (мирроринг ActivityLogEntry у ai-rop). */
export interface ObligationEvent {
  id: string
  counterpartyId: string
  contractId: string | null
  /** YYYY-MM-DD */
  date: string
  type: ObligationEventType
  description: string
}

export type BusinessType = 'retail' | 'manufacturing' | 'services' | 'it' | 'construction' | 'other'

export const BUSINESS_TYPE_LABELS: Record<BusinessType, string> = {
  retail: 'Розничная торговля',
  manufacturing: 'Производство',
  services: 'Услуги',
  it: 'IT',
  construction: 'Строительство',
  other: 'Другое',
}

export interface LegalProfile {
  id: string
  companyName: string
  businessType: BusinessType
  createdAt: string
}
