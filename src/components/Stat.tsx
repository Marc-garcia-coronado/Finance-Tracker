import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { formatEuro } from '@/lib/money'

// Chip de variación frente al período anterior. `invert`: que suba es malo (gastos).
// `onBrand`: sobre fondo de marca (texto blanco).
export function Delta({
  cents,
  ratio,
  invert = false,
  onBrand = false,
}: {
  cents: number
  ratio: number | null
  invert?: boolean
  onBrand?: boolean
}) {
  if (cents === 0) return null
  const good = (cents > 0) !== invert
  const tone = onBrand
    ? 'bg-white/15 text-white'
    : good
      ? 'bg-emerald-50 text-emerald-700'
      : 'bg-rose-50 text-rose-700'
  return (
    <span className={cn('badge gap-1 tabular-nums', tone)}>
      {cents > 0 ? '▲' : '▼'}
      {ratio === null ? formatEuro(Math.abs(cents)) : `${Math.round(Math.abs(ratio) * 100)}%`}
    </span>
  )
}

export function Stat({
  label,
  value,
  hint,
  delta,
  className,
  tone = 'default',
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  delta?: ReactNode
  className?: string
  tone?: 'default' | 'positive' | 'negative'
}) {
  const valueColor =
    tone === 'positive'
      ? 'text-emerald-600'
      : tone === 'negative'
        ? 'text-rose-600'
        : 'text-slate-900'
  const dotColor =
    tone === 'positive' ? 'bg-emerald-500' : tone === 'negative' ? 'bg-rose-500' : 'bg-brand-400'
  return (
    <div className={cn('card p-4', className)}>
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
        <span className={cn('h-1.5 w-1.5 rounded-full', dotColor)} aria-hidden="true" />
        {label}
      </p>
      <p className={cn('mt-1.5 text-2xl font-bold tracking-tight tabular-nums', valueColor)}>
        {value}
      </p>
      {(delta || hint) && (
        <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
          {delta}
          {hint}
        </p>
      )}
    </div>
  )
}
