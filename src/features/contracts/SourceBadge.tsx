import { FilePen, Upload } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CONTRACT_SOURCE_LABELS, type ContractSource } from '@/types/legal'

const SOURCE_ICONS = { manual: FilePen, csv: Upload } as const

const SOURCE_STYLES: Record<ContractSource, string> = {
  manual: 'text-ink-400 bg-ink-800 border-ink-700',
  csv: 'text-aurora-blue-soft bg-aurora-blue/10 border-aurora-blue/25',
}

export function SourceBadge({ source, className }: { source: ContractSource; className?: string }) {
  const Icon = SOURCE_ICONS[source]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium whitespace-nowrap',
        SOURCE_STYLES[source],
        className,
      )}
    >
      <Icon className="size-3" />
      {CONTRACT_SOURCE_LABELS[source]}
    </span>
  )
}
