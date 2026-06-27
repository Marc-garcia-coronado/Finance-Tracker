import { supabase } from './supabase'
import { monthRange } from './dates'
import type { Json } from './database.types'

export type GenerateResult = { created: number; skipped: number }

type Line = { account_id: string; amount_cents: number }

// Firma determinista de un movimiento, independiente del orden de las líneas.
// Sirve para detectar si una plantilla ya se generó este mes (idempotencia).
function signature(
  occurredOn: string,
  kind: string,
  description: string,
  lines: Line[],
): string {
  const l = lines
    .map((x) => `${x.account_id}:${x.amount_cents}`)
    .sort()
    .join('|')
  return `${occurredOn}|${kind}|${description}|${l}`
}

// Genera los movimientos de las plantillas activas para el mes 'YYYY-MM'.
// Idempotente: si un movimiento equivalente ya existe ese mes, no lo duplica.
export async function generateRecurringForMonth(
  month: string,
): Promise<GenerateResult> {
  const { start, endExclusive } = monthRange(month)
  const targetMonthNumber = Number(month.split('-')[1])

  const { data: templates, error: tErr } = await supabase
    .from('recurring_templates')
    .select('*')
    .eq('is_active', true)
  if (tErr) throw new Error(tErr.message)

  const { data: existing, error: eErr } = await supabase
    .from('entries')
    .select('occurred_on, description, kind, voided_at, entry_lines(account_id, amount_cents)')
    .gte('occurred_on', start)
    .lt('occurred_on', endExclusive)
  if (eErr) throw new Error(eErr.message)

  const existingSigs = new Set<string>()
  for (const e of existing ?? []) {
    if (e.voided_at) continue
    existingSigs.add(signature(e.occurred_on, e.kind, e.description, e.entry_lines))
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
    const lines: Line[] = [
      { account_id: t.from_account_id, amount_cents: -t.amount_cents },
      { account_id: t.to_account_id, amount_cents: t.amount_cents },
    ]

    const sig = signature(occurredOn, t.kind, t.description, lines)
    if (existingSigs.has(sig)) {
      skipped++
      continue
    }

    const { error } = await supabase.rpc('create_entry', {
      p_occurred_on: occurredOn,
      p_description: t.description,
      p_kind: t.kind,
      p_lines: lines as unknown as Json,
    })
    if (error) throw new Error(error.message)

    existingSigs.add(sig)
    created++
  }

  return { created, skipped }
}
