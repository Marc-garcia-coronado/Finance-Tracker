import { supabase } from './supabase'
import { fetchAll } from './fetchAll'
import { monthRange } from './dates'
import { requireSessionKey } from './crypto/session'
import { decryptCents, encryptCents } from './crypto/webcrypto'
import type { Json, Tables } from './database.types'
import { addDays, format, parseISO } from 'date-fns'
import { pendingDates } from './recurringDates'

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

type Template = Tables<'recurring_templates'>

async function loadActiveTemplates(): Promise<Template[]> {
  const { data, error } = await supabase.from('recurring_templates').select('*').eq('is_active', true)
  if (error) throw new Error(error.message)
  return data ?? []
}

// Firmas de los movimientos existentes con fecha en [start, endExclusive).
// includeVoided: cuenta también los anulados como existentes (la generación
// automática no debe recrear un recurrente que se anuló a propósito).
async function loadExistingSignatures(
  key: CryptoKey,
  start: string,
  endExclusive: string,
  includeVoided: boolean,
): Promise<Set<string>> {
  const existing = await fetchAll((from, to) =>
    supabase
      .from('entries')
      .select('occurred_on, kind, voided_at, entry_lines(account_id, amount_cents, amount_enc)')
      .gte('occurred_on', start)
      .lt('occurred_on', endExclusive)
      .order('id')
      .range(from, to),
  )

  const sigs = new Set<string>()
  for (const e of existing as unknown as {
    occurred_on: string
    kind: string
    voided_at: string | null
    entry_lines: { account_id: string; amount_cents: number | null; amount_enc: string | null }[]
  }[]) {
    if (e.voided_at && !includeVoided) continue
    const lines: Line[] = await Promise.all(
      (e.entry_lines ?? []).map(async (l) => ({
        account_id: l.account_id,
        cents: l.amount_enc != null ? await decryptCents(key, l.amount_enc) : (l.amount_cents ?? 0),
      })),
    )
    sigs.add(signature(e.occurred_on, e.kind, lines))
  }
  return sigs
}

// Crea el movimiento de una plantilla en `occurredOn` salvo que ya exista uno
// equivalente en `sigs`. Devuelve true si lo ha creado.
async function createFromTemplate(
  key: CryptoKey,
  t: Template,
  occurredOn: string,
  sigs: Set<string>,
): Promise<boolean> {
  const amount = t.amount_enc != null ? await decryptCents(key, t.amount_enc) : (t.amount_cents ?? 0)
  const lines: Line[] = [
    { account_id: t.from_account_id, cents: -amount },
    { account_id: t.to_account_id, cents: amount },
  ]
  const sig = signature(occurredOn, t.kind, lines)
  if (sigs.has(sig)) return false

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

  sigs.add(sig)
  return true
}

// Genera los movimientos de las plantillas activas para el mes 'YYYY-MM'
// (botón «Generar» de Recurrentes). Idempotente: si un movimiento equivalente
// ya existe ese mes, no lo duplica. No toca next_run_on.
export async function generateRecurringForMonth(
  month: string,
): Promise<GenerateResult> {
  const key = requireSessionKey()
  const { start, endExclusive } = monthRange(month)
  const targetMonthNumber = Number(month.split('-')[1])

  const templates = await loadActiveTemplates()
  const sigs = await loadExistingSignatures(key, start, endExclusive, false)

  let created = 0
  let skipped = 0

  for (const t of templates) {
    // Las anuales solo aplican en el mes de su next_run_on.
    if (t.cadence === 'annual') {
      const tMonth = Number(t.next_run_on.split('-')[1])
      if (tMonth !== targetMonthNumber) continue
    }

    const day = String(Math.min(t.day_of_month, 28)).padStart(2, '0')
    if (await createFromTemplate(key, t, `${month}-${day}`, sigs)) created++
    else skipped++
  }

  return { created, skipped }
}

// Genera todo lo pendiente hasta `today` (inclusive) y avanza next_run_on de
// cada plantilla. Se ejecuta automáticamente al abrir la app (useAutoRecurring).
export async function generatePendingRecurring(today: string): Promise<{ created: number }> {
  const key = requireSessionKey()
  const templates = await loadActiveTemplates()

  const plans = templates.map((t) => ({ t, ...pendingDates(t, today) }))
  const allDates = plans.flatMap((p) => p.dates)
  if (allDates.length === 0) return { created: 0 }

  const start = allDates.reduce((a, b) => (a < b ? a : b))
  const endExclusive = format(addDays(parseISO(today), 1), 'yyyy-MM-dd')
  const sigs = await loadExistingSignatures(key, start, endExclusive, true)

  let created = 0
  for (const { t, dates, nextRunOn } of plans) {
    if (dates.length === 0) continue
    for (const d of dates) {
      if (await createFromTemplate(key, t, d, sigs)) created++
    }
    const { error } = await supabase
      .from('recurring_templates')
      .update({ next_run_on: nextRunOn })
      .eq('id', t.id)
    if (error) throw new Error(error.message)
  }
  return { created }
}
