import { cn } from '@/lib/cn'

export type ProgressTone = 'default' | 'warning' | 'danger' | 'success'

const TONE_CLASS: Record<ProgressTone, string> = {
  default: 'bg-gradient-to-r from-indigo-500 to-violet-500',
  warning: 'bg-gradient-to-r from-amber-400 to-amber-500',
  danger: 'bg-gradient-to-r from-rose-500 to-rose-600',
  success: 'bg-gradient-to-r from-emerald-400 to-emerald-500',
}

// Barra de progreso. `value` en [0, 1] (se recorta). Sin `tone`, se pone verde
// al completarse (uso en Objetivos); con `tone`, el color lo decide quien llama.
export function ProgressBar({
  value,
  tone,
  className,
}: {
  value: number
  tone?: ProgressTone
  className?: string
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100
  const effective = tone ?? (value >= 1 ? 'success' : 'default')
  return (
    <div
      className={cn('h-2 w-full overflow-hidden rounded-full bg-slate-100', className)}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn('h-full rounded-full transition-all duration-500', TONE_CLASS[effective])}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
