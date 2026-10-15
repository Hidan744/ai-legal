/**
 * Правило-based движок рекомендаций — детерминированный и объяснимый (НЕ вызов LLM в этой
 * фазе), по аналогии с src/lib/sales/recommendations.ts у AI РОП и
 * src/lib/marketing/recommendations.ts у AI CMO.
 *
 * Архитектура нарочно повторяет тот же приём: сначала чистыми функциями считаются факты
 * (formulas.ts), и только потом факты превращаются в предложения на естественном языке
 * шаблонными функциями здесь. Это оставляет возможность в будущей фазе заменить
 * buildRecommendations на вызов реальной LLM, передав ей те же факты, без переписывания
 * остального кода.
 */
import type { Contract, Counterparty, CounterpartyCategory, ObligationEvent, RiskClause } from '@/types/legal'
import { COUNTERPARTY_CATEGORY_LABELS, RISK_CLAUSE_CATEGORY_LABELS } from '@/types/legal'

/** Категория контрагента в творительном падеже («с поставщиком», «с клиентом») — нужна для
 *  грамматически верных предложений-рекомендаций; винительный/именительный падеж из
 *  COUNTERPARTY_CATEGORY_LABELS сюда не подходит («с поставщик» звучит неграмотно). */
const COUNTERPARTY_CATEGORY_INSTRUMENTAL: Record<CounterpartyCategory, string> = {
  supplier: 'поставщиком',
  client: 'клиентом',
  contractor: 'подрядчиком',
  landlord: 'арендодателем',
  other: 'контрагентом',
}

function instrumentalLabel(category: CounterpartyCategory | undefined): string {
  return category ? COUNTERPARTY_CATEGORY_INSTRUMENTAL[category] : 'контрагентом'
}
import { formatCurrency } from '@/lib/utils'
import {
  buildCounterpartyObligationFacts,
  calculatePeriodGrowthPct,
  flagRenewalRisks,
  flagWorseningCounterparties,
  type RenewalDeadline,
  type CounterpartyObligationFact,
} from './formulas'

export type RecommendationSeverity = 'critical' | 'warning' | 'info'
export type RecommendationType = 'renewal_deadline' | 'counterparty_reliability' | 'risk_clause'

export interface Recommendation {
  id: string
  type: RecommendationType
  severity: RecommendationSeverity
  counterpartyId: string | null
  counterpartyName: string | null
  contractId: string | null
  value: number | null
  sentence: string
}

/** «день/дня/дней» — склонение по числительному (стандартное правило ru). */
export function pluralizeDays(n: number): string {
  const abs = Math.abs(Math.round(n))
  const mod10 = abs % 10
  const mod100 = abs % 100
  if (mod100 >= 11 && mod100 <= 14) return 'дней'
  if (mod10 === 1) return 'день'
  if (mod10 >= 2 && mod10 <= 4) return 'дня'
  return 'дней'
}

function daysPhrase(n: number): string {
  return `${Math.abs(Math.round(n))} ${pluralizeDays(n)}`
}

/**
 * Шаблон для договора, автопролонгация которого продолжается, а срок уведомления об отказе
 * уже прошёл — точная структура примера из брифа продукта: «Договор с поставщиком «ТехноСнаб»
 * автопролонгируется через 9 дней, срок уведомления об отказе (30 дней) уже прошёл.
 * Рекомендую срочно направить уведомление об отказе от продления или начать переговоры о
 * новых условиях.»
 */
export function buildAutoRenewPassedSentence(input: {
  categoryLabel: string
  counterpartyName: string
  daysUntilEnd: number
  noticePeriodDays: number
}): string {
  return `Договор с ${input.categoryLabel} «${input.counterpartyName}» автопролонгируется через ${daysPhrase(input.daysUntilEnd)}, срок уведомления об отказе (${input.noticePeriodDays} ${pluralizeDays(input.noticePeriodDays)}) уже прошёл. Рекомендую срочно направить уведомление об отказе от продления или начать переговоры о новых условиях.`
}

/** Тот же случай, но договор не продлевается автоматически — риск, что он просто прекратится. */
export function buildManualRenewalPassedSentence(input: {
  categoryLabel: string
  counterpartyName: string
  contractTitle: string
  daysUntilEnd: number
  noticePeriodDays: number
}): string {
  return `Договор «${input.contractTitle}» с ${input.categoryLabel} «${input.counterpartyName}» завершается через ${daysPhrase(input.daysUntilEnd)}, срок уведомления о продлении/расторжении (${input.noticePeriodDays} ${pluralizeDays(input.noticePeriodDays)}) уже прошёл. Рекомендую срочно согласовать дальнейшие действия по договору, чтобы не остаться без контракта или не продлить его на невыгодных условиях.`
}

/** Дедлайн уведомления ещё не прошёл, но приближается (<= URGENT_THRESHOLD_DAYS). */
export function buildUrgentRenewalSentence(input: {
  categoryLabel: string
  counterpartyName: string
  daysUntilDeadline: number
  noticePeriodDays: number
}): string {
  return `Договор с ${input.categoryLabel} «${input.counterpartyName}» требует решения по продлению: до истечения срока уведомления (${input.noticePeriodDays} ${pluralizeDays(input.noticePeriodDays)}) осталось ${daysPhrase(input.daysUntilDeadline)}. Рекомендую направить уведомление об отказе от продления или начать переговоры о новых условиях в ближайшие дни.`
}

export function buildCounterpartyReliabilitySentence(input: {
  categoryLabel: string
  counterpartyName: string
  currentCount: number
  previousCount: number
  changePct: number
  windowDays: number
}): string {
  return `Контрагент «${input.counterpartyName}» (${input.categoryLabel.toLowerCase()}) — рост числа споров и нарушений сроков за последние ${input.windowDays} дней: ${input.currentCount} против ${input.previousCount} в прошлом периоде (+${Math.round(input.changePct)}%). Рекомендую проверить договорные условия с этим контрагентом и, при повторении, пересмотреть сотрудничество.`
}

export function buildRiskClauseSentence(input: {
  contractTitle: string
  categoryLabel: string
  counterpartyName: string
  riskCategoryLabel: string
  description: string
}): string {
  return `Договор «${input.contractTitle}» с ${input.categoryLabel} «${input.counterpartyName}» содержит критический риск-пункт «${input.riskCategoryLabel}»: ${input.description}. Рекомендую направить договор на юридическую проверку перед продлением или подписанием новой редакции.`
}

function severityForRenewal(deadline: RenewalDeadline): RecommendationSeverity {
  return deadline.urgency === 'passed' ? 'critical' : 'warning'
}

function buildRenewalRecommendation(
  deadline: RenewalDeadline,
  counterpartyById: Map<string, Counterparty>,
): Recommendation {
  const contract = deadline.contract
  const counterparty = counterpartyById.get(contract.counterpartyId)
  const counterpartyName = counterparty?.name ?? 'Неизвестный контрагент'
  const categoryLabel = instrumentalLabel(counterparty?.category)
  // daysUntilEnd (reference → endDate) = daysUntilDeadline (reference → noticeDeadline) +
  // renewalNoticePeriodDays (noticeDeadline → endDate) — derived from already-computed facts,
  // never recomputed against the real wall-clock `now` (which would drift from `referenceISO`).
  const daysUntilEnd = Math.round(deadline.daysUntilDeadline + contract.renewalNoticePeriodDays)

  let sentence: string
  if (deadline.urgency === 'passed' && contract.autoRenew) {
    sentence = buildAutoRenewPassedSentence({
      categoryLabel,
      counterpartyName,
      daysUntilEnd,
      noticePeriodDays: contract.renewalNoticePeriodDays,
    })
  } else if (deadline.urgency === 'passed') {
    sentence = buildManualRenewalPassedSentence({
      categoryLabel,
      counterpartyName,
      contractTitle: contract.title,
      daysUntilEnd,
      noticePeriodDays: contract.renewalNoticePeriodDays,
    })
  } else {
    sentence = buildUrgentRenewalSentence({
      categoryLabel,
      counterpartyName,
      daysUntilDeadline: deadline.daysUntilDeadline,
      noticePeriodDays: contract.renewalNoticePeriodDays,
    })
  }

  return {
    id: `renewal_${contract.id}`,
    type: 'renewal_deadline',
    severity: severityForRenewal(deadline),
    counterpartyId: contract.counterpartyId,
    counterpartyName,
    contractId: contract.id,
    value: contract.value,
    sentence,
  }
}

function buildReliabilityRecommendation(
  fact: CounterpartyObligationFact,
  counterpartyById: Map<string, Counterparty>,
): Recommendation {
  const counterparty = counterpartyById.get(fact.counterpartyId)
  const counterpartyName = counterparty?.name ?? 'Неизвестный контрагент'
  const categoryLabel = counterparty ? COUNTERPARTY_CATEGORY_LABELS[counterparty.category] : 'контрагент'
  const changePct = fact.changePct ?? 0
  return {
    id: `reliability_${fact.counterpartyId}`,
    type: 'counterparty_reliability',
    severity: changePct >= 100 ? 'critical' : 'warning',
    counterpartyId: fact.counterpartyId,
    counterpartyName,
    contractId: null,
    value: null,
    sentence: buildCounterpartyReliabilitySentence({
      categoryLabel,
      counterpartyName,
      currentCount: fact.currentCount,
      previousCount: fact.previousCount,
      changePct,
      windowDays: 90,
    }),
  }
}

function buildRiskClauseRecommendation(
  clause: RiskClause,
  contractById: Map<string, Contract>,
  counterpartyById: Map<string, Counterparty>,
): Recommendation | null {
  const contract = contractById.get(clause.contractId)
  if (!contract) return null
  const counterparty = counterpartyById.get(contract.counterpartyId)
  const counterpartyName = counterparty?.name ?? 'Неизвестный контрагент'
  const categoryLabel = instrumentalLabel(counterparty?.category)
  return {
    id: `risk_clause_${clause.id}`,
    type: 'risk_clause',
    severity: 'critical',
    counterpartyId: contract.counterpartyId,
    counterpartyName,
    contractId: contract.id,
    value: contract.value,
    sentence: buildRiskClauseSentence({
      contractTitle: contract.title,
      categoryLabel,
      counterpartyName,
      riskCategoryLabel: RISK_CLAUSE_CATEGORY_LABELS[clause.category],
      description: clause.description,
    }),
  }
}

/**
 * Строит ранжированный список рекомендаций: критичные — первыми, затем по масштабу влияния
 * (сумма затронутого договора). Детерминированный набор правил, без обращения к LLM — см.
 * комментарий в шапке файла.
 */
export function buildRecommendations(
  contracts: Contract[],
  counterparties: Counterparty[],
  riskClauses: RiskClause[],
  obligationEvents: ObligationEvent[],
  referenceISO: string = new Date().toISOString(),
): Recommendation[] {
  const counterpartyById = new Map(counterparties.map((c) => [c.id, c]))
  const contractById = new Map(contracts.map((c) => [c.id, c]))
  const recommendations: Recommendation[] = []

  // 1) Дедлайны продления/расторжения — просроченные и срочные.
  const renewalRisks = flagRenewalRisks(contracts, referenceISO)
  for (const deadline of renewalRisks) {
    recommendations.push(buildRenewalRecommendation(deadline, counterpartyById))
  }

  // 2) Контрагенты с ухудшающимся трендом надёжности (споры/нарушения сроков).
  const activeContracts = contracts.filter((c) => c.status !== 'terminated')
  const counterpartyIdsWithActiveContracts = [...new Set(activeContracts.map((c) => c.counterpartyId))]
  const obligationFacts = buildCounterpartyObligationFacts(obligationEvents, counterpartyIdsWithActiveContracts, referenceISO)
  const worsening = flagWorseningCounterparties(obligationFacts)
  for (const fact of worsening) {
    recommendations.push(buildReliabilityRecommendation(fact, counterpartyById))
  }

  // 3) Договоры с критическими риск-пунктами, привязанными к действующим договорам.
  const criticalClauses = riskClauses.filter((rc) => rc.severity === 'critical')
  for (const clause of criticalClauses) {
    const contract = contractById.get(clause.contractId)
    if (!contract || contract.status === 'terminated' || contract.status === 'expired') continue
    const rec = buildRiskClauseRecommendation(clause, contractById, counterpartyById)
    if (rec) recommendations.push(rec)
  }

  const severityRank: Record<RecommendationSeverity, number> = { critical: 0, warning: 1, info: 2 }
  return recommendations.sort((a, b) => {
    const bySeverity = severityRank[a.severity] - severityRank[b.severity]
    if (bySeverity !== 0) return bySeverity
    return (b.value ?? 0) - (a.value ?? 0)
  })
}

// Переэкспорт для удобства вызывающего кода (используется и formulas-уровнем, и UI).
export { calculatePeriodGrowthPct, formatCurrency }
