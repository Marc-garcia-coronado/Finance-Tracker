import type { ReactNode } from 'react'

export function PageHeader({
  title,
  subtitle,
  action,
  onHelp,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
  // Reabre el tutorial de la sección.
  onHelp?: () => void
}) {
  return (
    <div className="mb-5 flex items-end justify-between gap-3">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
          {onHelp && (
            <button
              onClick={onHelp}
              aria-label="Ver la guía de esta sección"
              title="Ver la guía de esta sección"
              className="flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 text-xs font-semibold text-slate-400 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-600"
            >
              ?
            </button>
          )}
        </div>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
