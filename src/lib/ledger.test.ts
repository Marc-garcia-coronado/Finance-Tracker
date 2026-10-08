import { describe, expect, it } from 'vitest'
import {
  accountIdsWithMovements,
  balancesFromLedger,
  monthlyTotalsFromLedger,
  netWorthFromLedger,
  type Ledger,
} from './ledger'

// Cuenta corriente (activo), Trabajo (ingreso), Ocio (gasto), Ajustes (contrapartida).
const ledger: Ledger = {
  accounts: [
    { id: 'cc', name: 'Cuenta corriente', type: 'asset' },
    { id: 'trabajo', name: 'Trabajo', type: 'income' },
    { id: 'ocio', name: 'Ocio', type: 'expense' },
    { id: 'aj', name: 'Ajustes de valor', type: 'income' },
    { id: 'vacia', name: 'Sin movimientos', type: 'asset' },
  ],
  lines: [
    // Enero: nómina 2000€ y gasto 50€
    { account_id: 'cc', kind: 'income', month: '2026-01', cents: 200000 },
    { account_id: 'trabajo', kind: 'income', month: '2026-01', cents: -200000 },
    { account_id: 'cc', kind: 'expense', month: '2026-01', cents: -5000 },
    { account_id: 'ocio', kind: 'expense', month: '2026-01', cents: 5000 },
    // Febrero: otro gasto de 30€ y un ajuste (plusvalía) de +100€
    { account_id: 'cc', kind: 'expense', month: '2026-02', cents: -3000 },
    { account_id: 'ocio', kind: 'expense', month: '2026-02', cents: 3000 },
    { account_id: 'cc', kind: 'adjustment', month: '2026-02', cents: 10000 },
    { account_id: 'aj', kind: 'adjustment', month: '2026-02', cents: -10000 },
  ],
}

describe('balancesFromLedger', () => {
  it('suma las líneas por cuenta, ajustes incluidos', () => {
    const byId = Object.fromEntries(balancesFromLedger(ledger).map((b) => [b.account_id, b]))
    expect(byId.cc?.balance_cents).toBe(200000 - 5000 - 3000 + 10000)
    expect(byId.trabajo?.balance_cents).toBe(-200000)
    expect(byId.ocio?.balance_cents).toBe(8000)
    expect(byId.aj?.balance_cents).toBe(-10000)
  })

  it('incluye las cuentas sin líneas a 0', () => {
    const b = balancesFromLedger(ledger).find((x) => x.account_id === 'vacia')
    expect(b).toEqual({ account_id: 'vacia', name: 'Sin movimientos', type: 'asset', balance_cents: 0 })
  })
})

describe('monthlyTotalsFromLedger', () => {
  const totals = monthlyTotalsFromLedger(ledger)
  const get = (month: string, id: string) =>
    totals.find((t) => t.month === month && t.account_id === id)?.total_cents

  it('agrupa por mes y cuenta', () => {
    expect(get('2026-01', 'ocio')).toBe(5000)
    expect(get('2026-02', 'ocio')).toBe(3000)
    expect(get('2026-01', 'trabajo')).toBe(-200000)
    expect(get('2026-02', 'cc')).toBe(-3000)
  })

  it('excluye los ajustes (no son consumo)', () => {
    expect(get('2026-02', 'aj')).toBeUndefined()
  })

  it('lleva el nombre y el tipo de la cuenta', () => {
    const t = totals.find((x) => x.account_id === 'ocio')
    expect(t).toMatchObject({ name: 'Ocio', type: 'expense' })
  })
})

describe('netWorthFromLedger', () => {
  it('acumula solo cuentas de activo e incluye los ajustes', () => {
    expect(netWorthFromLedger(ledger, '2026-03')).toEqual([
      { month: '2026-01', cents: 195000 },
      { month: '2026-02', cents: 202000 },
      { month: '2026-03', cents: 202000 },
    ])
  })
})

describe('accountIdsWithMovements', () => {
  it('incluye las cuentas con líneas y excluye las vacías', () => {
    const ids = accountIdsWithMovements(ledger)
    expect(ids.has('cc')).toBe(true)
    expect(ids.has('ocio')).toBe(true)
    expect(ids.has('vacia')).toBe(false)
  })
})
