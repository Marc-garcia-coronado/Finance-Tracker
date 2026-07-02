// Persistencia y eventos de los tutoriales. Cada tour se muestra una sola vez
// por usuario (estándar de la industria) y puede reabrirse manualmente.

export const WELCOME_STORAGE = 'finanzas.onboarding.v1'
export const WELCOME_SHOW_EVENT = 'finanzas:show-onboarding'
export const WELCOME_DONE_EVENT = 'finanzas:welcome-done'
export const SHOW_TOUR_EVENT = 'finanzas:show-tour'

export function userKey(base: string, userId: string | undefined) {
  return userId ? `${base}:${userId}` : base
}

export function tourKey(id: string, userId: string | undefined) {
  return userKey(`finanzas.tour.${id}.v1`, userId)
}

export function isDone(key: string): boolean {
  try {
    return !!localStorage.getItem(key)
  } catch {
    // Si localStorage no está disponible, no insistir con el tutorial.
    return true
  }
}

export function markDone(key: string) {
  try {
    localStorage.setItem(key, 'done')
  } catch {
    // ignorar (modo privado, etc.)
  }
}

export function isWelcomeDone(userId: string | undefined): boolean {
  return isDone(userKey(WELCOME_STORAGE, userId))
}

// Reabre el tutorial de bienvenida desde cualquier parte de la app.
export function showOnboarding() {
  window.dispatchEvent(new Event(WELCOME_SHOW_EVENT))
}

// Reabre el tutorial de una sección concreta.
export function showTour(id: string) {
  window.dispatchEvent(new CustomEvent(SHOW_TOUR_EVENT, { detail: id }))
}
