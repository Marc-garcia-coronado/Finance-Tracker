import { afterEach, describe, expect, it, vi } from 'vitest'
import { DemoModeError, isDemoMode, setDemoMode, subscribeDemoMode } from './demoMode'

afterEach(() => setDemoMode(false))

describe('modo demo', () => {
  it('está apagado por defecto y se activa y desactiva', () => {
    expect(isDemoMode()).toBe(false)
    setDemoMode(true)
    expect(isDemoMode()).toBe(true)
    setDemoMode(false)
    expect(isDemoMode()).toBe(false)
  })

  it('avisa a los suscriptores y deja de avisar al darse de baja', () => {
    const cb = vi.fn()
    const unsubscribe = subscribeDemoMode(cb)
    setDemoMode(true)
    expect(cb).toHaveBeenCalledTimes(1)
    unsubscribe()
    setDemoMode(false)
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('funciona sin sessionStorage (solo en memoria)', () => {
    // En entorno node no existe sessionStorage: no debe lanzar.
    expect(() => setDemoMode(true)).not.toThrow()
    expect(isDemoMode()).toBe(true)
  })

  it('DemoModeError tiene un mensaje en español', () => {
    expect(new DemoModeError().message).toContain('modo demo')
  })
})
