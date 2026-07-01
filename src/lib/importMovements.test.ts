import { describe, expect, it } from 'vitest'
import { parseCsv } from './csv'
import {
  buildImportRows,
  detectColumns,
  markInFileDuplicates,
  normalizeText,
  parseDate,
  tipoToKind,
} from './importMovements'

describe('normalizeText', () => {
  it('quita acentos y pasa a minúsculas', () => {
    expect(normalizeText('  Categoría ')).toBe('categoria')
    expect(normalizeText('AÑO')).toBe('ano')
  })
})

describe('tipoToKind', () => {
  it('mapea sinónimos a kind', () => {
    expect(tipoToKind('Ingreso')).toBe('income')
    expect(tipoToKind('GASTO')).toBe('expense')
    expect(tipoToKind('Ahorro')).toBe('transfer')
    expect(tipoToKind('Inversión')).toBe('transfer')
    expect(tipoToKind('Cualquiera')).toBeNull()
  })
})

describe('parseDate', () => {
  it('acepta dd/MM/yyyy', () => {
    expect(parseDate('07/03/2026')).toBe('2026-03-07')
    expect(parseDate('7/3/2026')).toBe('2026-03-07')
  })
  it('acepta ISO', () => {
    expect(parseDate('2026-03-07')).toBe('2026-03-07')
  })
  it('rechaza basura', () => {
    expect(parseDate('no es fecha')).toBeNull()
    expect(parseDate('')).toBeNull()
  })
})

describe('detectColumns', () => {
  it('encuentra columnas tolerando acentos y "Importe (€)"', () => {
    const cols = detectColumns(['Fecha', 'Tipo', 'Categoría', 'Concepto', 'Importe (€)', 'Mes', 'Año'])
    expect(cols).toEqual({ fecha: 0, tipo: 1, categoria: 2, concepto: 3, importe: 4 })
  })
  it('devuelve null si falta una columna mínima', () => {
    expect(detectColumns(['Fecha', 'Categoría'])).toBeNull()
  })
})

describe('buildImportRows', () => {
  const csv = [
    'Fecha;Tipo;Categoría;Concepto;Importe (€);Mes;Año',
    '01/02/2026;Gasto;Ocio;Cine;-12,50;Febrero;2026',
    '05/02/2026;Ingreso;Trabajo;Nómina;1800;Febrero;2026',
    '10/02/2026;Ahorro;Fondo emergencia;Traspaso;200,00;Febrero;2026',
    'malafecha;Gasto;Ocio;Roto;10;Febrero;2026',
  ].join('\n')

  const parsed = parseCsv(csv)
  const cols = detectColumns(parsed.headers)!
  const { rows, mappingKeys } = buildImportRows(parsed, cols)

  it('toma el importe en positivo aunque venga negativo', () => {
    expect(rows[0]!.amountCents).toBe(1250)
  })

  it('infiere el kind desde el Tipo', () => {
    expect(rows[0]!.kindGuess).toBe('expense')
    expect(rows[1]!.kindGuess).toBe('income')
    expect(rows[2]!.kindGuess).toBe('transfer')
  })

  it('marca error en fecha no válida', () => {
    expect(rows[3]!.error).toMatch(/Fecha/)
  })

  it('agrupa claves (Tipo, Categoría) distintas', () => {
    // Ocio aparece 2 veces (filas 0 y 3) -> una sola clave con count 2
    const ocio = mappingKeys.find((k) => normalizeText(k.categoria) === 'ocio')
    expect(ocio?.count).toBe(2)
    expect(mappingKeys).toHaveLength(3)
  })
})

describe('markInFileDuplicates', () => {
  it('detecta filas idénticas repetidas', () => {
    const csv = [
      'Fecha;Tipo;Categoría;Concepto;Importe',
      '01/02/2026;Gasto;Ocio;Cine;12,50',
      '01/02/2026;Gasto;Ocio;Cine;12,50',
      '02/02/2026;Gasto;Ocio;Cine;12,50',
    ].join('\n')
    const parsed = parseCsv(csv)
    const cols = detectColumns(parsed.headers)!
    const { rows } = buildImportRows(parsed, cols)
    const { duplicateIndexes } = markInFileDuplicates(rows)
    expect(duplicateIndexes.has(1)).toBe(true)
    expect(duplicateIndexes.has(0)).toBe(false)
    expect(duplicateIndexes.has(2)).toBe(false)
  })
})
