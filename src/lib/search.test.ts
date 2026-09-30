import { describe, expect, it } from 'vitest'
import { matchesSearch } from './search'

describe('matchesSearch', () => {
  it('ignora mayúsculas y acentos en los dos sentidos', () => {
    expect(matchesSearch('Café con leche', 'cafe')).toBe(true)
    expect(matchesSearch('Cafe con leche', 'CAFÉ')).toBe(true)
  })

  it('con varias palabras, todas deben aparecer en cualquier orden', () => {
    expect(matchesSearch('Iberdrola factura luz', 'luz iberdrola')).toBe(true)
    expect(matchesSearch('Iberdrola factura luz', 'luz agua')).toBe(false)
  })

  it('coincide con partes de palabra', () => {
    expect(matchesSearch('Mercadona', 'merca')).toBe(true)
  })

  it('una búsqueda vacía o solo espacios coincide con todo', () => {
    expect(matchesSearch('Lo que sea', '')).toBe(true)
    expect(matchesSearch('Lo que sea', '   ')).toBe(true)
  })

  it('no coincide si la palabra no está', () => {
    expect(matchesSearch('Nómina septiembre', 'alquiler')).toBe(false)
  })
})
