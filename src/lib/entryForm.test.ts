import { describe, expect, it } from 'vitest'
import { centsToInput, entryToFormValues, isEditableKind } from './entryForm'

const entry = (kind: string, lines: [string, number][]) => ({
  kind,
  occurred_on: '2026-09-15',
  description: 'Cena',
  entry_lines: lines.map(([account_id, amount_cents]) => ({ account_id, amount_cents })),
})

describe('entryToFormValues', () => {
  it('gasto: origen = línea negativa, destino = positiva, importe = la positiva', () => {
    expect(entryToFormValues(entry('expense', [['cc', -4550], ['ocio', 4550]]))).toEqual({
      kind: 'expense',
      date: '2026-09-15',
      description: 'Cena',
      amount: '45,50',
      fromAccountId: 'cc',
      toAccountId: 'ocio',
    })
  })

  it('ingreso y traspaso, con las líneas en cualquier orden', () => {
    expect(entryToFormValues(entry('income', [['cc', 200000], ['trabajo', -200000]]))).toMatchObject({
      kind: 'income',
      amount: '2000,00',
      fromAccountId: 'trabajo',
      toAccountId: 'cc',
    })
    expect(entryToFormValues(entry('transfer', [['inv', 30000], ['cc', -30000]]))).toMatchObject({
      kind: 'transfer',
      fromAccountId: 'cc',
      toAccountId: 'inv',
    })
  })
})

describe('centsToInput', () => {
  it('formatea con coma y dos decimales', () => {
    expect(centsToInput(1234)).toBe('12,34')
    expect(centsToInput(5)).toBe('0,05')
    expect(centsToInput(100000)).toBe('1000,00')
  })
})

describe('isEditableKind', () => {
  it('solo gastos, ingresos y traspasos', () => {
    expect(isEditableKind('expense')).toBe(true)
    expect(isEditableKind('transfer')).toBe(true)
    expect(isEditableKind('adjustment')).toBe(false)
  })
})
