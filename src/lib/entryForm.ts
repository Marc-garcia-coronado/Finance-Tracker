// Valores del formulario de movimientos a partir de un movimiento existente
// (modo edición). Función pura. Convención de las líneas: origen = línea
// negativa, destino = línea positiva, importe = valor de la positiva.
import type { EntryKind } from './entries'

export type MovementFormValues = {
  kind: EntryKind
  date: string
  description: string
  amount: string // texto del input, con coma decimal: "12,34"
  fromAccountId: string
  toAccountId: string
}

export type EditableEntry = {
  kind: string
  occurred_on: string
  description: string
  entry_lines: { account_id: string; amount_cents: number }[]
}

export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',')
}

export function isEditableKind(kind: string): kind is EntryKind {
  return kind === 'expense' || kind === 'income' || kind === 'transfer'
}

export function entryToFormValues(entry: EditableEntry): MovementFormValues {
  const pos = entry.entry_lines.find((l) => l.amount_cents > 0)
  const neg = entry.entry_lines.find((l) => l.amount_cents < 0)
  return {
    kind: isEditableKind(entry.kind) ? entry.kind : 'expense',
    date: entry.occurred_on,
    description: entry.description,
    amount: pos ? centsToInput(pos.amount_cents) : '',
    fromAccountId: neg?.account_id ?? '',
    toAccountId: pos?.account_id ?? '',
  }
}
