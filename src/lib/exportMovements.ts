// ---------------------------------------------------------------------------
// Exportación de movimientos a CSV. Función pura. Mismo formato que acepta el
// importador (importMovements.ts) para poder reimportarlo:
//   Fecha;Tipo;Categoría;Cuenta;Concepto;Importe (€)
// Categoría/Cuenta siguen la convención del importador:
//   Gasto    -> Categoría = categoría de gasto (destino), Cuenta = origen
//   Ingreso  -> Categoría = origen del ingreso,          Cuenta = destino
//   Traspaso -> Categoría = cuenta destino,              Cuenta = origen
//   Ajuste   -> Categoría = contrapartida,               Cuenta = cuenta de activo ajustada
// El importe va siempre en positivo. Los anulados y sus anulaciones se
// excluyen: se cancelan entre sí y reimportados parecerían vigentes.
// ---------------------------------------------------------------------------
import { format, parseISO } from 'date-fns'
import { toCsv } from './csv'
import { centsToInput } from './entryForm'

export const EXPORT_HEADERS = ['Fecha', 'Tipo', 'Categoría', 'Cuenta', 'Concepto', 'Importe (€)']

const KIND_TEXT: Record<string, string> = {
  expense: 'Gasto',
  income: 'Ingreso',
  transfer: 'Traspaso',
  adjustment: 'Ajuste',
}

export type ExportAccount = { name: string; type: string }

export type ExportableEntry = {
  occurred_on: string
  kind: string
  description: string
  voided_at: string | null
  voids_entry_id: string | null
  entry_lines: { account_id: string; amount_cents: number }[]
}

export function entryToCsvRow(e: ExportableEntry, accounts: Map<string, ExportAccount>): string[] {
  const name = (id: string | undefined) => (id ? (accounts.get(id)?.name ?? '') : '')
  const pos = e.entry_lines.find((l) => l.amount_cents > 0)
  const neg = e.entry_lines.find((l) => l.amount_cents < 0)
  const amount = pos?.amount_cents ?? 0

  let categoria: string
  let cuenta: string
  if (e.kind === 'income') {
    categoria = name(neg?.account_id)
    cuenta = name(pos?.account_id)
  } else if (e.kind === 'adjustment') {
    const asset = e.entry_lines.find((l) => accounts.get(l.account_id)?.type === 'asset')
    const other = e.entry_lines.find((l) => l !== asset)
    categoria = name(other?.account_id)
    cuenta = name(asset?.account_id)
  } else {
    categoria = name(pos?.account_id)
    cuenta = name(neg?.account_id)
  }

  return [
    format(parseISO(e.occurred_on), 'dd/MM/yyyy'),
    KIND_TEXT[e.kind] ?? e.kind,
    categoria,
    cuenta,
    e.description,
    centsToInput(amount),
  ]
}

export function entriesToCsv(entries: ExportableEntry[], accounts: Map<string, ExportAccount>): string {
  const rows = entries
    .filter((e) => !e.voided_at && !e.voids_entry_id)
    .map((e) => entryToCsvRow(e, accounts))
  return toCsv(EXPORT_HEADERS, rows)
}
