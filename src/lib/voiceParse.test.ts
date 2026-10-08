import { describe, expect, it } from 'vitest'
import {
  MAX_MOVEMENTS,
  MAX_TEXT_LENGTH,
  buildVoicePayload,
  parseVoiceResponse,
  type CategoryKeys,
} from './voiceParse'
import type { TreeAccount } from './accountTree'

const acc = (over: Partial<TreeAccount> & Pick<TreeAccount, 'id' | 'name' | 'type'>): TreeAccount => ({
  is_budget_bucket: false,
  is_archived: false,
  parent_id: null,
  ...over,
})

const ACCOUNTS: TreeAccount[] = [
  acc({ id: 'bank', name: 'Cuenta corriente', type: 'asset' }),
  acc({ id: 'needs', name: 'Necesidades', type: 'expense', is_budget_bucket: true }),
  acc({ id: 'super', name: 'Supermercado', type: 'expense', parent_id: 'needs' }),
  acc({ id: 'old', name: 'Antigua', type: 'expense', is_archived: true }),
  acc({ id: 'pay', name: 'Nómina', type: 'income' }),
  acc({ id: 'adj', name: 'Ajustes de valor', type: 'income' }),
]

const TODAY = '2026-10-08'

describe('buildVoicePayload', () => {
  it('usa claves opacas y nombres cualificados, sin archivadas', () => {
    const { payload, keys } = buildVoicePayload('hola', TODAY, ACCOUNTS, ['Ajustes de valor'])
    expect(payload.expenseCategories).toEqual([
      { id: 'e1', name: 'Necesidades' },
      { id: 'e2', name: 'Supermercado · Necesidades' },
    ])
    expect(payload.incomeCategories).toEqual([{ id: 'i1', name: 'Nómina' }])
    expect(keys.get('e2')).toEqual({ accountId: 'super', kind: 'expense' })
    // La IA no recibe ningún id real.
    expect(JSON.stringify(payload)).not.toContain('super"')
  })

  it('recorta el texto al máximo permitido', () => {
    const { payload } = buildVoicePayload('a'.repeat(MAX_TEXT_LENGTH + 50), TODAY, ACCOUNTS)
    expect(payload.text).toHaveLength(MAX_TEXT_LENGTH)
  })
})

describe('parseVoiceResponse', () => {
  const keys: CategoryKeys = new Map([
    ['e1', { accountId: 'super', kind: 'expense' }],
    ['i1', { accountId: 'pay', kind: 'income' }],
  ])

  it('devuelve varios movimientos con importe en formato del formulario', () => {
    const out = parseVoiceResponse(
      {
        movements: [
          { kind: 'expense', amount: 12, date: '2026-10-07', description: 'Súper', categoryId: 'e1' },
          { kind: 'income', amount: 1800, date: '2026-10-05', description: 'Nómina', categoryId: 'i1' },
          { kind: 'expense', amount: '3.5', date: TODAY, description: 'Café', categoryId: null },
        ],
      },
      TODAY,
      keys,
    )
    expect(out).toEqual([
      { kind: 'expense', amount: '12,00', date: '2026-10-07', description: 'Súper', categoryId: 'super' },
      { kind: 'income', amount: '1800,00', date: '2026-10-05', description: 'Nómina', categoryId: 'pay' },
      { kind: 'expense', amount: '3,50', date: TODAY, description: 'Café', categoryId: '' },
    ])
  })

  it('fecha ausente o inválida -> hoy', () => {
    const out = parseVoiceResponse(
      {
        movements: [
          { kind: 'expense', amount: 1, description: 'a', categoryId: null },
          { kind: 'expense', amount: 1, date: '2026-13-45', description: 'b', categoryId: null },
          { kind: 'expense', amount: 1, date: 'ayer', description: 'c', categoryId: null },
        ],
      },
      TODAY,
      keys,
    )
    expect(out.map((d) => d.date)).toEqual([TODAY, TODAY, TODAY])
  })

  it('categoría inexistente o de otro tipo -> sin categoría', () => {
    const out = parseVoiceResponse(
      {
        movements: [
          { kind: 'expense', amount: 1, description: 'a', categoryId: 'e99' },
          { kind: 'expense', amount: 1, description: 'b', categoryId: 'i1' },
          { kind: 'income', amount: 1, description: 'c', categoryId: 'e1' },
        ],
      },
      TODAY,
      keys,
    )
    expect(out.map((d) => d.categoryId)).toEqual(['', '', ''])
  })

  it('importe inválido, cero, negativo o desorbitado -> vacío', () => {
    const out = parseVoiceResponse(
      {
        movements: [
          { kind: 'expense', amount: 'mucho' },
          { kind: 'expense', amount: 0 },
          { kind: 'expense', amount: -5 },
          { kind: 'expense', amount: 1e12 },
          { kind: 'expense' },
        ],
      },
      TODAY,
      keys,
    )
    expect(out.map((d) => d.amount)).toEqual(['', '', '', '', ''])
  })

  it('ignora elementos sin tipo válido y limita el número de movimientos', () => {
    const many = Array.from({ length: MAX_MOVEMENTS + 5 }, () => ({ kind: 'income', amount: 1 }))
    expect(parseVoiceResponse({ movements: many }, TODAY, keys)).toHaveLength(MAX_MOVEMENTS)
    expect(
      parseVoiceResponse({ movements: [null, 3, { kind: 'transfer', amount: 1 }, { kind: 'income', amount: 2 }] }, TODAY, keys),
    ).toHaveLength(1)
  })

  it('recorta el concepto', () => {
    const [d] = parseVoiceResponse(
      { movements: [{ kind: 'expense', amount: 1, description: `  ${'x'.repeat(500)}  ` }] },
      TODAY,
      keys,
    )
    expect(d!.description).toHaveLength(200)
  })

  it('lanza si la forma general no es la esperada', () => {
    expect(() => parseVoiceResponse(null, TODAY, keys)).toThrow()
    expect(() => parseVoiceResponse({}, TODAY, keys)).toThrow()
    expect(() => parseVoiceResponse({ movements: 'x' }, TODAY, keys)).toThrow()
  })

  it('lista vacía es válida (nada detectado)', () => {
    expect(parseVoiceResponse({ movements: [] }, TODAY, keys)).toEqual([])
  })
})
