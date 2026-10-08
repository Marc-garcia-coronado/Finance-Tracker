// Almacén en memoria del modo demo. Hace de «base de datos» ficticia: responde a
// las lecturas de queries.ts (demoRead) y permite crear / anular / editar
// movimientos sobre los datos de ejemplo. Nada de esto toca Supabase ni se
// guarda: al recargar la página o salir del modo demo se regenera.
import { monthRange, todayISO } from '../dates'
import { liveLedgerLines, type EntryLineRow, type EntryRow, type Ledger } from '../ledger'
import type { CreateEntryParams } from '../entries'
import type { EntryQueryFilters, EntryWithLines, EntryFilters } from '../queries'
import { buildDemoData, type DemoData, type DemoEntry } from './demoData'

let data: DemoData = buildDemoData(todayISO())
let counter = 0

// Vuelve a los datos de ejemplo iniciales (al activar / desactivar el modo).
export function resetDemoStore(today: string = todayISO()): void {
  data = buildDemoData(today)
  counter = 0
}

export function getDemoData(): DemoData {
  return data
}

function toEntryWithLines(e: DemoEntry): EntryWithLines {
  return {
    id: e.id,
    occurred_on: e.occurred_on,
    description: e.description,
    kind: e.kind,
    voided_at: e.voided_at,
    voids_entry_id: e.voids_entry_id,
    created_at: e.created_at,
    entry_lines: e.lines.map((l) => ({ ...l })),
  }
}

// Mismo orden que entriesQuery: fecha desc, creación desc, id.
function matching(filters: EntryQueryFilters): EntryWithLines[] {
  const range = filters.month !== 'all' ? monthRange(filters.month) : null
  return data.entries
    .filter((e) => {
      if (range && (e.occurred_on < range.start || e.occurred_on >= range.endExclusive)) return false
      if (filters.kind !== 'all' && e.kind !== filters.kind) return false
      if (filters.accountId !== 'all' && !e.lines.some((l) => l.account_id === filters.accountId)) return false
      if (filters.hideVoided && (e.voided_at || e.voids_entry_id)) return false
      return true
    })
    .sort(
      (a, b) =>
        b.occurred_on.localeCompare(a.occurred_on) ||
        b.created_at.localeCompare(a.created_at) ||
        a.id.localeCompare(b.id),
    )
    .map(toEntryWithLines)
}

export function demoAllEntries(filters: EntryQueryFilters): EntryWithLines[] {
  return matching(filters)
}

export function demoEntriesPage(filters: EntryFilters): { rows: EntryWithLines[]; count: number } {
  const all = matching(filters)
  const from = filters.page * filters.pageSize
  return { rows: all.slice(from, from + filters.pageSize), count: all.length }
}

export async function demoLedger(): Promise<Ledger> {
  const entries: EntryRow[] = data.entries.map((e) => ({
    id: e.id,
    occurred_on: e.occurred_on,
    kind: e.kind,
    voided_at: e.voided_at,
    voids_entry_id: e.voids_entry_id,
  }))
  const lines: EntryLineRow[] = data.entries.flatMap((e) =>
    e.lines.map((l) => ({
      entry_id: e.id,
      account_id: l.account_id,
      amount_enc: null,
      amount_cents: l.amount_cents,
    })),
  )
  const live = await liveLedgerLines(entries, lines, async () => 0) // nunca hay cifrado
  return { accounts: data.accounts.map((a) => ({ id: a.id, name: a.name, type: a.type })), lines: live }
}

// Lecturas por clave de query (ver qk en queries.ts).
export async function demoRead(queryKey: readonly unknown[]): Promise<unknown> {
  const [head, second, third] = queryKey
  switch (head) {
    case 'accounts':
      return [...data.accounts].sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name))
    case 'settings':
      return data.settings
    case 'allocations':
      return data.allocations
    case 'goals':
      return data.goals
    case 'recurring':
      return [...data.recurring].sort((a, b) => a.description.localeCompare(b.description))
    case 'ledger':
      return demoLedger()
    case 'entries':
      if (second === 'search') return demoAllEntries(third as EntryQueryFilters)
      return demoEntriesPage(second as EntryFilters)
    default:
      throw new Error('Consulta no disponible en el modo demo')
  }
}

function nextId(): string {
  counter += 1
  return `demo-new-${String(counter).padStart(4, '0')}`
}

function validate(params: CreateEntryParams): void {
  if (!Number.isInteger(params.amountCents) || params.amountCents <= 0) {
    throw new Error('El importe debe ser un entero de céntimos mayor que 0')
  }
  if (params.fromAccountId === params.toAccountId) throw new Error('Las dos cuentas deben ser distintas')
  const ids = new Set(data.accounts.map((a) => a.id))
  if (!ids.has(params.fromAccountId) || !ids.has(params.toAccountId)) {
    throw new Error('Cuenta no encontrada')
  }
}

export function demoCreateEntry(params: CreateEntryParams): string {
  validate(params)
  const id = nextId()
  data.entries.push({
    id,
    occurred_on: params.date,
    description: params.description,
    kind: params.kind,
    voided_at: null,
    voids_entry_id: null,
    created_at: new Date().toISOString(),
    lines: [
      { account_id: params.fromAccountId, amount_cents: -params.amountCents },
      { account_id: params.toAccountId, amount_cents: params.amountCents },
    ],
  })
  return id
}

export function demoVoidEntry(entryId: string): string {
  const original = data.entries.find((e) => e.id === entryId)
  if (!original) throw new Error('El movimiento no existe')
  if (original.voided_at) throw new Error('El movimiento ya está anulado')
  if (original.voids_entry_id) throw new Error('No se puede anular una anulación')
  const now = new Date().toISOString()
  original.voided_at = now
  const id = nextId()
  data.entries.push({
    id,
    occurred_on: original.occurred_on,
    description: original.description,
    kind: original.kind,
    voided_at: null,
    voids_entry_id: original.id,
    created_at: now,
    lines: original.lines.map((l) => ({ ...l, amount_cents: -l.amount_cents })),
  })
  return id
}

// Editar = anular el original y crear el corregido (como replace_entry).
export function demoReplaceEntry(entryId: string, params: CreateEntryParams): string {
  validate(params)
  demoVoidEntry(entryId)
  return demoCreateEntry(params)
}
