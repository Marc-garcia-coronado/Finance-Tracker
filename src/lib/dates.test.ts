import { describe, expect, it } from 'vitest'
import { dayLabel, groupByDay } from './dates'

describe('dayLabel', () => {
  const today = '2026-10-19'

  it('Hoy y Ayer', () => {
    expect(dayLabel('2026-10-19', today)).toBe('Hoy')
    expect(dayLabel('2026-10-18', today)).toBe('Ayer')
  })

  it('ayer cruza el cambio de mes', () => {
    expect(dayLabel('2026-09-30', '2026-10-01')).toBe('Ayer')
  })

  it('fecha larga sin año en el año actual y con año en otro', () => {
    expect(dayLabel('2026-10-13', today)).toBe('Martes 13 de octubre')
    expect(dayLabel('2025-12-31', today)).toBe('Miércoles 31 de diciembre de 2025')
  })
})

describe('groupByDay', () => {
  it('agrupa filas consecutivas del mismo día conservando el orden', () => {
    const rows = [
      { id: 1, occurred_on: '2026-10-19' },
      { id: 2, occurred_on: '2026-10-19' },
      { id: 3, occurred_on: '2026-10-17' },
    ]
    expect(groupByDay(rows)).toEqual([
      { date: '2026-10-19', rows: [rows[0], rows[1]] },
      { date: '2026-10-17', rows: [rows[2]] },
    ])
  })

  it('lista vacía', () => {
    expect(groupByDay([])).toEqual([])
  })
})
