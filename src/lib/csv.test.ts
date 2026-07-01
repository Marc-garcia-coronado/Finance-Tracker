import { describe, expect, it } from 'vitest'
import { detectDelimiter, parseCsv } from './csv'

describe('detectDelimiter', () => {
  it('detecta ; (Excel español)', () => {
    expect(detectDelimiter('Fecha;Tipo;Importe\n01/01/2026;Gasto;12,50')).toBe(';')
  })
  it('detecta , cuando es el separador', () => {
    expect(detectDelimiter('Fecha,Tipo,Importe\n2026-01-01,Gasto,12.50')).toBe(',')
  })
  it('ignora delimitadores dentro de comillas', () => {
    expect(detectDelimiter('"a;b;c",x\n1,2')).toBe(',')
  })
})

describe('parseCsv', () => {
  it('parsea cabeceras y filas con ;', () => {
    const { headers, rows } = parseCsv('Fecha;Tipo;Importe\n01/01/2026;Gasto;12,50')
    expect(headers).toEqual(['Fecha', 'Tipo', 'Importe'])
    expect(rows).toEqual([['01/01/2026', 'Gasto', '12,50']])
  })

  it('respeta campos entre comillas con el delimitador dentro', () => {
    const { rows } = parseCsv('a,b\n"hola, mundo",2')
    expect(rows[0]).toEqual(['hola, mundo', '2'])
  })

  it('soporta comillas escapadas', () => {
    const { rows } = parseCsv('a,b\n"dice ""hola""",2')
    expect(rows[0]).toEqual(['dice "hola"', '2'])
  })

  it('soporta saltos de línea dentro de comillas', () => {
    const { rows } = parseCsv('a,b\n"linea1\nlinea2",2')
    expect(rows[0]).toEqual(['linea1\nlinea2', '2'])
  })

  it('ignora BOM, CRLF y líneas vacías', () => {
    const { headers, rows } = parseCsv('﻿a;b\r\n1;2\r\n\r\n')
    expect(headers).toEqual(['a', 'b'])
    expect(rows).toEqual([['1', '2']])
  })
})
