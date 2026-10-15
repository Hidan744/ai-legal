import { describe, expect, it } from 'vitest'
import { buildDemoWorkspace } from './demoData'
import { buildRecommendations } from './recommendations'
import { calculateRenewalDeadline } from './formulas'

describe('buildDemoWorkspace', () => {
  const now = new Date('2026-10-15T00:00:00.000Z')
  const workspace = buildDemoWorkspace(now)

  it('builds a plausible portfolio size (8-12 counterparties, 20-35 contracts)', () => {
    expect(workspace.counterparties.length).toBeGreaterThanOrEqual(8)
    expect(workspace.counterparties.length).toBeLessThanOrEqual(12)
    expect(workspace.contracts.length).toBeGreaterThanOrEqual(20)
    expect(workspace.contracts.length).toBeLessThanOrEqual(35)
  })

  it('covers all four main counterparty categories', () => {
    const categories = new Set(workspace.counterparties.map((c) => c.category))
    expect(categories.has('supplier')).toBe(true)
    expect(categories.has('client')).toBe(true)
    expect(categories.has('contractor')).toBe(true)
    expect(categories.has('landlord')).toBe(true)
  })

  it('every contract references an existing counterparty', () => {
    const ids = new Set(workspace.counterparties.map((c) => c.id))
    for (const contract of workspace.contracts) {
      expect(ids.has(contract.counterpartyId)).toBe(true)
    }
  })

  it('every risk clause references an existing contract', () => {
    const ids = new Set(workspace.contracts.map((c) => c.id))
    for (const clause of workspace.riskClauses) {
      expect(ids.has(clause.contractId)).toBe(true)
    }
  })

  it('tags all demo contracts with source "manual"', () => {
    expect(workspace.contracts.every((c) => c.source === 'manual')).toBe(true)
  })

  it('includes a ТехноСнаб supply contract whose renewal notice deadline has already passed', () => {
    const technosnab = workspace.counterparties.find((c) => c.name === 'ТехноСнаб')
    expect(technosnab).toBeDefined()
    const contract = workspace.contracts.find((c) => c.counterpartyId === technosnab!.id && c.autoRenew && c.endDate !== null)
    expect(contract).toBeDefined()
    const deadline = calculateRenewalDeadline(contract!, now.toISOString())
    expect(deadline).not.toBeNull()
    expect(deadline!.urgency).toBe('passed')
  })

  it('produces the headline ТехноСнаб recommendation among the top recommendations', () => {
    const recs = buildRecommendations(workspace.contracts, workspace.counterparties, workspace.riskClauses, workspace.obligationEvents, now.toISOString())
    expect(recs.length).toBeGreaterThan(0)
    const technosnabRec = recs.find((r) => r.counterpartyName === 'ТехноСнаб' && r.type === 'renewal_deadline')
    expect(technosnabRec).toBeDefined()
    expect(technosnabRec!.severity).toBe('critical')
  })

  it('flags at least one counterparty with a worsening reliability trend', () => {
    const recs = buildRecommendations(workspace.contracts, workspace.counterparties, workspace.riskClauses, workspace.obligationEvents, now.toISOString())
    expect(recs.some((r) => r.type === 'counterparty_reliability')).toBe(true)
  })

  it('includes at least one critical risk clause', () => {
    expect(workspace.riskClauses.some((rc) => rc.severity === 'critical')).toBe(true)
  })
})
