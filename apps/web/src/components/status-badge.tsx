import { LEAD_STATUS_LABELS, type LeadStatus } from '@pipe/shared'
import { cn } from '@/lib/utils'

const STYLES: Record<LeadStatus, string> = {
  new: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  contacted: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200',
  qualified: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200',
  proposal: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  won: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  lost: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200',
}

export function StatusBadge({ status, className }: { status: LeadStatus; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        STYLES[status],
        className,
      )}
    >
      {LEAD_STATUS_LABELS[status]}
    </span>
  )
}
