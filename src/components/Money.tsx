import { formatEuro } from '@/lib/money'
import { cn } from '@/lib/cn'

// Muestra una cantidad en céntimos formateada. `colored` colorea por signo.
export function Money({
  cents,
  colored = false,
  className,
}: {
  cents: number
  colored?: boolean
  className?: string
}) {
  const color = !colored
    ? undefined
    : cents > 0
      ? 'text-emerald-600'
      : cents < 0
        ? 'text-rose-600'
        : 'text-slate-500'
  return (
    <span className={cn('tabular-nums', color, className)}>{formatEuro(cents)}</span>
  )
}
