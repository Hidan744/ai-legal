import { cn } from '@/lib/utils'
import { RENEWAL_URGENCY_LABELS, type RenewalUrgency } from '@/lib/legal/formulas'

export function UrgencyBadge({ urgency }: { urgency: RenewalUrgency }) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium whitespace-nowrap',
        urgency === 'passed' && 'bg-negative-500/10 text-negative-500',
        urgency === 'urgent' && 'bg-warning-500/10 text-warning-500',
        urgency === 'upcoming' && 'bg-ink-800 text-ink-300',
        urgency === 'comfortable' && 'bg-positive-500/10 text-positive-500',
      )}
    >
      {RENEWAL_URGENCY_LABELS[urgency]}
    </span>
  )
}
