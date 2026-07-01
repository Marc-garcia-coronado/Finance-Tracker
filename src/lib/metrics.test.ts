import { describe, expect, it } from 'vitest'
import {
  monthlyConsumo,
  monthsToTarget,
  savingsRate,
  yearConsumo,
  type MonthlyTotalRow,
} from './metrics'

type MT = MonthlyTotalRow

const mt = (over: Partial<MT>): MT => ({
  month: '2026-06',
  account_id: 'a',
  name: 'x',
  type: 'expense',
  total_cents: 0,
  ...over,
})

const totals: MT[] = [
  mt({ month: '2026-06', type: 'income', total_cents: -200000 }), // ingreso 2000€
  mt({ month: '2026-06', type: 'expense', total_cents: 50000 }), // gasto 500€
  mt({ month: '2026-06', type: 'asset', total_cents: 150000 }), // traspaso: se ignora
  mt({ month: '2026-05', type: 'income', total_cents: -100000 }),
  mt({ month: '2026-05', type: 'expense', total_cents: 40000 }),
]

describe('monthlyConsumo', () => {
  it('separa ingresos y gastos e ignora traspasos (asset)', () => {
    const c = monthlyConsumo(totals, '2026-06')
    expect(c.incomeCents).toBe(200000)
    expect(c.expenseCents).toBe(50000)
    expect(c.netCents).toBe(150000)
  })
})

describe('yearConsumo', () => {
  it('acumula todos los meses del año', () => {
    const c = yearConsumo(totals, 2026)
    expect(c.incomeCents).toBe(300000)
    expect(c.expenseCents).toBe(90000)
    expect(c.netCents).toBe(210000)
  })
})

describe('savingsRate', () => {
  it('flujo neto / ingresos', () => {
    expect(savingsRate({ incomeCents: 200000, expenseCents: 50000, netCents: 150000 })).toBeCloseTo(0.75)
  })
  it('0 si no hay ingresos', () => {
    expect(savingsRate({ incomeCents: 0, expenseCents: 100, netCents: -100 })).toBe(0)
  })
})

describe('monthsToTarget', () => {
  it('redondea hacia arriba', () => {
    expect(monthsToTarget(100000, 30000)).toBe(4)
  })
  it('0 si ya está cubierto', () => {
    expect(monthsToTarget(0, 30000)).toBe(0)
  })
  it('null si el ritmo es 0', () => {
    expect(monthsToTarget(100000, 0)).toBeNull()
  })
})
