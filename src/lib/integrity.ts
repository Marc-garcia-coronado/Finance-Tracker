// ---------------------------------------------------------------------------
// Verificación de integridad de los movimientos. Desde la migración E2EE el
// servidor no ve los importes y ya no puede comprobar que las líneas de un
// movimiento suman 0: se comprueba aquí, en el cliente, tras descifrar.
// Función pura: la carga y el descifrado están en queries.ts (useCheckIntegrity).
// ---------------------------------------------------------------------------
import { formatEuro } from './money'

export type IntegrityLine = {
  account_id: string
  cents: number | null // null = no se pudo descifrar o no es un importe válido
  encrypted: boolean // false = importe en claro (amount_enc null)
}

export type IntegrityEntry = {
  id: string
  occurred_on: string
  description: string
  voided_at: string | null
  voids_entry_id: string | null
  lines: IntegrityLine[]
}

export type IntegrityProblemKind =
  | 'too_few_lines'
  | 'unbalanced'
  | 'undecryptable'
  | 'plaintext'
  | 'orphan_reversal'
  | 'missing_reversal'
  | 'reversal_mismatch'

export type IntegrityProblem = {
  entryId: string
  occurred_on: string
  description: string
  kind: IntegrityProblemKind
  message: string
}

function sumByAccount(lines: IntegrityLine[], into: Map<string, number>, sign: 1 | -1 = 1) {
  for (const l of lines) into.set(l.account_id, (into.get(l.account_id) ?? 0) + sign * (l.cents ?? 0))
}

const decryptable = (e: IntegrityEntry) => e.lines.every((l) => l.cents !== null)

export function checkIntegrity(entries: IntegrityEntry[]): IntegrityProblem[] {
  const problems: IntegrityProblem[] = []
  const byId = new Map(entries.map((e) => [e.id, e]))
  // original -> su anulación
  const reversalOf = new Map<string, IntegrityEntry>()
  for (const e of entries) if (e.voids_entry_id) reversalOf.set(e.voids_entry_id, e)

  const add = (e: IntegrityEntry, kind: IntegrityProblemKind, message: string) =>
    problems.push({ entryId: e.id, occurred_on: e.occurred_on, description: e.description, kind, message })

  for (const e of entries) {
    if (e.lines.length < 2) {
      add(e, 'too_few_lines', `Tiene ${e.lines.length} línea(s); un movimiento necesita al menos 2`)
    }
    if (e.lines.some((l) => !l.encrypted)) {
      add(e, 'plaintext', 'Tiene un importe sin cifrar')
    }
    if (!decryptable(e)) {
      add(e, 'undecryptable', 'Algún importe no se puede descifrar o no es válido')
    } else if (e.lines.length >= 2) {
      const sum = e.lines.reduce((s, l) => s + (l.cents ?? 0), 0)
      if (sum !== 0) add(e, 'unbalanced', `Sus líneas no suman 0 (diferencia: ${formatEuro(sum)})`)
    }

    if (e.voids_entry_id) {
      const original = byId.get(e.voids_entry_id)
      if (!original || !original.voided_at) {
        add(e, 'orphan_reversal', 'Es una anulación, pero el movimiento original no existe o no está anulado')
      } else if (decryptable(e) && decryptable(original)) {
        // Original + anulación deben cancelarse cuenta a cuenta.
        const net = new Map<string, number>()
        sumByAccount(original.lines, net)
        sumByAccount(e.lines, net)
        if ([...net.values()].some((v) => v !== 0)) {
          add(e, 'reversal_mismatch', 'La anulación no deshace exactamente el movimiento original')
        }
      }
    }

    if (e.voided_at && !reversalOf.has(e.id)) {
      add(e, 'missing_reversal', 'Está marcado como anulado, pero no existe su anulación')
    }
  }

  return problems.sort((a, b) => b.occurred_on.localeCompare(a.occurred_on))
}
