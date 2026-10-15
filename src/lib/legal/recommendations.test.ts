import { describe, expect, it } from 'vitest'
import type { Contract, Counterparty, ObligationEvent, RiskClause } from '@/types/legal'
import { buildAutoRenewPassedSentence, buildRecommendations, pluralizeDays } from './recommendations'

describe('pluralizeDays', () => {
  it('declines день/дня/дней correctly', () => {
    expect(pluralizeDays(1)).toBe('день')
    expect(pluralizeDays(2)).toBe('дня')
    expect(pluralizeDays(4)).toBe('дня')
    expect(pluralizeDays(5)).toBe('дней')
    expect(pluralizeDays(11)).toBe('дней')
    expect(pluralizeDays(21)).toBe('день')
  })
})

describe('buildAutoRenewPassedSentence', () => {
  it('matches the product brief example verbatim', () => {
    const sentence = buildAutoRenewPassedSentence({
      categoryLabel: 'поставщиком',
      counterpartyName: 'ТехноСнаб',
      daysUntilEnd: 9,
      noticePeriodDays: 30,
    })
    expect(sentence).toBe(
      'Договор с поставщиком «ТехноСнаб» автопролонгируется через 9 дней, срок уведомления об отказе (30 дней) уже прошёл. Рекомендую срочно направить уведомление об отказе от продления или начать переговоры о новых условиях.',
    )
  })
})

function makeCounterparty(overrides: Partial<Counterparty> = {}): Counterparty {
  return { id: 'cp1', name: 'ТехноСнаб', inn: null, category: 'supplier', createdAt: '2026-01-01T00:00:00.000Z', ...overrides }
}

function makeContract(overrides: Partial<Contract> = {}): Contract {
  return {
    id: 'c1',
    counterpartyId: 'cp1',
    title: 'Поставка сырья',
    type: 'supply',
    startDate: '2026-01-01',
    endDate: '2026-10-24',
    autoRenew: true,
    renewalNoticePeriodDays: 30,
    value: 1_850_000,
    status: 'expiring_soon',
    source: 'manual',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('buildRecommendations', () => {
  const reference = '2026-10-15T00:00:00.000Z'

  it('generates the headline renewal recommendation for a passed-deadline auto-renew contract', () => {
    const counterparties = [makeCounterparty()]
    const contracts = [makeContract()]
    const recs = buildRecommendations(contracts, counterparties, [], [], reference)
    expect(recs).toHaveLength(1)
    expect(recs[0].type).toBe('renewal_deadline')
    expect(recs[0].severity).toBe('critical')
    expect(recs[0].sentence).toContain('ТехноСнаб')
    expect(recs[0].sentence).toContain('автопролонгируется через 9 дней')
  })

  it('ranks critical above warning, and within the same severity by contract value', () => {
    const counterparties = [makeCounterparty({ id: 'cp1', name: 'А' }), makeCounterparty({ id: 'cp2', name: 'Б' })]
    const contracts = [
      makeContract({ id: 'passed-small', counterpartyId: 'cp1', endDate: '2026-10-20', value: 100_000 }),
      makeContract({ id: 'passed-big', counterpartyId: 'cp2', endDate: '2026-10-22', value: 5_000_000 }),
      makeContract({ id: 'urgent', counterpartyId: 'cp1', endDate: '2026-10-28', renewalNoticePeriodDays: 10, value: 9_000_000 }),
    ]
    const recs = buildRecommendations(contracts, counterparties, [], [], reference)
    expect(recs.map((r) => r.contractId)).toEqual(['passed-big', 'passed-small', 'urgent'])
  })

  it('generates a reliability recommendation for a counterparty with a worsening dispute trend', () => {
    const counterparties = [makeCounterparty({ id: 'cp1', name: 'ОптТоргРитейл', category: 'client' })]
    const contracts = [makeContract({ counterpartyId: 'cp1', endDate: '2027-06-01', status: 'active' })]
    const events: ObligationEvent[] = [
      { id: 'e1', counterpartyId: 'cp1', contractId: null, date: '2026-05-01', type: 'missed_deadline', description: 'x' },
      { id: 'e2', counterpartyId: 'cp1', contractId: null, date: '2026-09-01', type: 'missed_deadline', description: 'x' },
      { id: 'e3', counterpartyId: 'cp1', contractId: null, date: '2026-09-15', type: 'dispute', description: 'x' },
    ]
    const recs = buildRecommendations(contracts, counterparties, [], events, reference)
    const reliabilityRec = recs.find((r) => r.type === 'counterparty_reliability')
    expect(reliabilityRec).toBeDefined()
    expect(reliabilityRec!.sentence).toContain('ОптТоргРитейл')
  })

  it('generates a risk-clause recommendation for a critical clause on an active contract', () => {
    const counterparties = [makeCounterparty()]
    const contracts = [makeContract({ endDate: '2027-06-01', status: 'active', autoRenew: false })]
    const riskClauses: RiskClause[] = [
      { id: 'r1', contractId: 'c1', category: 'unlimited_liability', severity: 'critical', description: 'Нет ограничения ответственности.' },
    ]
    const recs = buildRecommendations(contracts, counterparties, riskClauses, [], reference)
    const riskRec = recs.find((r) => r.type === 'risk_clause')
    expect(riskRec).toBeDefined()
    expect(riskRec!.severity).toBe('critical')
    expect(riskRec!.sentence).toContain('критический риск-пункт')
  })

  it('does not generate a risk-clause recommendation for terminated/expired contracts', () => {
    const counterparties = [makeCounterparty()]
    const contracts = [makeContract({ endDate: '2026-01-01', status: 'terminated', autoRenew: false })]
    const riskClauses: RiskClause[] = [
      { id: 'r1', contractId: 'c1', category: 'unlimited_liability', severity: 'critical', description: 'x' },
    ]
    const recs = buildRecommendations(contracts, counterparties, riskClauses, [], reference)
    expect(recs.find((r) => r.type === 'risk_clause')).toBeUndefined()
  })
})
