/**
 * Базовые формулы аналитики договоров и контрагентов. Все функции — чистые, без побочных
 * эффектов. Деление на ноль / некорректные входные данные не бросают исключений и не
 * возвращают NaN — они возвращают null, а UI обязан обработать null явно (тот же приём, что
 * и в src/lib/sales/formulas.ts у AI РОП / src/lib/ops/formulas.ts у AI COO).
 */
import type { Contract, ObligationEvent, RiskClause } from '@/types/legal'

const DAY_MS = 1000 * 60 * 60 * 24

/** Количество (дробных) дней между двумя ISO-датами. Может быть отрицательным (в прошлом). */
export function daysBetweenSigned(fromISO: string, toISO: string): number {
  const from = new Date(fromISO).getTime()
  const to = new Date(toISO).getTime()
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0
  return (to - from) / DAY_MS
}

/** Количество (дробных) дней между двумя ISO-датами. Отрицательный интервал обрезается до 0. */
export function daysBetween(fromISO: string, toISO: string): number {
  return Math.max(0, daysBetweenSigned(fromISO, toISO))
}

/** Конверсия count/total в процентах. null, если знаменатель <= 0. */
export function calculateConversionRate(count: number, total: number): number | null {
  if (total <= 0) return null
  return (count / total) * 100
}

/** % изменения показателя к предыдущему значению. null, если базовое значение — 0. */
export function calculatePeriodGrowthPct(current: number, previous: number): number | null {
  if (previous === 0) return null
  return ((current - previous) / Math.abs(previous)) * 100
}

export function average(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

/** Порог «срочно» (дней до дедлайна уведомления) и «скоро» (горизонт планирования). */
export const URGENT_THRESHOLD_DAYS = 14
export const UPCOMING_THRESHOLD_DAYS = 60

export type RenewalUrgency = 'passed' | 'urgent' | 'upcoming' | 'comfortable'

export const RENEWAL_URGENCY_LABELS: Record<RenewalUrgency, string> = {
  passed: 'Срок уведомления прошёл',
  urgent: 'Срочно',
  upcoming: 'Скоро',
  comfortable: 'В норме',
}

export interface RenewalDeadline {
  contract: Contract
  /** Дата, до которой нужно уведомить о непродлении/расторжении (endDate - noticePeriod). */
  noticeDeadlineISO: string
  /** Дней до дедлайна уведомления относительно referenceISO. Отрицательно, если срок уже прошёл. */
  daysUntilDeadline: number
  urgency: RenewalUrgency
}

/**
 * Считает дедлайн уведомления о непродлении/расторжении для одного договора и его срочность.
 * null для бессрочных договоров (endDate === null) — у них нет дедлайна продления, и для уже
 * расторгнутых/истёкших договоров, для которых решение о продлении более не актуально.
 */
export function calculateRenewalDeadline(contract: Contract, referenceISO: string): RenewalDeadline | null {
  if (contract.endDate === null) return null
  if (contract.status === 'terminated' || contract.status === 'expired') return null

  const endMs = new Date(contract.endDate).getTime()
  const noticeDeadlineMs = endMs - contract.renewalNoticePeriodDays * DAY_MS
  const noticeDeadlineISO = new Date(noticeDeadlineMs).toISOString()
  const daysUntilDeadline = daysBetweenSigned(referenceISO, noticeDeadlineISO)

  let urgency: RenewalUrgency
  if (daysUntilDeadline < 0) urgency = 'passed'
  else if (daysUntilDeadline <= URGENT_THRESHOLD_DAYS) urgency = 'urgent'
  else if (daysUntilDeadline <= UPCOMING_THRESHOLD_DAYS) urgency = 'upcoming'
  else urgency = 'comfortable'

  return { contract, noticeDeadlineISO, daysUntilDeadline, urgency }
}

/** Считает дедлайны продления для всех договоров, отбрасывая те, где дедлайн неприменим (null). */
export function calculateRenewalDeadlines(contracts: Contract[], referenceISO: string): RenewalDeadline[] {
  return contracts
    .map((c) => calculateRenewalDeadline(c, referenceISO))
    .filter((d): d is RenewalDeadline => d !== null)
}

/**
 * Помечает договоры, чей дедлайн уведомления уже прошёл или наступает срочно, ранжированные
 * по стоимости — пропущенный дедлайн на крупном договоре важнее, чем на мелком (мирроринг
 * value-weighted flagStuckDeals у AI РОП).
 */
export function flagRenewalRisks(contracts: Contract[], referenceISO: string): RenewalDeadline[] {
  return calculateRenewalDeadlines(contracts, referenceISO)
    .filter((d) => d.urgency === 'passed' || d.urgency === 'urgent')
    .sort((a, b) => {
      // Просроченные — всегда выше срочных; внутри группы — по стоимости договора.
      const rank = (u: RenewalUrgency) => (u === 'passed' ? 0 : 1)
      const byUrgency = rank(a.urgency) - rank(b.urgency)
      if (byUrgency !== 0) return byUrgency
      return b.contract.value - a.contract.value
    })
}

/** Суммарная стоимость договоров, чей дедлайн уведомления уже прошёл или наступает срочно. */
export function calculateValueAtRisk(contracts: Contract[], referenceISO: string): number {
  return flagRenewalRisks(contracts, referenceISO).reduce((sum, d) => sum + d.contract.value, 0)
}

export interface CounterpartyObligationFact {
  counterpartyId: string
  /** Число событий (споры + нарушения сроков) за текущее окно наблюдения. */
  currentCount: number
  /** Число событий за предыдущее окно той же длины. */
  previousCount: number
  /** % изменения к предыдущему окну. null, если предыдущее окно было пустым. */
  changePct: number | null
  totalCount: number
}

/** Ширина окна наблюдения (дней) для тренда надёжности контрагента. */
export const RELIABILITY_WINDOW_DAYS = 90

/**
 * Считает число событий журнала обязательств (споры/нарушения сроков) по контрагенту за
 * текущее окно наблюдения и за предыдущее окно той же длины — основа для выявления
 * ухудшающегося тренда (мирроринг period-over-period conversion-drop у AI РОП).
 */
export function buildCounterpartyObligationFacts(
  events: ObligationEvent[],
  counterpartyIds: string[],
  referenceISO: string,
  windowDays: number = RELIABILITY_WINDOW_DAYS,
): CounterpartyObligationFact[] {
  const refMs = new Date(referenceISO).getTime()
  const windowMs = windowDays * DAY_MS
  const currentStart = refMs - windowMs
  const previousStart = refMs - 2 * windowMs

  return counterpartyIds.map((counterpartyId) => {
    const own = events.filter((e) => e.counterpartyId === counterpartyId)
    const currentCount = own.filter((e) => {
      const t = new Date(e.date).getTime()
      return t >= currentStart && t <= refMs
    }).length
    const previousCount = own.filter((e) => {
      const t = new Date(e.date).getTime()
      return t >= previousStart && t < currentStart
    }).length
    return {
      counterpartyId,
      currentCount,
      previousCount,
      changePct: calculatePeriodGrowthPct(currentCount, previousCount),
      totalCount: own.length,
    }
  })
}

/** Минимальный рост числа нарушений за окно, начиная с которого тренд считается «ухудшающимся». */
export const RELIABILITY_WORSENING_MIN_GROWTH_PCT = 50
/** Минимальное число событий в текущем окне, чтобы тренд не был шумом маленькой выборки. */
export const RELIABILITY_WORSENING_MIN_CURRENT_COUNT = 2

/** Контрагенты с ухудшающимся трендом надёжности — рост числа нарушений к прошлому окну. */
export function flagWorseningCounterparties(facts: CounterpartyObligationFact[]): CounterpartyObligationFact[] {
  return facts
    .filter(
      (f) =>
        f.currentCount >= RELIABILITY_WORSENING_MIN_CURRENT_COUNT &&
        f.changePct !== null &&
        f.changePct >= RELIABILITY_WORSENING_MIN_GROWTH_PCT,
    )
    .sort((a, b) => b.currentCount - a.currentCount)
}

export interface RiskClauseBreakdownItem {
  category: string
  count: number
  sharePct: number
}

/** Разбивка риск-пунктов по категориям: количество и доля от всех переданных пунктов. */
export function buildRiskClauseBreakdown(riskClauses: RiskClause[]): RiskClauseBreakdownItem[] {
  const counts = new Map<string, number>()
  for (const rc of riskClauses) {
    counts.set(rc.category, (counts.get(rc.category) ?? 0) + 1)
  }
  const total = riskClauses.length
  return [...counts.entries()]
    .map(([category, count]) => ({ category, count, sharePct: calculateConversionRate(count, total) ?? 0 }))
    .sort((a, b) => b.count - a.count)
}

/** Риск-пункты заданной серьёзности (или выше), привязанные к активным/действующим договорам. */
export function filterRiskClausesBySeverity(
  riskClauses: RiskClause[],
  severities: RiskClause['severity'][],
): RiskClause[] {
  return riskClauses.filter((rc) => severities.includes(rc.severity))
}
