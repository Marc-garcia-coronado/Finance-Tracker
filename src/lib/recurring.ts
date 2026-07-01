import { supabase } from './supabase'
import { monthRange } from './dates'
import { requireSessionKey } from './crypto/session'
import { decryptCents, encryptCents } from './crypto/webcrypto'
import type { Json } from './database.types'

export type GenerateResult = { created: number; skipped: number }

type Line = { account_id: string; cents: number }

// Firma determinista de un movimiento (importes ya descifrados). NO usa la
// descripción (que va cifrada con IV aleatorio): basta fecha + tipo + líneas.
function signature(occurredOn: string, kind: string, lines: Line[]): string {
  const l = lines
    .map((x) => `${x.account_id}:${x.cents}`)
    .sort()
    .join('|')
  return `${occurredOn}|${kind}|${l}`
}

// Genera los movimientos de las plantillas activas para el mes 'YYYY-MM'.
// Idempotente: si un movimiento equivalente ya existe ese mes, no lo duplica.
export async function generateRecurringForMonth(
  month: string,
): Promise<GenerateResult> {
  const key = requireSessionKey()
  const { start, endExclusive } = monthRange(month)
  const targetMonthNumber = Number(month.split('-')[1])

  const { data: templates, error: tErr } = await supabase
    .from('recurring_templates')
    .select('*')
    .eq('is_active', true)
  if (tErr) throw new Error(tErr.message)

  const { data: existing, error: eErr } = await supabase
    .from('entries')
    .select('occurred_on, kind, voided_at, entry_lines(account_id, amount_cents, amount_enc)')
    .gte('occurred_on', start)
    .lt('occurred_on', endExclusive)
  if (eErr) throw new Error(eErr.message)

  const existingSigs = new Set<string>()
  for (const e of (existing ?? []) as unknown as {
    occurred_on: string
    kind: string
    voided_at: string | null
    entry_lines: { account_id: string; amount_cents: number | null; amount_enc: string | null }[]
  }[]) {
    if (e.voided_at) continue
    const lines: Line[] = await Promise.all(
      (e.entry_lines ?? []).map(async (l) => ({
        account_id: l.account_id,
        cents: l.amount_enc != null ? await decryptCents(key, l.amount_enc) : (l.amount_cents ?? 0),
      })),
    )
    existingSigs.add(signature(e.occurred_on, e.kind, lines))
  }

  let created = 0
  let skipped = 0

  for (const t of templates ?? []) {
    // Las anuales solo aplican en el mes de su next_run_on.
    if (t.cadence === 'annual') {
      const tMonth = Number(t.next_run_on.split('-')[1])
      if (tMonth !== targetMonthNumber) continue
    }

    const day = String(Math.min(t.day_of_month, 28)).padStart(2, '0')
    const occurredOn = `${month}-${day}`
    const amount = t.amount_enc != null ? await decryptCents(key, t.amount_enc) : (t.amount_cents ?? 0)
    const lines: Line[] = [
      { account_id: t.from_account_id, cents: -amount },
      { account_id: t.to_account_id, cents: amount },
    ]

    const sig = signature(occurredOn, t.kind, lines)
    if (existingSigs.has(sig)) {
      skipped++
      continue
    }

    const encLines: Json = await Promise.all(
      lines.map(async (l) => ({
        account_id: l.account_id,
        amount_enc: await encryptCents(key, l.cents),
      })),
    )

    const { error } = await supabase.rpc('create_entry', {
      p_occurred_on: occurredOn,
      // La descripción de la plantilla ya está cifrada con la misma clave:
      // se reutiliza tal cual (descifra al mismo texto).
      p_description: t.description ?? '',
      p_kind: t.kind,
      p_lines: encLines,
    })
    if (error) throw new Error(error.message)

    existingSigs.add(sig)
    created++
  }

  return { created, skipped }
}
