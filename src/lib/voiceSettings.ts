// Interruptor del dictado con IA. Es una preferencia por dispositivo (como la
// última cuenta usada), desactivada por defecto: si el almacenamiento no está
// disponible, el dictado simplemente queda apagado.
import { useSyncExternalStore } from 'react'

const KEY = 'finanzas.voiceDictation.v1'
const EVENT = 'finanzas:voice-dictation'

export function isVoiceEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function setVoiceEnabled(enabled: boolean): void {
  try {
    if (enabled) localStorage.setItem(KEY, '1')
    else localStorage.removeItem(KEY)
  } catch {
    // sin almacenamiento: no se puede recordar
  }
  window.dispatchEvent(new Event(EVENT))
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb)
  window.addEventListener('storage', cb)
  return () => {
    window.removeEventListener(EVENT, cb)
    window.removeEventListener('storage', cb)
  }
}

export function useVoiceEnabled(): boolean {
  return useSyncExternalStore(subscribe, isVoiceEnabled, () => false)
}
