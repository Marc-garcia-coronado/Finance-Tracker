// Tema claro / oscuro / del sistema. Preferencia por dispositivo en localStorage;
// index.html aplica la clase `dark` antes de pintar para evitar el parpadeo.
import { useSyncExternalStore } from 'react'

export type Theme = 'system' | 'light' | 'dark'

const KEY = 'finanzas.theme.v1'
const EVENT = 'finanzas:theme'
const DARK_QUERY = '(prefers-color-scheme: dark)'

export function getTheme(): Theme {
  try {
    const t = localStorage.getItem(KEY)
    return t === 'light' || t === 'dark' ? t : 'system'
  } catch {
    return 'system'
  }
}

export function isDark(theme: Theme): boolean {
  return theme === 'dark' || (theme === 'system' && matchMedia(DARK_QUERY).matches)
}

export function applyTheme(theme: Theme = getTheme()): void {
  const dark = isDark(theme)
  document.documentElement.classList.toggle('dark', dark)
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', dark ? '#0a0e18' : '#1e408c')
}

export function setTheme(theme: Theme): void {
  try {
    if (theme === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, theme)
  } catch {
    // sin almacenamiento: el cambio dura solo esta sesión
  }
  applyTheme(theme)
  window.dispatchEvent(new Event(EVENT))
}

function subscribe(cb: () => void) {
  const mq = matchMedia(DARK_QUERY)
  const onSystem = () => {
    applyTheme()
    cb()
  }
  window.addEventListener(EVENT, cb)
  mq.addEventListener('change', onSystem)
  return () => {
    window.removeEventListener(EVENT, cb)
    mq.removeEventListener('change', onSystem)
  }
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, getTheme, () => 'system')
}
