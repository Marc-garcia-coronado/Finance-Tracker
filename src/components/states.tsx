import type { ReactNode } from 'react'
import { Spinner } from './ui'

// Estado de carga estándar para una vista o sección.
export function LoadingState({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-slate-500">
      <Spinner />
      <span>{label}</span>
    </div>
  )
}

// Estado de error con opción de reintentar.
export function ErrorState({
  error,
  onRetry,
}: {
  error: unknown
  onRetry?: () => void
}) {
  const message =
    error instanceof Error ? error.message : 'Ha ocurrido un error inesperado.'
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <p className="font-medium text-rose-700">No se pudieron cargar los datos</p>
      <p className="max-w-md text-sm text-slate-500">{message}</p>
      {onRetry && (
        <button className="btn-secondary" onClick={onRetry}>
          Reintentar
        </button>
      )}
    </div>
  )
}

// Estado vacío con mensaje y acción opcional.
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      <p className="font-medium text-slate-700">{title}</p>
      {description && <p className="max-w-md text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
