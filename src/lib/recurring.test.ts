import { beforeEach, describe, expect, it, vi } from 'vitest'

// Supabase simulado en memoria: solo lo que usa recurring.ts. Los builders son
// "thenables" que resuelven con los datos de la tabla; create_entry añade el
// movimiento a `db.entries` para que una segunda ejecución lo vea.
type Line = { account_id: string; amount_enc: string }
type EntryRow = {
  occurred_on: string
  kind: string
  voided_at: string | null
  entry_lines: { account_id: string; amount_enc: string; amount_cents: null }[]
}

const db = vi.hoisted(() => ({
  templates: [] as Record<string, unknown>[],
  entries: [] as unknown[],
  rpcCalls: [] as { fn: string; args: Record<string, unknown> }[],
  updates: [] as { table: string; payload: unknown; id: unknown }[],
}))

vi.mock('./supabase', () => {
  function builder(table: string) {
    let from = 0
    let to = Infinity
    let updatePayload: unknown
    let eqId: unknown
    const b: Record<string, unknown> = {
      select: () => b,
      gte: () => b,
      lt: () => b,
      order: () => b,
      eq: (col: string, val: unknown) => {
        if (col === 'id') eqId = val
        return b
      },
      update: (payload: unknown) => {
        updatePayload = payload
        return b
      },
      range: (f: number, t: number) => {
        from = f
        to = t
        return b
      },
      then: (resolve: (v: unknown) => unknown) => {
        if (updatePayload !== undefined) {
          db.updates.push({ table, payload: updatePayload, id: eqId })
          return resolve({ data: null, error: null })
        }
        const rows = table === 'recurring_templates' ? db.templates : db.entries
        return resolve({ data: rows.slice(from, to + 1), error: null })
      },
    }
    return b
  }
  return {
    supabase: {
      from: (table: string) => builder(table),
      rpc: (fn: string, args: Record<string, unknown>) => {
        db.rpcCalls.push({ fn, args })
        const lines = args.p_lines as Line[]
        db.entries.push({
          occurred_on: args.p_occurred_on as string,
          kind: args.p_kind as string,
          voided_at: null,
          entry_lines: lines.map((l) => ({ ...l, amount_cents: null })),
        } satisfies EntryRow)
        return Promise.resolve({ data: 'new-id', error: null })
      },
    },
  }
})

// El "cifrado" es la identidad sobre el número: lo que se prueba es la lógica.
vi.mock('./crypto/session', () => ({ requireSessionKey: () => ({}) as CryptoKey }))
vi.mock('./crypto/webcrypto', () => ({
  decryptCents: async (_k: CryptoKey, enc: string) => Number(enc),
  encryptCents: async (_k: CryptoKey, cents: number) => String(cents),
}))

import { generatePendingRecurring, generateRecurringForMonth } from './recurring'

const template = (over: Record<string, unknown> = {}) => ({
  id: 't1',
  kind: 'expense',
  cadence: 'monthly',
  day_of_month: 5,
  next_run_on: '2026-03-05',
  amount_enc: '1500',
  amount_cents: null,
  description: 'enc-desc',
  from_account_id: 'banco',
  to_account_id: 'ocio',
  is_active: true,
  ...over,
})

const existingEntry = (over: Partial<EntryRow> = {}): EntryRow => ({
  occurred_on: '2026-03-05',
  kind: 'expense',
  voided_at: null,
  entry_lines: [
    { account_id: 'banco', amount_enc: '-1500', amount_cents: null },
    { account_id: 'ocio', amount_enc: '1500', amount_cents: null },
  ],
  ...over,
})

beforeEach(() => {
  db.templates = []
  db.entries = []
  db.rpcCalls = []
  db.updates = []
})

describe('generateRecurringForMonth', () => {
  it('mes sin plantillas: no crea nada', async () => {
    expect(await generateRecurringForMonth('2026-03')).toEqual({ created: 0, skipped: 0 })
    expect(db.rpcCalls).toHaveLength(0)
  })

  it('crea el movimiento con las líneas origen -importe y destino +importe', async () => {
    db.templates = [template()]
    expect(await generateRecurringForMonth('2026-03')).toEqual({ created: 1, skipped: 0 })
    const call = db.rpcCalls[0]!
    expect(call.fn).toBe('create_entry')
    expect(call.args.p_occurred_on).toBe('2026-03-05')
    expect(call.args.p_kind).toBe('expense')
    expect(call.args.p_lines).toEqual([
      { account_id: 'banco', amount_enc: '-1500' },
      { account_id: 'ocio', amount_enc: '1500' },
    ])
  })

  it('limita el día del mes a 28', async () => {
    db.templates = [template({ day_of_month: 31 })]
    await generateRecurringForMonth('2026-02')
    expect(db.rpcCalls[0]!.args.p_occurred_on).toBe('2026-02-28')
  })

  it('es idempotente: la segunda ejecución no duplica', async () => {
    db.templates = [template()]
    await generateRecurringForMonth('2026-03')
    expect(await generateRecurringForMonth('2026-03')).toEqual({ created: 0, skipped: 1 })
    expect(db.rpcCalls).toHaveLength(1)
  })

  it('no duplica un movimiento equivalente que ya existía', async () => {
    db.templates = [template()]
    db.entries = [existingEntry()]
    expect(await generateRecurringForMonth('2026-03')).toEqual({ created: 0, skipped: 1 })
  })

  it('un movimiento anulado no cuenta como existente al generar manualmente', async () => {
    db.templates = [template()]
    db.entries = [existingEntry({ voided_at: '2026-03-06' })]
    expect(await generateRecurringForMonth('2026-03')).toEqual({ created: 1, skipped: 0 })
  })

  it('las anuales solo se generan en el mes de su next_run_on', async () => {
    db.templates = [template({ cadence: 'annual', next_run_on: '2026-03-15' })]
    expect(await generateRecurringForMonth('2026-05')).toEqual({ created: 0, skipped: 0 })
    expect(db.rpcCalls).toHaveLength(0)
    expect(await generateRecurringForMonth('2026-03')).toEqual({ created: 1, skipped: 0 })
  })

  it('dos plantillas iguales el mismo día: la segunda se considera ya generada', async () => {
    db.templates = [template({ id: 'a' }), template({ id: 'b' })]
    expect(await generateRecurringForMonth('2026-03')).toEqual({ created: 1, skipped: 1 })
  })
})

describe('generatePendingRecurring', () => {
  it('sin fechas pendientes no crea nada ni toca la plantilla', async () => {
    db.templates = [template({ next_run_on: '2026-04-05' })]
    expect(await generatePendingRecurring('2026-03-20')).toEqual({ created: 0 })
    expect(db.updates).toHaveLength(0)
  })

  it('genera los meses atrasados y avanza next_run_on', async () => {
    db.templates = [template({ next_run_on: '2026-01-05' })]
    const res = await generatePendingRecurring('2026-03-20')
    expect(res).toEqual({ created: 3 })
    expect(db.rpcCalls.map((c) => c.args.p_occurred_on)).toEqual([
      '2026-01-05',
      '2026-02-05',
      '2026-03-05',
    ])
    expect(db.updates).toEqual([
      { table: 'recurring_templates', payload: { next_run_on: '2026-04-05' }, id: 't1' },
    ])
  })

  it('es idempotente: no recrea lo ya generado', async () => {
    db.templates = [template({ next_run_on: '2026-03-05' })]
    db.entries = [existingEntry()]
    expect(await generatePendingRecurring('2026-03-20')).toEqual({ created: 0 })
  })

  it('no recrea un recurrente que se anuló a propósito, pero sí avanza la plantilla', async () => {
    db.templates = [template({ next_run_on: '2026-03-05' })]
    db.entries = [existingEntry({ voided_at: '2026-03-06' })]
    expect(await generatePendingRecurring('2026-03-20')).toEqual({ created: 0 })
    expect(db.updates).toHaveLength(1)
  })
})
