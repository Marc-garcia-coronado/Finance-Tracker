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

// Valida y construye los argumentos de un movimiento: las dos líneas (suman 0)
// con importes CIFRADOS y la descripción cifrada.
// Convención uniforme: origen -importe, destino +importe.
async function buildEntryArgs(key: CryptoKey, params: CreateEntryParams) {
  const { kind, date, description, fromAccountId, toAccountId, amountCents } = params

  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new Error('El importe debe ser un entero de céntimos mayor que 0')
  }
  if (fromAccountId === toAccountId) {
    throw new Error('Las dos cuentas deben ser distintas')
  }

  const lines: Json = [
    { account_id: fromAccountId, amount_enc: await encryptCents(key, -amountCents) },
    { account_id: toAccountId, amount_enc: await encryptCents(key, amountCents) },
  ]
  return {
    p_occurred_on: date,
    p_description: await encryptString(key, description),
    p_kind: kind,
    p_lines: lines,
  }
}

export async function createEntry(params: CreateEntryParams): Promise<string> {
  const key = requireSessionKey()
  const { data, error } = await supabase.rpc('create_entry', await buildEntryArgs(key, params))
  if (error) throw new Error(error.message)
  return data
}

// Edita un movimiento: anula el original y crea el corregido en UNA transacción
// (RPC replace_entry, migrations/002_replace_entry.sql). Si falla, no cambia nada.
export async function replaceEntry(entryId: string, params: CreateEntryParams): Promise<string> {
  const key = requireSessionKey()
  const [voidLines, args] = await Promise.all([buildVoidLines(key, entryId), buildEntryArgs(key, params)])
  const { data, error } = await supabase.rpc('replace_entry', {
    p_entry_id: entryId,
    p_void_lines: voidLines,
    ...args,
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
  const { data, error } = await supabase.rpc('void_entry', {
    p_entry_id: entryId,
    p_lines: await buildVoidLines(key, entryId),
  })
  if (error) throw new Error(error.message)
  return data
}

// Líneas del movimiento inverso: lee las del original, las niega y las recifra.
async function buildVoidLines(key: CryptoKey, entryId: string): Promise<Json> {
  const { data: rows, error } = await supabase
    .from('entry_lines')
    .select('account_id, amount_enc, amount_cents')
    .eq('entry_id', entryId)
  if (error) throw new Error(error.message)
  if (!rows || rows.length === 0) throw new Error('El movimiento no tiene líneas')

  return Promise.all(
    rows.map(async (l) => {
      const cents = l.amount_enc != null ? await decryptCents(key, l.amount_enc) : (l.amount_cents ?? 0)
      return { account_id: l.account_id, amount_enc: await encryptCents(key, -cents) }
    }),
  )
}
