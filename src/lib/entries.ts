import { supabase } from './supabase'
import { requireSessionKey } from './crypto/session'
import { decryptCents, encryptCents, encryptString } from './crypto/webcrypto'
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

// Construye las dos líneas (suman 0) con importes CIFRADOS y llama a create_entry.
// Convención uniforme: origen -importe, destino +importe.
export async function createEntry(params: CreateEntryParams): Promise<string> {
  const { kind, date, description, fromAccountId, toAccountId, amountCents } = params

  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new Error('El importe debe ser un entero de céntimos mayor que 0')
  }
  if (fromAccountId === toAccountId) {
    throw new Error('Las dos cuentas deben ser distintas')
  }

  const key = requireSessionKey()
  const lines: Json = [
    { account_id: fromAccountId, amount_enc: await encryptCents(key, -amountCents) },
    { account_id: toAccountId, amount_enc: await encryptCents(key, amountCents) },
  ]

  const { data, error } = await supabase.rpc('create_entry', {
    p_occurred_on: date,
    p_description: await encryptString(key, description),
    p_kind: kind,
    p_lines: lines,
  })
  if (error) throw new Error(error.message)
  return data
}

// Ajusta el saldo de una cuenta de activo a su valor real registrando un asiento
// de tipo 'adjustment' por la DIFERENCIA. counterAccountId debe ser NO-activo.
//   deltaCents = saldoReal - saldoDerivado  (positivo plusvalía, negativo minusvalía)
export async function adjustAccountBalance(params: {
  accountId: string
  counterAccountId: string
  deltaCents: number
  date: string
  description: string
}): Promise<string> {
  const { accountId, counterAccountId, deltaCents, date, description } = params

  if (!Number.isInteger(deltaCents) || deltaCents === 0) {
    throw new Error('No hay diferencia que ajustar')
  }
  if (accountId === counterAccountId) {
    throw new Error('Las dos cuentas deben ser distintas')
  }

  const key = requireSessionKey()
  const lines: Json = [
    { account_id: accountId, amount_enc: await encryptCents(key, deltaCents) },
    { account_id: counterAccountId, amount_enc: await encryptCents(key, -deltaCents) },
  ]

  const { data, error } = await supabase.rpc('create_entry', {
    p_occurred_on: date,
    p_description: await encryptString(key, description),
    p_kind: 'adjustment',
    p_lines: lines,
  })
  if (error) throw new Error(error.message)
  return data
}

// Anula un movimiento (append-only). El servidor ya no puede negar importes
// cifrados, así que el cliente lee las líneas, las niega y las recifra; el RPC
// crea el inverso (con voids_entry_id) y marca el original anulado de forma atómica.
export async function voidEntry(entryId: string): Promise<string> {
  const key = requireSessionKey()

  const { data: rows, error } = await supabase
    .from('entry_lines')
    .select('account_id, amount_enc, amount_cents')
    .eq('entry_id', entryId)
  if (error) throw new Error(error.message)
  if (!rows || rows.length === 0) throw new Error('El movimiento no tiene líneas')

  const lines: Json = await Promise.all(
    rows.map(async (l) => {
      const cents = l.amount_enc != null ? await decryptCents(key, l.amount_enc) : (l.amount_cents ?? 0)
      return { account_id: l.account_id, amount_enc: await encryptCents(key, -cents) }
    }),
  )

  const { data, error: voidError } = await supabase.rpc('void_entry', {
    p_entry_id: entryId,
    p_lines: lines,
  })
  if (voidError) throw new Error(voidError.message)
  return data
}
