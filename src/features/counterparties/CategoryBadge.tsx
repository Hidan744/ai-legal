import { cn } from '@/lib/utils'
import { COUNTERPARTY_CATEGORY_LABELS, type CounterpartyCategory } from '@/types/legal'

export function CategoryBadge({ category }: { category: CounterpartyCategory }) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium whitespace-nowrap',
        category === 'supplier' && 'bg-aurora-blue/10 text-aurora-blue-soft',
        category === 'client' && 'bg-positive-500/10 text-positive-500',
        category === 'contractor' && 'bg-brand-500/10 text-brand-400',
        category === 'landlord' && 'bg-ink-800 text-ink-300',
        category === 'other' && 'bg-ink-800 text-ink-400',
      )}
    >
      {COUNTERPARTY_CATEGORY_LABELS[category]}
    </span>
  )
}
