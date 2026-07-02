import { cn } from '@/lib/cn'

// Barra de progreso. `value` en [0, 1] (se recorta).
export function ProgressBar({
  value,
  className,
}: {
  value: number
  className?: string
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100
  const done = value >= 1
  return (
    <div
      className={cn('h-2 w-full overflow-hidden rounded-full bg-slate-100', className)}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn(
          'h-full rounded-full transition-all duration-500',
          done
            ? 'bg-gradient-to-r from-emerald-400 to-emerald-500'
            : 'bg-gradient-to-r from-indigo-500 to-violet-500',
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
