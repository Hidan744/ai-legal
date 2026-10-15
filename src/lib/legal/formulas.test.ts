import { describe, expect, it } from 'vitest'
import type { Contract, ObligationEvent, RiskClause } from '@/types/legal'
import {
  average,
  buildCounterpartyObligationFacts,
  buildRiskClauseBreakdown,
  calculateConversionRate,
  calculatePeriodGrowthPct,
  calculateRenewalDeadline,
  calculateRenewalDeadlines,
  calculateValueAtRisk,
  daysBetween,
  daysBetweenSigned,
  filterRiskClausesBySeverity,
  flagRenewalRisks,
  flagWorseningCounterparties,
} from './formulas'

function makeContract(overrides: Partial<Contract> = {}): Contract {
  return {
    id: 'c1',
    counterpartyId: 'cp1',
    title: 'Тестовый договор',
    type: 'supply',
    startDate: '2026-01-01',
    endDate: '2027-01-01',
    autoRenew: true,
    renewalNoticePeriodDays: 30,
    value: 1_000_000,
    status: 'active',
    source: 'manual',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('daysBetween / daysBetweenSigned', () => {
  it('computes whole days between two ISO dates', () => {
    expect(daysBetween('2026-09-01T00:00:00.000Z', '2026-09-05T00:00:00.000Z')).toBe(4)
  })
  it('clamps negative intervals to 0 for daysBetween', () => {
    expect(daysBetween('2026-09-05T00:00:00.000Z', '2026-09-01T00:00:00.000Z')).toBe(0)
  })
  it('keeps the sign for daysBetweenSigned', () => {
    expect(daysBetweenSigned('2026-09-05T00:00:00.000Z', '2026-09-01T00:00:00.000Z')).toBe(-4)
  })
})

describe('calculateConversionRate / calculatePeriodGrowthPct / average', () => {
  it('computes count/total as a percentage', () => {
    expect(calculateConversionRate(25, 100)).toBe(25)
  })
  it('returns null when total is 0', () => {
    expect(calculateConversionRate(0, 0)).toBeNull()
  })
  it('computes % change vs previous value', () => {
    expect(calculatePeriodGrowthPct(80, 100)).toBe(-20)
  })
  it('returns null when previous is 0', () => {
    expect(calculatePeriodGrowthPct(10, 0)).toBeNull()
  })
  it('computes average, null for empty', () => {
    expect(average([1, 2, 3])).toBe(2)
    expect(average([])).toBeNull()
  })
})

describe('calculateRenewalDeadline', () => {
  it('matches the product brief example: auto-renews in 9 days, 30-day notice already passed', () => {
    const reference = '2026-10-15T00:00:00.000Z'
    const contract = makeContract({
      endDate: '2026-10-24', // 9 days from reference
      renewalNoticePeriodDays: 30,
      autoRenew: true,
      status: 'expiring_soon',
    })
    const deadline = calculateRenewalDeadline(contract, reference)
    expect(deadline).not.toBeNull()
    expect(deadline!.urgency).toBe('passed')
    expect(Math.round(deadline!.daysUntilDeadline)).toBe(-21)
  })

  it('returns null for indefinite contracts (no end date)', () => {
    const contract = makeContract({ endDate: null })
    expect(calculateRenewalDeadline(contract, '2026-10-15T00:00:00.000Z')).toBeNull()
  })

  it('returns null for terminated or expired contracts', () => {
    const terminated = makeContract({ status: 'terminated' })
    const expired = makeContract({ status: 'expired' })
    expect(calculateRenewalDeadline(terminated, '2026-10-15T00:00:00.000Z')).toBeNull()
    expect(calculateRenewalDeadline(expired, '2026-10-15T00:00:00.000Z')).toBeNull()
  })

  it('classifies urgency tiers correctly', () => {
    const reference = '2026-01-01T00:00:00.000Z'
    const urgent = calculateRenewalDeadline(makeContract({ endDate: '2026-01-20', renewalNoticePeriodDays: 14 }), reference)
    const upcoming = calculateRenewalDeadline(makeContract({ endDate: '2026-03-01', renewalNoticePeriodDays: 14 }), reference)
    const comfortable = calculateRenewalDeadline(makeContract({ endDate: '2027-01-01', renewalNoticePeriodDays: 14 }), reference)
    expect(urgent!.urgency).toBe('urgent')
    expect(upcoming!.urgency).toBe('upcoming')
    expect(comfortable!.urgency).toBe('comfortable')
  })
})

describe('calculateRenewalDeadlines / flagRenewalRisks / calculateValueAtRisk', () => {
  const reference = '2026-10-15T00:00:00.000Z'
  const contracts = [
    makeContract({ id: 'passed-big', endDate: '2026-10-24', renewalNoticePeriodDays: 30, value: 2_000_000 }),
    makeContract({ id: 'passed-small', endDate: '2026-10-20', renewalNoticePeriodDays: 30, value: 100_000 }),
    makeContract({ id: 'urgent', endDate: '2026-10-28', renewalNoticePeriodDays: 10, value: 500_000 }),
    makeContract({ id: 'comfortable', endDate: '2027-06-01', renewalNoticePeriodDays: 30, value: 900_000 }),
    makeContract({ id: 'indefinite', endDate: null, value: 300_000 }),
  ]

  it('filters out indefinite contracts from deadline list', () => {
    expect(calculateRenewalDeadlines(contracts, reference)).toHaveLength(4)
  })

  it('flags only passed/urgent deadlines, ranked by passed-first then value desc', () => {
    const flags = flagRenewalRisks(contracts, reference)
    expect(flags.map((f) => f.contract.id)).toEqual(['passed-big', 'passed-small', 'urgent'])
  })

  it('sums value only across flagged (passed/urgent) contracts', () => {
    expect(calculateValueAtRisk(contracts, reference)).toBe(2_000_000 + 100_000 + 500_000)
  })
})

describe('buildCounterpartyObligationFacts / flagWorseningCounterparties', () => {
  const reference = '2026-10-15T00:00:00.000Z'
  function makeEvent(overrides: Partial<ObligationEvent>): ObligationEvent {
    return { id: 'e1', counterpartyId: 'cp1', contractId: null, date: '2026-10-01', type: 'dispute', description: '', ...overrides }
  }

  it('counts events in current vs previous window and computes growth', () => {
    const events = [
      makeEvent({ id: 'e1', date: '2026-09-01' }), // ~44 days ago → current window
      makeEvent({ id: 'e2', date: '2026-09-15' }), // current window
      makeEvent({ id: 'e3', date: '2026-05-01' }), // previous window
    ]
    const facts = buildCounterpartyObligationFacts(events, ['cp1'], reference, 90)
    expect(facts[0].currentCount).toBe(2)
    expect(facts[0].previousCount).toBe(1)
    expect(facts[0].changePct).toBe(100)
  })

  it('flags counterparties with current count >= min and growth >= threshold', () => {
    const facts = [
      { counterpartyId: 'a', currentCount: 3, previousCount: 1, changePct: 200, totalCount: 4 },
      { counterpartyId: 'b', currentCount: 1, previousCount: 0, changePct: null, totalCount: 1 },
      { counterpartyId: 'c', currentCount: 2, previousCount: 2, changePct: 0, totalCount: 4 },
    ]
    const worsening = flagWorseningCounterparties(facts)
    expect(worsening.map((f) => f.counterpartyId)).toEqual(['a'])
  })
})

describe('buildRiskClauseBreakdown / filterRiskClausesBySeverity', () => {
  function makeClause(overrides: Partial<RiskClause>): RiskClause {
    return { id: 'r1', contractId: 'c1', category: 'penalty', severity: 'warning', description: '', ...overrides }
  }

  it('counts and computes share per category, sorted descending', () => {
    const clauses = [
      makeClause({ id: '1', category: 'penalty' }),
      makeClause({ id: '2', category: 'penalty' }),
      makeClause({ id: '3', category: 'no_force_majeure' }),
    ]
    const breakdown = buildRiskClauseBreakdown(clauses)
    expect(breakdown[0]).toMatchObject({ category: 'penalty', count: 2 })
    expect(breakdown[1]).toMatchObject({ category: 'no_force_majeure', count: 1 })
  })

  it('filters clauses by a set of severities', () => {
    const clauses = [
      makeClause({ id: '1', severity: 'critical' }),
      makeClause({ id: '2', severity: 'good' }),
      makeClause({ id: '3', severity: 'serious' }),
    ]
    expect(filterRiskClausesBySeverity(clauses, ['critical', 'serious'])).toHaveLength(2)
  })
})
