import { describe, expect, it } from 'vitest'
import { checkIntegrity, type IntegrityEntry, type IntegrityLine } from './integrity'

const line = (account_id: string, cents: number | null, encrypted = true): IntegrityLine => ({
  account_id,
  cents,
  encrypted,
})

const entry = (over: Partial<IntegrityEntry> & { id: string }): IntegrityEntry => ({
  occurred_on: '2026-09-01',
  description: 'x',
  voided_at: null,
  voids_entry_id: null,
  lines: [line('cc', -2000), line('ocio', 2000)],
  ...over,
})

const kinds = (entries: IntegrityEntry[]) => checkIntegrity(entries).map((p) => p.kind)

describe('checkIntegrity', () => {
  it('no reporta nada en un conjunto sano (gasto + par original/anulación)', () => {
    expect(
      checkIntegrity([
        entry({ id: 'gasto' }),
        entry({ id: 'orig', voided_at: '2026-09-02T00:00:00Z' }),
        entry({ id: 'anul', voids_entry_id: 'orig', lines: [line('cc', 2000), line('ocio', -2000)] }),
      ]),
    ).toEqual([])
  })

  it('detecta menos de 2 líneas', () => {
    expect(kinds([entry({ id: 'a', lines: [line('cc', 0)] })])).toEqual(['too_few_lines'])
  })

  it('detecta un movimiento que no cuadra, con la diferencia en €', () => {
    const [p] = checkIntegrity([entry({ id: 'a', lines: [line('cc', -2000), line('ocio', 1500)] })])
    expect(p?.kind).toBe('unbalanced')
    expect(p?.message).toContain('5,00')
  })

  it('detecta importes que no se descifran y no calcula la suma', () => {
    expect(kinds([entry({ id: 'a', lines: [line('cc', null), line('ocio', 2000)] })])).toEqual([
      'undecryptable',
    ])
  })

  it('detecta importes sin cifrar', () => {
    expect(kinds([entry({ id: 'a', lines: [line('cc', -2000, false), line('ocio', 2000)] })])).toEqual([
      'plaintext',
    ])
  })

  it('detecta una anulación cuyo original no existe', () => {
    expect(
      kinds([entry({ id: 'anul', voids_entry_id: 'no-existe', lines: [line('cc', 2000), line('ocio', -2000)] })]),
    ).toEqual(['orphan_reversal'])
  })

  it('detecta una anulación cuyo original no está marcado como anulado', () => {
    expect(
      kinds([
        entry({ id: 'orig' }),
        entry({ id: 'anul', voids_entry_id: 'orig', lines: [line('cc', 2000), line('ocio', -2000)] }),
      ]),
    ).toEqual(['orphan_reversal'])
  })

  it('detecta un anulado sin su anulación', () => {
    expect(kinds([entry({ id: 'orig', voided_at: '2026-09-02T00:00:00Z' })])).toEqual(['missing_reversal'])
  })

  it('detecta una anulación que no deshace el original', () => {
    expect(
      kinds([
        entry({ id: 'orig', voided_at: '2026-09-02T00:00:00Z' }),
        entry({ id: 'anul', voids_entry_id: 'orig', lines: [line('cc', 1000), line('ocio', -1000)] }),
      ]),
    ).toEqual(['reversal_mismatch'])
  })

  it('ordena los problemas del más reciente al más antiguo', () => {
    const ps = checkIntegrity([
      entry({ id: 'viejo', occurred_on: '2026-01-01', lines: [line('cc', 1), line('ocio', 1)] }),
      entry({ id: 'nuevo', occurred_on: '2026-09-01', lines: [line('cc', 1), line('ocio', 1)] }),
    ])
    expect(ps.map((p) => p.entryId)).toEqual(['nuevo', 'viejo'])
  })
})
