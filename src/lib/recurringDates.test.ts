import { describe, expect, it } from 'vitest'
import { pendingDates } from './recurringDates'

const monthly = (next_run_on: string, day_of_month: number) =>
  ({ cadence: 'monthly', day_of_month, next_run_on }) as const
const annual = (next_run_on: string, day_of_month: number) =>
  ({ cadence: 'annual', day_of_month, next_run_on }) as const

describe('pendingDates', () => {
  it('mensual: si el día ya pasó en el mes de next_run_on, empieza el mes siguiente', () => {
    expect(pendingDates(monthly('2026-07-10', 1), '2026-07-20')).toEqual({
      dates: [],
      nextRunOn: '2026-08-01',
    })
  })

  it('mensual: genera los meses atrasados hasta hoy, incluido hoy', () => {
    expect(pendingDates(monthly('2026-07-10', 1), '2026-09-30')).toEqual({
      dates: ['2026-08-01', '2026-09-01'],
      nextRunOn: '2026-10-01',
    })
  })

  it('mensual: el día se limita a 28', () => {
    expect(pendingDates(monthly('2026-09-01', 30), '2026-09-30')).toEqual({
      dates: ['2026-09-28'],
      nextRunOn: '2026-10-28',
    })
  })

  it('mensual: no genera fechas futuras del mes actual', () => {
    expect(pendingDates(monthly('2026-09-01', 15), '2026-09-10')).toEqual({
      dates: [],
      nextRunOn: '2026-09-15',
    })
  })

  it('pasa de diciembre a enero', () => {
    expect(pendingDates(monthly('2026-12-01', 5), '2027-02-10')).toEqual({
      dates: ['2026-12-05', '2027-01-05', '2027-02-05'],
      nextRunOn: '2027-03-05',
    })
  })

  it('anual: solo en su mes y avanza un año', () => {
    expect(pendingDates(annual('2025-03-01', 10), '2026-09-30')).toEqual({
      dates: ['2025-03-10', '2026-03-10'],
      nextRunOn: '2027-03-10',
    })
    expect(pendingDates(annual('2026-03-20', 10), '2026-09-30')).toEqual({
      dates: [],
      nextRunOn: '2027-03-10',
    })
  })

  it('next_run_on futuro: no genera nada y mantiene la fecha', () => {
    expect(pendingDates(monthly('2026-11-01', 1), '2026-09-30')).toEqual({
      dates: [],
      nextRunOn: '2026-11-01',
    })
  })

  it('limita las fechas por llamada y deja el resto para la siguiente', () => {
    const r = pendingDates(monthly('2020-01-01', 1), '2026-09-30', 24)
    expect(r.dates).toHaveLength(24)
    expect(r.dates[23]).toBe('2021-12-01')
    expect(r.nextRunOn).toBe('2022-01-01')
  })
})
