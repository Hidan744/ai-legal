import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { generateBusinessId, generateId } from '@/lib/id'
import { buildDemoWorkspace } from '@/lib/legal/demoData'
import type { CsvContractRow } from '@/lib/legal/csvContractImport'
import type {
  BusinessType,
  Contract,
  Counterparty,
  CounterpartyCategory,
  LegalProfile,
  ObligationEvent,
  RiskClause,
} from '@/types/legal'

interface LegalStoreState {
  hasHydrated: boolean
  onboardingComplete: boolean
  profile: LegalProfile | null
  counterparties: Counterparty[]
  contracts: Contract[]
  riskClauses: RiskClause[]
  obligationEvents: ObligationEvent[]

  completeOnboarding: (input: { companyName: string; businessType: BusinessType }) => void
  loadDemo: () => void
  reset: () => void

  updateProfile: (input: { companyName: string; businessType: BusinessType }) => void

  importContractsFromCsv: (rows: CsvContractRow[]) => { importedCount: number; createdCounterparties: string[] }
}

function findOrCreateCounterparty(
  counterparties: Counterparty[],
  name: string,
  category: CounterpartyCategory,
  createdNames: string[],
): { id: string; counterparties: Counterparty[] } {
  const existing = counterparties.find((c) => c.name.trim().toLowerCase() === name.trim().toLowerCase())
  if (existing) return { id: existing.id, counterparties }
  const created: Counterparty = { id: generateId('cp'), name, inn: null, category, createdAt: new Date().toISOString() }
  createdNames.push(name)
  return { id: created.id, counterparties: [...counterparties, created] }
}

/** Статус договора, выведенный из его даты окончания и факта расторжения — используется при
 *  CSV-импорте, где статус не указывается явно (мирроринг подхода других продуктов линейки). */
function deriveContractStatus(endDate: string | null, referenceISO: string): Contract['status'] {
  if (endDate === null) return 'active'
  const daysLeft = (new Date(endDate).getTime() - new Date(referenceISO).getTime()) / 86_400_000
  if (daysLeft < 0) return 'expired'
  if (daysLeft <= 30) return 'expiring_soon'
  return 'active'
}

export const useLegalStore = create<LegalStoreState>()(
  persist(
    (set, get) => ({
      hasHydrated: false,
      onboardingComplete: false,
      profile: null,
      counterparties: [],
      contracts: [],
      riskClauses: [],
      obligationEvents: [],

      completeOnboarding: ({ companyName, businessType }) => {
        const profile: LegalProfile = {
          id: generateBusinessId(),
          companyName,
          businessType,
          createdAt: new Date().toISOString(),
        }
        set({
          profile,
          counterparties: [],
          contracts: [],
          riskClauses: [],
          obligationEvents: [],
          onboardingComplete: true,
        })
      },

      loadDemo: () => {
        const demo = buildDemoWorkspace()
        set({
          profile: demo.profile,
          counterparties: demo.counterparties,
          contracts: demo.contracts,
          riskClauses: demo.riskClauses,
          obligationEvents: demo.obligationEvents,
          onboardingComplete: true,
        })
      },

      reset: () => {
        set({
          profile: null,
          counterparties: [],
          contracts: [],
          riskClauses: [],
          obligationEvents: [],
          onboardingComplete: false,
        })
      },

      updateProfile: ({ companyName, businessType }) => {
        set((s) => (s.profile ? { profile: { ...s.profile, companyName, businessType } } : s))
      },

      importContractsFromCsv: (rows) => {
        const state = get()
        let counterparties = [...state.counterparties]
        const createdCounterparties: string[] = []
        const referenceISO = new Date().toISOString()

        const newContracts: Contract[] = rows.map((row) => {
          const resolved = findOrCreateCounterparty(counterparties, row.counterpartyName, row.counterpartyCategory, createdCounterparties)
          counterparties = resolved.counterparties
          return {
            id: generateId('contract'),
            counterpartyId: resolved.id,
            title: row.title,
            type: row.type,
            startDate: row.startDate,
            endDate: row.endDate,
            autoRenew: row.autoRenew,
            renewalNoticePeriodDays: row.renewalNoticePeriodDays,
            value: row.value,
            status: deriveContractStatus(row.endDate, referenceISO),
            source: 'csv',
            createdAt: referenceISO,
          }
        })

        set({ counterparties, contracts: [...state.contracts, ...newContracts] })
        return { importedCount: newContracts.length, createdCounterparties }
      },
    }),
    {
      name: 'ai-legal:state:v1',
      partialize: (s) => ({
        onboardingComplete: s.onboardingComplete,
        profile: s.profile,
        counterparties: s.counterparties,
        contracts: s.contracts,
        riskClauses: s.riskClauses,
        obligationEvents: s.obligationEvents,
      }),
    },
  ),
)

// hasHydrated нужно выставлять из onRehydrateStorage, но там нет доступа к set() напрямую —
// подписываемся на завершение гидратации через persist API вместо метода в самом стейте.
useLegalStore.persist.onFinishHydration(() => {
  useLegalStore.setState({ hasHydrated: true })
})
if (useLegalStore.persist.hasHydrated()) {
  useLegalStore.setState({ hasHydrated: true })
}
