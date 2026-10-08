import { describe, expect, it } from 'vitest'
import { A, buildDemoData } from './demoData'

const TODAY = '2026-10-08'

describe('buildDemoData', () => {
  const data = buildDemoData(TODAY)

  it('es determinista para la misma fecha', () => {
    expect(buildDemoData(TODAY)).toEqual(data)
  })

  it('cada movimiento tiene dos líneas que suman 0, en céntimos enteros', () => {
    for (const e of data.entries) {
      expect(e.lines).toHaveLength(2)
      expect(e.lines[0]!.amount_cents + e.lines[1]!.amount_cents).toBe(0)
      for (const l of e.lines) {
        expect(Number.isInteger(l.amount_cents)).toBe(true)
        expect(l.amount_cents).not.toBe(0)
      }
    }
  })

  it('no hay ids repetidos y todas las cuentas referenciadas existen', () => {
    const entryIds = data.entries.map((e) => e.id)
    expect(new Set(entryIds).size).toBe(entryIds.length)
    const accountIds = new Set(data.accounts.map((a) => a.id))
    expect(accountIds.size).toBe(data.accounts.length)
    for (const e of data.entries) for (const l of e.lines) expect(accountIds.has(l.account_id)).toBe(true)
    for (const a of data.allocations) expect(accountIds.has(a.account_id)).toBe(true)
    for (const g of data.goals) expect(accountIds.has(g.linked_account_id!)).toBe(true)
    for (const r of data.recurring) {
      expect(accountIds.has(r.from_account_id)).toBe(true)
      expect(accountIds.has(r.to_account_id)).toBe(true)
    }
    for (const a of data.accounts) if (a.parent_id) expect(accountIds.has(a.parent_id)).toBe(true)
  })

  it('cubre los últimos 12 meses y no tiene movimientos futuros', () => {
    const months = new Set(data.entries.map((e) => e.occurred_on.slice(0, 7)))
    expect(months.size).toBe(12)
    expect(data.entries.every((e) => e.occurred_on <= TODAY)).toBe(true)
    expect(months.has('2025-11')).toBe(true)
    expect(months.has('2026-10')).toBe(true)
  })

  it('incluye un movimiento anulado con su inverso', () => {
    const voided = data.entries.filter((e) => e.voided_at)
    expect(voided).toHaveLength(1)
    const inverse = data.entries.find((e) => e.voids_entry_id === voided[0]!.id)
    expect(inverse).toBeDefined()
    expect(inverse!.lines.map((l) => l.amount_cents)).toEqual(voided[0]!.lines.map((l) => -l.amount_cents))
  })

  it('la cuenta corriente no se queda en negativo', () => {
    const balance = data.entries.reduce(
      (sum, e) => sum + e.lines.filter((l) => l.account_id === A.checking).reduce((s, l) => s + l.amount_cents, 0),
      0,
    )
    expect(balance).toBeGreaterThan(0)
  })

  it('las asignaciones suman 100 %', () => {
    expect(data.allocations.reduce((s, a) => s + a.percent, 0)).toBe(100)
  })

  it('los recurrentes no tienen la próxima ejecución en el pasado', () => {
    for (const r of data.recurring) expect(r.next_run_on >= TODAY).toBe(true)
  })
})
