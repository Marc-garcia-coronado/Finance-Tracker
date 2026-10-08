import { beforeEach, describe, expect, it } from 'vitest'
import { balancesFromLedger, monthlyTotalsFromLedger } from '../ledger'
import { A } from './demoData'
import {
  demoAllEntries,
  demoCreateEntry,
  demoEntriesPage,
  demoLedger,
  demoRead,
  demoReplaceEntry,
  demoVoidEntry,
  getDemoData,
  resetDemoStore,
} from './demoStore'

const TODAY = '2026-10-08'
const ALL = { month: 'all', kind: 'all', accountId: 'all', hideVoided: false } as const

async function checkingBalance(): Promise<number> {
  const b = balancesFromLedger(await demoLedger()).find((x) => x.account_id === A.checking)
  return b!.balance_cents
}

beforeEach(() => resetDemoStore(TODAY))

describe('lecturas', () => {
  it('filtra por mes, tipo, cuenta y anulados', () => {
    const month = demoAllEntries({ ...ALL, month: '2026-09' })
    expect(month.length).toBeGreaterThan(10)
    expect(month.every((e) => e.occurred_on.startsWith('2026-09'))).toBe(true)

    const transfers = demoAllEntries({ ...ALL, kind: 'transfer' })
    expect(transfers.every((e) => e.kind === 'transfer')).toBe(true)

    const cash = demoAllEntries({ ...ALL, accountId: A.cash })
    expect(cash.length).toBeGreaterThan(0)
    expect(cash.every((e) => e.entry_lines.some((l) => l.account_id === A.cash))).toBe(true)

    const all = demoAllEntries(ALL)
    const visible = demoAllEntries({ ...ALL, hideVoided: true })
    expect(visible.length).toBe(all.length - 2) // el anulado y su inverso
  })

  it('ordena por fecha descendente y pagina', () => {
    const all = demoAllEntries(ALL)
    for (let i = 1; i < all.length; i++) {
      expect(all[i - 1]!.occurred_on >= all[i]!.occurred_on).toBe(true)
    }
    const p0 = demoEntriesPage({ ...ALL, page: 0, pageSize: 20 })
    const p1 = demoEntriesPage({ ...ALL, page: 1, pageSize: 20 })
    expect(p0.count).toBe(all.length)
    expect(p0.rows).toHaveLength(20)
    expect(p1.rows[0]!.id).toBe(all[20]!.id)
  })

  it('demoRead responde a cada clave de query y rechaza las desconocidas', async () => {
    expect(await demoRead(['accounts'])).toHaveLength(getDemoData().accounts.length)
    expect(await demoRead(['settings'])).toMatchObject({ estimated_monthly_income_cents: 185000 })
    expect((await demoRead(['allocations'])) as unknown[]).toHaveLength(4)
    expect((await demoRead(['goals'])) as unknown[]).toHaveLength(3)
    expect((await demoRead(['recurring'])) as unknown[]).toHaveLength(5)
    expect(await demoRead(['ledger'])).toHaveProperty('lines')
    expect(await demoRead(['entries', { ...ALL, page: 0, pageSize: 5 }])).toHaveProperty('count')
    expect(await demoRead(['entries', 'search', ALL])).toBeInstanceOf(Array)
    await expect(demoRead(['otra'])).rejects.toThrow()
  })

  it('el ledger excluye el anulado y su inverso', async () => {
    const ledger = await demoLedger()
    const data = getDemoData()
    const live = data.entries.filter((e) => !e.voided_at && !e.voids_entry_id).length
    expect(ledger.lines).toHaveLength(live * 2)
    const totals = monthlyTotalsFromLedger(ledger)
    expect(totals.length).toBeGreaterThan(0)
  })
})

describe('escrituras en memoria', () => {
  const params = {
    kind: 'expense',
    date: TODAY,
    description: 'Prueba',
    fromAccountId: A.checking,
    toAccountId: A.groceries,
    amountCents: 1234,
  } as const

  it('crear mueve los saldos y aparece el primero de la lista', async () => {
    const before = await checkingBalance()
    const id = demoCreateEntry(params)
    expect(await checkingBalance()).toBe(before - 1234)
    expect(demoEntriesPage({ ...ALL, page: 0, pageSize: 5 }).rows.map((r) => r.id)).toContain(id)
  })

  it('anular crea el inverso y deja el saldo como estaba', async () => {
    const before = await checkingBalance()
    const id = demoCreateEntry(params)
    demoVoidEntry(id)
    expect(await checkingBalance()).toBe(before)
    const original = getDemoData().entries.find((e) => e.id === id)!
    expect(original.voided_at).not.toBeNull()
    expect(() => demoVoidEntry(id)).toThrow('ya está anulado')
  })

  it('editar anula el original y crea el corregido', async () => {
    const before = await checkingBalance()
    const id = demoCreateEntry(params)
    const newId = demoReplaceEntry(id, { ...params, amountCents: 2000 })
    expect(newId).not.toBe(id)
    expect(await checkingBalance()).toBe(before - 2000)
  })

  it('valida igual que el ledger real', () => {
    expect(() => demoCreateEntry({ ...params, amountCents: 0 })).toThrow()
    expect(() => demoCreateEntry({ ...params, amountCents: 1.5 })).toThrow()
    expect(() => demoCreateEntry({ ...params, toAccountId: A.checking })).toThrow('distintas')
    expect(() => demoCreateEntry({ ...params, toAccountId: 'no-existe' })).toThrow('Cuenta')
    expect(() => demoVoidEntry('no-existe')).toThrow()
  })

  it('reset restaura los datos de ejemplo', () => {
    const n = getDemoData().entries.length
    demoCreateEntry(params)
    resetDemoStore(TODAY)
    expect(getDemoData().entries).toHaveLength(n)
  })
})
