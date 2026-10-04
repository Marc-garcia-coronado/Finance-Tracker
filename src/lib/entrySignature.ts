// ---------------------------------------------------------------------------
// Firma determinista de un movimiento y detección de duplicados. PURO (sin red
// ni React). Lo comparten los recurrentes (recurring.ts) y la importación CSV.
// ---------------------------------------------------------------------------

import type { CreateEntryParams } from './entries'

export type SignatureLine = { account_id: string; cents: number }

// Firma de un movimiento (importes ya descifrados). NO usa la descripción (que
// va cifrada con IV aleatorio): basta fecha + tipo + líneas.
export function entrySignature(occurredOn: string, kind: string, lines: SignatureLine[]): string {
  const l = lines
    .map((x) => `${x.account_id}:${x.cents}`)
    .sort()
    .join('|')
  return `${occurredOn}|${kind}|${l}`
}

// Firma del movimiento que crearía createEntry(params): origen -importe,
// destino +importe.
export function paramsSignature(p: CreateEntryParams): string {
  return entrySignature(p.date, p.kind, [
    { account_id: p.fromAccountId, cents: -p.amountCents },
    { account_id: p.toAccountId, cents: p.amountCents },
  ])
}

// Índices de `entries` que ya existen según `existing` (firma -> nº de
// movimientos con esa firma). Es un multiconjunto: cada movimiento existente
// «consume» una coincidencia, así que si hay 2 iguales en BD y el lote trae 3,
// solo 2 se marcan y la tercera se considera nueva.
export function findExistingDuplicates(
  entries: CreateEntryParams[],
  existing: Map<string, number>,
): Set<number> {
  const remaining = new Map(existing)
  const duplicates = new Set<number>()
  entries.forEach((e, i) => {
    const sig = paramsSignature(e)
    const left = remaining.get(sig) ?? 0
    if (left > 0) {
      remaining.set(sig, left - 1)
      duplicates.add(i)
    }
  })
  return duplicates
}
