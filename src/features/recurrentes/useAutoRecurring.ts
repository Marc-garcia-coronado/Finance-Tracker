import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { generatePendingRecurring } from '@/lib/recurring'
import { todayISO } from '@/lib/dates'
import { qk } from '@/lib/queries'
import { isDemoMode } from '@/lib/demo/demoMode'

export type AutoRecurringState =
  | { status: 'idle' | 'running' }
  | { status: 'done'; created: number }
  | { status: 'error'; message: string }

// Una sola ejecución por carga de la app: a nivel de módulo para que el doble
// montaje de StrictMode (o volver a montar AppLayout) no genere dos veces.
let run: Promise<{ created: number }> | null = null

// Genera los recurrentes pendientes hasta hoy al abrir la app (vault ya
// desbloqueado: se usa dentro de AppLayout).
export function useAutoRecurring(): AutoRecurringState {
  const qc = useQueryClient()
  const [state, setState] = useState<AutoRecurringState>({ status: 'idle' })

  useEffect(() => {
    // Sin conexión no se puede escribir: se genera en la próxima apertura con red
    // (no se marca como ejecutado), sin enseñar un error que ya explica el banner.
    if (navigator.onLine === false) return
    // En modo demo no se escribe nada real.
    if (isDemoMode()) return
    let cancelled = false
    setState({ status: 'running' })
    run ??= generatePendingRecurring(todayISO())
    run.then(
      ({ created }) => {
        if (created > 0) {
          qc.invalidateQueries({ queryKey: ['entries'] })
          qc.invalidateQueries({ queryKey: qk.ledger })
        }
        qc.invalidateQueries({ queryKey: qk.recurring }) // next_run_on ha avanzado
        if (!cancelled) setState({ status: 'done', created })
      },
      (e: unknown) => {
        if (!cancelled)
          setState({ status: 'error', message: e instanceof Error ? e.message : 'Error desconocido' })
      },
    )
    return () => {
      cancelled = true
    }
  }, [qc])

  return state
}
