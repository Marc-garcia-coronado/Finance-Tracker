import { describe, expect, it } from 'vitest'
import { centsToEuro, euroToCents, formatEuro } from './money'

describe('euroToCents', () => {
  it('parsea decimales con coma (es-ES)', () => {
    expect(euroToCents('12,50')).toBe(1250)
    expect(euroToCents('0,01')).toBe(1)
    expect(euroToCents('1.234,56')).toBe(123456)
  })

  it('parsea decimales con punto', () => {
    expect(euroToCents('12.50')).toBe(1250)
    expect(euroToCents('12.5')).toBe(1250)
    expect(euroToCents('3')).toBe(300)
  })

  it('trata el punto de millares como separador, no decimal', () => {
    expect(euroToCents('1.234')).toBe(123400)
    expect(euroToCents('1.234.567')).toBe(123456700)
  })

  it('redondea al céntimo el tercer decimal', () => {
    expect(euroToCents('1,005')).toBe(101)
    expect(euroToCents('1,004')).toBe(100)
  })

  it('soporta negativos y símbolos', () => {
    expect(euroToCents('-3')).toBe(-300)
    expect(euroToCents('1.234,56 €')).toBe(123456)
  })

  it('lanza con entradas inválidas', () => {
    expect(() => euroToCents('')).toThrow()
    expect(() => euroToCents('abc')).toThrow()
  })
})

// Intl usa un espacio fino indivisible (U+202F) antes del €; lo normalizamos
// a espacio normal para que el test no dependa del carácter exacto.
const norm = (s: string) => s.replace(/\s/g, ' ')

describe('formatEuro / centsToEuro', () => {
  it('formatea céntimos como moneda', () => {
    // es-ES (CLDR moderno) no agrupa 4 cifras; sí agrupa a partir de 5.
    expect(norm(formatEuro(123456))).toBe('1234,56 €')
    expect(norm(formatEuro(1234567))).toBe('12.345,67 €')
    expect(norm(formatEuro(0))).toBe('0,00 €')
    expect(norm(formatEuro(-500))).toBe('-5,00 €')
  })

  it('centsToEuro divide por 100', () => {
    expect(centsToEuro(1250)).toBe(12.5)
  })

  it('ida y vuelta euroToCents -> formatEuro', () => {
    expect(norm(formatEuro(euroToCents('12.345,67')))).toBe('12.345,67 €')
  })
})
