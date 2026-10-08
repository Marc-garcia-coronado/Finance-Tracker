// Modo demo: la app muestra datos ficticios en memoria y no lee ni escribe nada
// real. Solo dura la pestaña (sessionStorage): al cerrarla se vuelve a los datos
// reales, así no se queda activado sin querer. Si el almacenamiento no está
// disponible, el estado vive en memoria mientras no se recargue.
import { useSyncExternalStore } from 'react'

const KEY = 'finanzas.demoMode.v1'
let memory = false
const listeners = new Set<() => void>()

export class DemoModeError extends Error {
  constructor(message = 'No disponible en el modo demo: los datos son de ejemplo.') {
    super(message)
    this.name = 'DemoModeError'
  }
}

export function isDemoMode(): boolean {
  try {
    return sessionStorage.getItem(KEY) === '1' || memory
  } catch {
    return memory
  }
}

export function setDemoMode(enabled: boolean): void {
  memory = enabled
  try {
    if (enabled) sessionStorage.setItem(KEY, '1')
    else sessionStorage.removeItem(KEY)
  } catch {
    // sin almacenamiento: se mantiene solo en memoria
  }
  listeners.forEach((cb) => cb())
}

export function subscribeDemoMode(cb: () => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

export function useDemoMode(): boolean {
  return useSyncExternalStore(subscribeDemoMode, isDemoMode, () => false)
}
