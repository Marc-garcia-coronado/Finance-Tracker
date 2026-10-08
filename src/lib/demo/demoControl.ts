// Entrar y salir del modo demo: siempre con caché y datos de ejemplo limpios.
import { demoQueryClient } from '../queryClient'
import { setDemoMode } from './demoMode'
import { resetDemoStore } from './demoStore'

export function enterDemo(): void {
  demoQueryClient.clear()
  resetDemoStore()
  setDemoMode(true)
}

export function exitDemo(): void {
  setDemoMode(false)
  demoQueryClient.clear()
  resetDemoStore()
}
