import { dehydrate, QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { generateMasterKeyBytes, importMasterKey } from './crypto/webcrypto'
import { isExpired, lastDataUpdate, MAX_AGE_MS, openCache, sealCache } from './offlineCache'

const freshKey = () => importMasterKey(generateMasterKeyBytes())

// Un QueryClient con datos sensibles ya descifrados, como en la app.
function clientWithData() {
  const qc = new QueryClient()
  qc.setQueryData(['entries', 'x'], { rows: [{ description: 'Psicólogo privado', cents: 6000 }] })
  qc.setQueryData(['ledger'], { accounts: [{ name: 'Cuenta secreta' }], lines: [] })
  return qc
}

describe('caché offline cifrada', () => {
  it('no deja nada en claro en lo que se guarda', async () => {
    const key = await freshKey()
    const envelope = await sealCache(dehydrate(clientWithData()), key, 1000)
    const stored = JSON.stringify(envelope)
    expect(stored).not.toContain('Psicólogo')
    expect(stored).not.toContain('Cuenta secreta')
    expect(stored).not.toContain('6000')
    expect(envelope.payload.startsWith('v1.')).toBe(true)
    expect(envelope.savedAt).toBe(1000)
  })

  it('round-trip: con la misma clave se recupera el estado', async () => {
    const key = await freshKey()
    const original = dehydrate(clientWithData())
    const { state, savedAt } = await openCache(await sealCache(original, key, 42), key)
    expect(savedAt).toBe(42)
    expect(state).toEqual(JSON.parse(JSON.stringify(original)))
  })

  it('con otra clave no se puede abrir', async () => {
    const envelope = await sealCache(dehydrate(clientWithData()), await freshKey(), 1)
    await expect(openCache(envelope, await freshKey())).rejects.toThrow()
  })

  it('un blob manipulado no se puede abrir', async () => {
    const key = await freshKey()
    const envelope = await sealCache(dehydrate(clientWithData()), key, 1)
    const parts = envelope.payload.split('.')
    parts[2] = parts[2]!.slice(0, -4) + 'AAAA'
    await expect(openCache({ ...envelope, payload: parts.join('.') }, key)).rejects.toThrow()
  })

  it('rechaza una versión de formato desconocida', async () => {
    const key = await freshKey()
    const envelope = await sealCache(dehydrate(clientWithData()), key, 1)
    await expect(openCache({ ...envelope, v: 99 }, key)).rejects.toThrow('Versión')
  })
})

describe('isExpired', () => {
  it('caduca pasado el máximo', () => {
    expect(isExpired(0, MAX_AGE_MS)).toBe(false)
    expect(isExpired(0, MAX_AGE_MS + 1)).toBe(true)
  })
})

describe('lastDataUpdate', () => {
  it('null sin datos y la fecha más reciente con datos', () => {
    expect(lastDataUpdate(new QueryClient())).toBeNull()
    const qc = new QueryClient()
    qc.setQueryData(['a'], 1, { updatedAt: 1000 })
    qc.setQueryData(['b'], 2, { updatedAt: 5000 })
    expect(lastDataUpdate(qc)).toBe(5000)
  })
})
