import { cn } from '@/lib/utils'
import { CONTRACT_STATUS_LABELS, type ContractStatus } from '@/types/legal'

export function ContractStatusBadge({ status }: { status: ContractStatus }) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium whitespace-nowrap',
        status === 'active' && 'bg-positive-500/10 text-positive-500',
        status === 'expiring_soon' && 'bg-warning-500/10 text-warning-500',
        status === 'expired' && 'bg-negative-500/10 text-negative-500',
        status === 'terminated' && 'bg-ink-800 text-ink-400',
      )}
    >
      {CONTRACT_STATUS_LABELS[status]}
    </span>
  )
}
