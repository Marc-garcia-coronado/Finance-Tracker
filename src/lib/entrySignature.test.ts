import { describe, expect, it } from 'vitest'
import type { CreateEntryParams } from './entries'
import { entrySignature, findExistingDuplicates, paramsSignature } from './entrySignature'

const entry = (over: Partial<CreateEntryParams> = {}): CreateEntryParams => ({
  kind: 'expense',
  date: '2026-03-07',
  description: 'Cine',
  fromAccountId: 'banco',
  toAccountId: 'ocio',
  amountCents: 1250,
  ...over,
})

// Mapa de existentes a partir de movimientos ya creados.
const existingOf = (...entries: CreateEntryParams[]) => {
  const m = new Map<string, number>()
  for (const e of entries) m.set(paramsSignature(e), (m.get(paramsSignature(e)) ?? 0) + 1)
  return m
}

describe('entrySignature', () => {
  it('no depende del orden de las líneas', () => {
    const a = entrySignature('2026-03-07', 'expense', [
      { account_id: 'banco', cents: -100 },
      { account_id: 'ocio', cents: 100 },
    ])
    const b = entrySignature('2026-03-07', 'expense', [
      { account_id: 'ocio', cents: 100 },
      { account_id: 'banco', cents: -100 },
    ])
    expect(a).toBe(b)
  })
})

describe('paramsSignature', () => {
  it('coincide con la firma de las líneas que crea createEntry', () => {
    expect(paramsSignature(entry())).toBe(
      entrySignature('2026-03-07', 'expense', [
        { account_id: 'banco', cents: -1250 },
        { account_id: 'ocio', cents: 1250 },
      ]),
    )
  })

  it('ignora la descripción', () => {
    expect(paramsSignature(entry({ description: 'Otro' }))).toBe(paramsSignature(entry()))
  })
})

describe('findExistingDuplicates', () => {
  it('reimportar el mismo lote marca todas las filas', () => {
    const batch = [entry(), entry({ date: '2026-03-08', amountCents: 500 })]
    expect(findExistingDuplicates(batch, existingOf(...batch))).toEqual(new Set([0, 1]))
  })

  it('sin coincidencias no marca nada', () => {
    expect(findExistingDuplicates([entry()], new Map())).toEqual(new Set())
  })

  it('distinta cuenta, importe, fecha o tipo no es duplicado', () => {
    const existing = existingOf(entry())
    const others = [
      entry({ toAccountId: 'comida' }),
      entry({ amountCents: 1251 }),
      entry({ date: '2026-03-08' }),
      entry({ kind: 'transfer' }),
    ]
    expect(findExistingDuplicates(others, existing)).toEqual(new Set())
  })

  it('multiconjunto: 2 existentes y 3 en el lote marca solo 2', () => {
    const existing = existingOf(entry(), entry())
    const batch = [entry(), entry(), entry()]
    expect(findExistingDuplicates(batch, existing)).toEqual(new Set([0, 1]))
  })

  it('no modifica el mapa de existentes recibido', () => {
    const existing = existingOf(entry())
    findExistingDuplicates([entry()], existing)
    expect(existing.get(paramsSignature(entry()))).toBe(1)
  })
})
