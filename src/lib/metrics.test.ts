import { describe, expect, it } from 'vitest'
import {
  OTHERS_ID,
  budgetVsActual,
  expenseSeries,
  expenseTrends,
  monthlyConsumo,
  monthsToTarget,
  netWorthSeries,
  savingsRate,
  shiftMonth,
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

describe('netWorthSeries', () => {
  const assets = new Set(['bank', 'fund'])
  type L = { account_id: string; month: string; cents: number }

  it('acumula el saldo de las cuentas de activo a fin de cada mes', () => {
    const lines: L[] = [
      { account_id: 'bank', month: '2026-01', cents: 100000 }, // +1000
      { account_id: 'bank', month: '2026-02', cents: -30000 }, // -300
      { account_id: 'fund', month: '2026-03', cents: 50000 }, // +500
    ]
    const s = netWorthSeries(lines, assets, '2026-03')
    expect(s).toEqual([
      { month: '2026-01', cents: 100000 },
      { month: '2026-02', cents: 70000 },
      { month: '2026-03', cents: 120000 },
    ])
  })

  it('mantiene el total anterior en meses sin movimientos (línea plana)', () => {
    const lines: L[] = [{ account_id: 'bank', month: '2026-01', cents: 100000 }]
    const s = netWorthSeries(lines, assets, '2026-03')
    expect(s.map((p) => p.cents)).toEqual([100000, 100000, 100000])
    expect(s.map((p) => p.month)).toEqual(['2026-01', '2026-02', '2026-03'])
  })

  it('ignora las cuentas que no son de activo', () => {
    const lines: L[] = [
      { account_id: 'bank', month: '2026-01', cents: 100000 },
      { account_id: 'ocio', month: '2026-01', cents: 20000 }, // gasto, no activo
    ]
    const s = netWorthSeries(lines, assets, '2026-01')
    expect(s).toEqual([{ month: '2026-01', cents: 100000 }])
  })

  it('cruza el salto de año de diciembre a enero', () => {
    const lines: L[] = [{ account_id: 'bank', month: '2025-12', cents: 100000 }]
    const s = netWorthSeries(lines, assets, '2026-02')
    expect(s.map((p) => p.month)).toEqual(['2025-12', '2026-01', '2026-02'])
    expect(s.map((p) => p.cents)).toEqual([100000, 100000, 100000])
  })

  it('serie vacía si no hay líneas de activo', () => {
    expect(netWorthSeries([], assets, '2026-03')).toEqual([])
  })
})

describe('budgetVsActual', () => {
  const acc = (name: string, type: 'expense' | 'asset' | 'income', over = {}) => ({
    name,
    type,
    is_budget_bucket: true,
    is_archived: false,
    ...over,
  })
  const accountsById = new Map([
    ['nec', acc('Necesidades', 'expense')],
    ['ocio', acc('Ocio', 'expense')],
    ['extra', acc('Extra', 'expense')],
    ['inv', acc('Inversión', 'asset')],
    ['fondo', acc('Fondo', 'asset')],
    ['coche', acc('Coche', 'asset')],
    ['arch', acc('Archivada', 'expense', { is_archived: true })],
    ['nob', acc('No bucket', 'expense', { is_budget_bucket: false })],
  ])
  // Base 2000 €: nec 20 % = 400 €, ocio 15 % = 300 €, extra 5 % = 100 €,
  // inv 30 % = 600 €, fondo 20 % = 400 €, coche 10 % = 200 €.
  const allocations = [
    { account_id: 'nec', percent: 20 },
    { account_id: 'ocio', percent: 15 },
    { account_id: 'extra', percent: 5 },
    { account_id: 'inv', percent: 30 },
    { account_id: 'fondo', percent: 20 },
    { account_id: 'coche', percent: 10 },
    { account_id: 'arch', percent: 0 },
    { account_id: 'nob', percent: 0 },
  ]
  const totals: MT[] = [
    mt({ account_id: 'nec', type: 'expense', total_cents: 10000 }), // 100 € de 400 € → ok
    mt({ account_id: 'ocio', type: 'expense', total_cents: 27000 }), // 270 € de 300 € → near
    mt({ account_id: 'extra', type: 'expense', total_cents: 12000 }), // 120 € de 100 € → over
    mt({ account_id: 'inv', type: 'asset', total_cents: 60000 }), // 600 € de 600 € → done
    mt({ account_id: 'fondo', type: 'asset', total_cents: 10000 }), // 100 € de 400 € → pending
    mt({ account_id: 'coche', type: 'asset', total_cents: -5000 }), // retirada → 0 %
    mt({ month: '2026-05', account_id: 'nec', type: 'expense', total_cents: 99999 }), // otro mes
  ]
  const rows = budgetVsActual({ allocations, accountsById, totals, month: '2026-06', baseCents: 200000 })
  const byId = Object.fromEntries(rows.map((r) => [r.accountId, r]))

  it('calcula asignado y real del mes', () => {
    expect(byId.nec).toMatchObject({ budgetCents: 40000, actualCents: 10000, status: 'ok' })
  })
  it('estados de gasto: near entre 80 y 100 %, over al pasarse', () => {
    expect(byId.ocio?.status).toBe('near')
    expect(byId.extra?.status).toBe('over')
    expect(byId.extra?.ratio).toBeCloseTo(1.2)
  })
  it('estados de ahorro: done al llegar, pending si falta, 0 % con salida neta', () => {
    expect(byId.inv?.status).toBe('done')
    expect(byId.fondo?.status).toBe('pending')
    expect(byId.coche).toMatchObject({ ratio: 0, status: 'pending', actualCents: -5000 })
  })
  it('ignora buckets archivados o que no son bucket', () => {
    expect(byId.arch).toBeUndefined()
    expect(byId.nob).toBeUndefined()
  })
  it('ordena gasto primero y por % descendente', () => {
    expect(rows.map((r) => r.accountId)).toEqual(['nec', 'ocio', 'extra', 'inv', 'fondo', 'coche'])
  })
  it('con base 0 el asignado es 0', () => {
    const r = budgetVsActual({ allocations, accountsById, totals, month: '2026-06', baseCents: 0 })
    expect(r.every((x) => x.budgetCents === 0)).toBe(true)
    expect(r.find((x) => x.accountId === 'nec')?.status).toBe('over')
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

describe('shiftMonth', () => {
  it('cruza el cambio de año en ambos sentidos', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2025-12', 1)).toBe('2026-01')
    expect(shiftMonth('2026-03', -14)).toBe('2025-01')
    expect(shiftMonth('2026-03', 0)).toBe('2026-03')
  })
})

describe('expenseTrends', () => {
  const ocio = (month: string, total_cents: number) =>
    mt({ month, account_id: 'ocio', name: 'Ocio', total_cents })
  const comida = (month: string, total_cents: number) =>
    mt({ month, account_id: 'comida', name: 'Comida', total_cents })

  it('compara con el mes anterior y con la media de los meses previos', () => {
    const data = [ocio('2026-03', 10000), ocio('2026-04', 20000), ocio('2026-05', 40000)]
    const [row] = expenseTrends(data, '2026-05')
    expect(row).toMatchObject({
      accountId: 'ocio',
      cents: 40000,
      prevCents: 20000,
      vsPrev: 1, // +100 %
      avgCents: 15000, // media de marzo y abril (los meses previos con datos)
    })
    expect(row!.vsAvg).toBeCloseTo((40000 - 15000) / 15000)
  })

  it('la media solo cuenta los meses desde el primero con datos', () => {
    // La app empieza en marzo: enero y febrero no son «meses sin gasto».
    const data = [comida('2026-03', 30000), comida('2026-04', 30000)]
    expect(expenseTrends(data, '2026-04')[0]!.avgCents).toBe(30000)
  })

  it('la media usa como mucho `window` meses', () => {
    const data = [ocio('2025-01', 999999), ocio('2025-06', 1000), ocio('2026-06', 2000)]
    // ventana de 12 meses antes de 2026-06: de 2025-06 a 2026-05 (2025-01 queda fuera)
    expect(expenseTrends(data, '2026-06', 12)[0]!.avgCents).toBe(Math.round(1000 / 12))
  })

  it('sin gasto el mes anterior o sin historial no hay variación', () => {
    const [row] = expenseTrends([ocio('2026-05', 5000)], '2026-05')
    expect(row).toMatchObject({ prevCents: 0, vsPrev: null, avgCents: null, vsAvg: null })
  })

  it('una categoría que antes no se gastaba cuenta como 0 en la media', () => {
    const data = [comida('2026-03', 100), ocio('2026-05', 6000), comida('2026-05', 100)]
    const ocioRow = expenseTrends(data, '2026-05').find((r) => r.accountId === 'ocio')!
    expect(ocioRow.avgCents).toBe(0)
    expect(ocioRow.vsAvg).toBeNull() // media 0: no hay base
  })

  it('solo incluye gastos del mes, ordenados de mayor a menor, e ignora ingresos', () => {
    const data = [
      ocio('2026-05', 1000),
      comida('2026-05', 5000),
      comida('2026-04', 1),
      mt({ month: '2026-05', type: 'income', account_id: 'trabajo', total_cents: -90000 }),
      ocio('2026-04', 700),
    ]
    expect(expenseTrends(data, '2026-05').map((r) => r.accountId)).toEqual(['comida', 'ocio'])
    expect(expenseTrends(data, '2026-06')).toEqual([])
  })
})

describe('expenseSeries', () => {
  const g = (month: string, account_id: string, total_cents: number) =>
    mt({ month, account_id, name: account_id, total_cents })

  it('devuelve `count` meses terminando en endMonth, rellenando con 0', () => {
    const s = expenseSeries([g('2026-05', 'a', 100)], '2026-05', 3)
    expect(s.months).toEqual(['2026-03', '2026-04', '2026-05'])
    expect(s.categories).toEqual([{ accountId: 'a', name: 'a', values: [0, 0, 100] }])
  })

  it('agrupa en «Otras» lo que no entra en el top, ordenado por gasto total', () => {
    const data = [
      g('2026-05', 'a', 500),
      g('2026-05', 'b', 400),
      g('2026-05', 'c', 300),
      g('2026-04', 'c', 50),
      g('2026-05', 'd', 10),
    ]
    const s = expenseSeries(data, '2026-05', 2, 2)
    expect(s.categories.map((c) => c.accountId)).toEqual(['a', 'b', OTHERS_ID])
    expect(s.categories[2]).toMatchObject({ name: 'Otras', values: [50, 310] })
  })

  it('no añade «Otras» si no sobra nada y excluye meses fuera de la ventana', () => {
    const s = expenseSeries([g('2025-01', 'a', 100), g('2026-05', 'b', 100)], '2026-05', 3)
    expect(s.categories.map((c) => c.accountId)).toEqual(['b'])
  })
})
