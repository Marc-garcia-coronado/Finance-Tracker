import { describe, expect, it } from 'vitest'
import { pickDefaultAccount } from './lastAccount'

describe('pickDefaultAccount', () => {
  it('devuelve la última cuenta si sigue disponible', () => {
    expect(pickDefaultAccount('b', ['a', 'b'])).toBe('b')
  })
  it('vacío si no hay última cuenta', () => {
    expect(pickDefaultAccount(null, ['a', 'b'])).toBe('')
  })
  it('vacío si la cuenta ya no está entre las opciones (archivada o borrada)', () => {
    expect(pickDefaultAccount('x', ['a', 'b'])).toBe('')
    expect(pickDefaultAccount('a', [])).toBe('')
  })
})
