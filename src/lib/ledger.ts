// ---------------------------------------------------------------------------
// Ledger descifrado y sus vistas derivadas. Funciones puras: el ledger se carga
// y descifra UNA vez (query ['ledger'] en queries.ts) y saldos, totales
// mensuales y serie de patrimonio se derivan de él con `select`.
// ---------------------------------------------------------------------------
import type { Enums } from './database.types'
import { netWorthSeries, type MonthlyTotalRow, type NetWorthPoint } from './metrics'

export type LedgerAccount = { id: string; name: string; type: Enums<'account_type'> }

// Línea descifrada de un asiento vigente (sin anulaciones ni sus inversos).
export type LedgerLine = {
  account_id: string
  kind: Enums<'entry_kind'>
  month: string // 'YYYY-MM'
  cents: number
}

export type Ledger = { accounts: LedgerAccount[]; lines: LedgerLine[] }

export type EntryRow = {
  id: string
  occurred_on: string
  kind: Enums<'entry_kind'>
  voided_at: string | null
  voids_entry_id: string | null
}

export type EntryLineRow = {
  entry_id: string
  account_id: string
  amount_enc: string | null
  amount_cents: number | null // legado en claro
}

// Construye las líneas vigentes del ledger a partir de las filas de la BD.
// Excluye el par completo de una anulación: el movimiento original (marcado con
// voided_at) Y su asiento inverso (marcado con voids_entry_id). Contar solo uno
// de los dos dejaría un neto espurio (p. ej. una categoría de gasto en negativo)
// en balances y totales mensuales. `decrypt` se inyecta para poder testearlo.
export async function liveLedgerLines(
  entries: EntryRow[],
  lines: EntryLineRow[],
  decrypt: (enc: string) => Promise<number>,
): Promise<LedgerLine[]> {
  const meta = new Map(entries.map((e) => [e.id, e]))
  // Descifrado en paralelo: WebCrypto es asíncrono y encadenar un await por
  // línea desaprovecha la concurrencia.
  const decrypted = await Promise.all(
    lines.map(async (l): Promise<LedgerLine | null> => {
      const e = meta.get(l.entry_id)
      if (!e || e.voided_at || e.voids_entry_id) return null
      const cents = l.amount_enc != null ? await decrypt(l.amount_enc) : (l.amount_cents ?? 0)
      return { account_id: l.account_id, kind: e.kind, month: e.occurred_on.slice(0, 7), cents }
    }),
  )
  return decrypted.filter((l): l is LedgerLine => l !== null)
}

// Ids de las cuentas con alguna línea vigente (no anulada) en el ledger. Su tipo
// ya no se puede cambiar: reclasificaría de golpe todo su histórico.
export function accountIdsWithMovements(ledger: Ledger): Set<string> {
  return new Set(ledger.lines.map((l) => l.account_id))
}

export type Balance = {
  account_id: string
  name: string
  type: Enums<'account_type'>
  balance_cents: number
}

// Saldo de cada cuenta = suma de sus líneas (ajustes incluidos).
export function balancesFromLedger(ledger: Ledger): Balance[] {
  const sums = new Map<string, number>()
  for (const l of ledger.lines) sums.set(l.account_id, (sums.get(l.account_id) ?? 0) + l.cents)
  return ledger.accounts.map((a) => ({
    account_id: a.id,
    name: a.name,
    type: a.type,
    balance_cents: sums.get(a.id) ?? 0,
  }))
}

// Totales por mes y cuenta. Excluye los ajustes: no son consumo del mes.
export function monthlyTotalsFromLedger(ledger: Ledger): MonthlyTotalRow[] {
  const byId = new Map(ledger.accounts.map((a) => [a.id, a]))
  const map = new Map<string, MonthlyTotalRow>()
  for (const l of ledger.lines) {
    if (l.kind === 'adjustment') continue
    const a = byId.get(l.account_id)
    if (!a) continue
    const k = `${l.month}|${l.account_id}`
    const cur = map.get(k)
    if (cur) cur.total_cents += l.cents
    else
      map.set(k, {
        month: l.month,
        account_id: l.account_id,
        name: a.name,
        type: a.type,
        total_cents: l.cents,
      })
  }
  return [...map.values()]
}

// Patrimonio neto a fin de cada mes (cuentas de activo, ajustes incluidos).
export function netWorthFromLedger(ledger: Ledger, endMonth?: string): NetWorthPoint[] {
  const assetIds = new Set(ledger.accounts.filter((a) => a.type === 'asset').map((a) => a.id))
  return netWorthSeries(ledger.lines, assetIds, endMonth)
}
