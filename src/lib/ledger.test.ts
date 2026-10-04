import { describe, expect, it } from 'vitest'
import {
  accountIdsWithMovements,
  balancesFromLedger,
  liveLedgerLines,
  monthlyTotalsFromLedger,
  netWorthFromLedger,
  transferNetByAccount,
  type EntryLineRow,
  type EntryRow,
  type Ledger,
  type LedgerLine,
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

describe('liveLedgerLines', () => {
  const decrypt = async (enc: string) => Number(enc)
  const entries: EntryRow[] = [
    { id: 'e1', occurred_on: '2026-01-10', kind: 'expense', voided_at: null, voids_entry_id: null },
    // e2 se anuló: el original (voided_at) y su inverso (voids_entry_id) no cuentan.
    { id: 'e2', occurred_on: '2026-01-11', kind: 'expense', voided_at: '2026-01-12', voids_entry_id: null },
    { id: 'e2v', occurred_on: '2026-01-12', kind: 'expense', voided_at: null, voids_entry_id: 'e2' },
    { id: 'e3', occurred_on: '2026-02-01', kind: 'adjustment', voided_at: null, voids_entry_id: null },
  ]
  const line = (entry_id: string, account_id: string, cents: number): EntryLineRow => ({
    entry_id,
    account_id,
    amount_enc: String(cents),
    amount_cents: null,
  })
  const lines: EntryLineRow[] = [
    line('e1', 'cc', -5000),
    line('e1', 'ocio', 5000),
    line('e2', 'cc', -999),
    line('e2', 'ocio', 999),
    line('e2v', 'cc', 999),
    line('e2v', 'ocio', -999),
    line('e3', 'cc', 10000),
    line('e3', 'aj', -10000),
  ]

  it('excluye el movimiento anulado y su asiento inverso', async () => {
    const live = await liveLedgerLines(entries, lines, decrypt)
    expect(live.map((l) => `${l.account_id}:${l.cents}`)).toEqual([
      'cc:-5000',
      'ocio:5000',
      'cc:10000',
      'aj:-10000',
    ])
  })

  it('tras una anulación, el neto de la categoría de gasto no queda en negativo', async () => {
    const live = await liveLedgerLines(entries, lines, decrypt)
    const balances = balancesFromLedger({ accounts: ledger.accounts, lines: live })
    expect(balances.find((b) => b.account_id === 'ocio')?.balance_cents).toBe(5000)
  })

  it('ignora líneas huérfanas y usa amount_cents en las filas legadas en claro', async () => {
    const live = await liveLedgerLines(
      entries,
      [
        { entry_id: 'nope', account_id: 'cc', amount_enc: '1', amount_cents: null },
        { entry_id: 'e1', account_id: 'cc', amount_enc: null, amount_cents: -700 },
      ],
      decrypt,
    )
    expect(live).toEqual([{ account_id: 'cc', kind: 'expense', month: '2026-01', cents: -700 }])
  })

  it('el mes sale de occurred_on', async () => {
    const live = await liveLedgerLines(entries, [line('e3', 'cc', 1)], decrypt)
    expect(live[0]?.month).toBe('2026-02')
  })
})

describe('ajustes y consumo', () => {
  it('los ajustes cuentan en saldos y patrimonio pero no en los totales mensuales', () => {
    const lines: LedgerLine[] = [
      { account_id: 'cc', kind: 'adjustment', month: '2026-03', cents: 10000 },
      { account_id: 'aj', kind: 'adjustment', month: '2026-03', cents: -10000 },
    ]
    const l: Ledger = { accounts: ledger.accounts, lines }
    expect(monthlyTotalsFromLedger(l)).toEqual([])
    expect(balancesFromLedger(l).find((b) => b.account_id === 'cc')?.balance_cents).toBe(10000)
    expect(netWorthFromLedger(l).at(-1)?.cents).toBe(10000)
  })
})

describe('transferNetByAccount', () => {
  const l = (account_id: string, kind: LedgerLine['kind'], month: string, cents: number): LedgerLine => ({
    account_id,
    kind,
    month,
    cents,
  })
  const lines: LedgerLine[] = [
    l('ahorro', 'transfer', '2026-05', 20000), // aportación
    l('cc', 'transfer', '2026-05', -20000),
    l('ahorro', 'transfer', '2026-05', -5000), // retirada
    l('ahorro', 'income', '2026-05', 99900), // un ingreso directo no es aportación
    l('ahorro', 'transfer', '2026-04', 7000), // otro mes
    l('ahorro', 'adjustment', '2026-05', 1234), // un ajuste tampoco
  ]

  it('suma solo los traspasos del mes (recibido - retirado)', () => {
    const m = transferNetByAccount({ accounts: ledger.accounts, lines }, '2026-05')
    expect(m.get('ahorro')).toBe(15000)
    expect(m.get('cc')).toBe(-20000)
  })

  it('sin traspasos ese mes: vacío', () => {
    expect(transferNetByAccount({ accounts: ledger.accounts, lines }, '2026-06').size).toBe(0)
  })
})
