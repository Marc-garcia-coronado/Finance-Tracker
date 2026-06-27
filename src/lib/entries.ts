import { supabase } from './supabase'
import type { Enums, Json } from './database.types'

// Tipo de movimiento que ofrece la UI. 'adjustment' existe en el enum pero no
// se crea desde el cliente con un formulario simple.
export type EntryKind = Extract<
  Enums<'entry_kind'>,
  'expense' | 'income' | 'transfer'
>

export type CreateEntryParams = {
  kind: EntryKind
  date: string // 'YYYY-MM-DD'
  description: string
  fromAccountId: string // pata que SALE (-importe)
  toAccountId: string // pata que ENTRA (+importe)
  amountCents: number // SIEMPRE > 0
}

// Construye las dos líneas (suman 0) y llama a la RPC create_entry.
// Convención uniforme: origen -importe, destino +importe.
//   expense  : asset(-)      -> categoría gasto(+)
//   income   : ingreso(-)    -> asset(+)
//   transfer : asset(-)      -> asset(+)
export async function createEntry(params: CreateEntryParams): Promise<string> {
  const { kind, date, description, fromAccountId, toAccountId, amountCents } = params

  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new Error('El importe debe ser un entero de céntimos mayor que 0')
  }
  if (fromAccountId === toAccountId) {
    throw new Error('Las dos cuentas deben ser distintas')
  }

  const lines: Json = [
    { account_id: fromAccountId, amount_cents: -amountCents },
    { account_id: toAccountId, amount_cents: amountCents },
  ]

  const { data, error } = await supabase.rpc('create_entry', {
    p_occurred_on: date,
    p_description: description,
    p_kind: kind,
    p_lines: lines,
  })
  if (error) throw new Error(error.message)
  return data
}

// Anula un movimiento creando su inverso (append-only). Nunca borra.
export async function voidEntry(entryId: string): Promise<string> {
  const { data, error } = await supabase.rpc('void_entry', {
    p_entry_id: entryId,
  })
  if (error) throw new Error(error.message)
  return data
}
