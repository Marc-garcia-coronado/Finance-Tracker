import { describe, expect, it } from 'vitest'
import { parseCsv } from './csv'
import { buildImportRows, detectColumns } from './importMovements'
import { entriesToCsv, entryToCsvRow, type ExportableEntry } from './exportMovements'

const accounts = new Map([
  ['cc', { name: 'Cuenta corriente', type: 'asset' }],
  ['inv', { name: 'Inversión', type: 'asset' }],
  ['ocio', { name: 'Ocio', type: 'expense' }],
  ['trabajo', { name: 'Trabajo', type: 'income' }],
  ['aj', { name: 'Ajustes de valor', type: 'income' }],
])

const e = (kind: string, lines: [string, number][], over: Partial<ExportableEntry> = {}): ExportableEntry => ({
  occurred_on: '2026-09-05',
  kind,
  description: 'x',
  voided_at: null,
  voids_entry_id: null,
  entry_lines: lines.map(([account_id, amount_cents]) => ({ account_id, amount_cents })),
  ...over,
})

describe('entryToCsvRow', () => {
  it('gasto: Categoría = destino, Cuenta = origen', () => {
    expect(entryToCsvRow(e('expense', [['cc', -1250], ['ocio', 1250]], { description: 'Cine' }), accounts)).toEqual([
      '05/09/2026',
      'Gasto',
      'Ocio',
      'Cuenta corriente',
      'Cine',
      '12,50',
    ])
  })

  it('ingreso: Categoría = origen, Cuenta = destino', () => {
    const row = entryToCsvRow(e('income', [['trabajo', -180000], ['cc', 180000]]), accounts)
    expect(row.slice(1, 4)).toEqual(['Ingreso', 'Trabajo', 'Cuenta corriente'])
    expect(row[5]).toBe('1800,00')
  })

  it('traspaso: Categoría = destino, Cuenta = origen', () => {
    const row = entryToCsvRow(e('transfer', [['cc', -20000], ['inv', 20000]]), accounts)
    expect(row.slice(1, 4)).toEqual(['Traspaso', 'Inversión', 'Cuenta corriente'])
  })

  it('ajuste (plusvalía o minusvalía): Cuenta = la de activo, importe en positivo', () => {
    const up = entryToCsvRow(e('adjustment', [['inv', 5000], ['aj', -5000]]), accounts)
    const down = entryToCsvRow(e('adjustment', [['inv', -5000], ['aj', 5000]]), accounts)
    expect(up.slice(1, 4)).toEqual(['Ajuste', 'Ajustes de valor', 'Inversión'])
    expect(down.slice(1, 4)).toEqual(['Ajuste', 'Ajustes de valor', 'Inversión'])
    expect(up[5]).toBe('50,00')
    expect(down[5]).toBe('50,00')
  })
})

describe('entriesToCsv', () => {
  it('excluye anulados y anulaciones', () => {
    const csv = entriesToCsv(
      [
        e('expense', [['cc', -100], ['ocio', 100]], { description: 'vigente' }),
        e('expense', [['cc', -200], ['ocio', 200]], { description: 'anulado', voided_at: '2026-09-06' }),
        e('expense', [['cc', 200], ['ocio', -200]], { description: 'anulación', voids_entry_id: 'y' }),
      ],
      accounts,
    )
    const { rows } = parseCsv(csv)
    expect(rows.map((r) => r[4])).toEqual(['vigente'])
  })

  it('ida y vuelta: lo exportado lo entiende el importador', () => {
    const csv = entriesToCsv(
      [
        e('expense', [['cc', -1250], ['ocio', 1250]], { description: 'Cena; con "amigos"' }),
        e('income', [['trabajo', -180000], ['cc', 180000]], { description: 'Nómina' }),
        e('transfer', [['cc', -20000], ['inv', 20000]], { description: 'Ahorro' }),
      ],
      accounts,
    )
    const parsed = parseCsv(csv)
    const cols = detectColumns(parsed.headers)!
    expect(cols.cuenta).toBeGreaterThanOrEqual(0)
    const { rows } = buildImportRows(parsed, cols)
    expect(rows.map((r) => [r.dateISO, r.kindGuess, r.categoria, r.cuenta, r.concepto, r.amountCents, r.error])).toEqual([
      ['2026-09-05', 'expense', 'Ocio', 'Cuenta corriente', 'Cena; con "amigos"', 1250, null],
      ['2026-09-05', 'income', 'Trabajo', 'Cuenta corriente', 'Nómina', 180000, null],
      ['2026-09-05', 'transfer', 'Inversión', 'Cuenta corriente', 'Ahorro', 20000, null],
    ])
  })
})
