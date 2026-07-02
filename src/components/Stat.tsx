import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export function Stat({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  tone?: 'default' | 'positive' | 'negative'
}) {
  const valueColor =
    tone === 'positive'
      ? 'text-emerald-600'
      : tone === 'negative'
        ? 'text-rose-600'
        : 'text-slate-900'
  const dotColor =
    tone === 'positive' ? 'bg-emerald-500' : tone === 'negative' ? 'bg-rose-500' : 'bg-indigo-400'
  return (
    <div className="card p-4">
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
        <span className={cn('h-1.5 w-1.5 rounded-full', dotColor)} aria-hidden="true" />
        {label}
      </p>
      <p className={cn('mt-1.5 text-2xl font-bold tracking-tight tabular-nums', valueColor)}>
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  )
}
