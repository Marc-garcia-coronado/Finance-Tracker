// ---------------------------------------------------------------------------
// Migración única: cifra los datos que aún estén en claro (importes, nombres,
// descripciones). Se ejecuta tras configurar el vault. Idempotente: salta lo
// que ya esté cifrado, así que es seguro reintentarla.
// ---------------------------------------------------------------------------
import { supabase } from '../supabase'
import { encryptCents, encryptString, isEncrypted } from './webcrypto'
import type { TablesUpdate } from '../database.types'

export type MigrateProgress = (done: number, total: number) => void

export async function migratePlaintext(key: CryptoKey, onProgress?: MigrateProgress): Promise<void> {
  const steps: (() => Promise<void>)[] = []

  // accounts.name
  steps.push(async () => {
    const { data, error } = await supabase.from('accounts').select('id, name')
    if (error) throw new Error(error.message)
    for (const a of data ?? []) {
      if (isEncrypted(a.name)) continue
      const { error: e } = await supabase
        .from('accounts')
        .update({ name: await encryptString(key, a.name) })
        .eq('id', a.id)
      if (e) throw new Error(e.message)
    }
  })

  // entries.description
  steps.push(async () => {
    const { data, error } = await supabase.from('entries').select('id, description')
    if (error) throw new Error(error.message)
    for (const row of data ?? []) {
      if (!row.description || isEncrypted(row.description)) continue
      const { error: e } = await supabase
        .from('entries')
        .update({ description: await encryptString(key, row.description) })
        .eq('id', row.id)
      if (e) throw new Error(e.message)
    }
  })

  // entry_lines.amount_cents -> amount_enc
  steps.push(async () => {
    const { data, error } = await supabase
      .from('entry_lines')
      .select('id, amount_cents, amount_enc')
      .is('amount_enc', null)
    if (error) throw new Error(error.message)
    for (const l of data ?? []) {
      if (l.amount_cents == null) continue
      const { error: e } = await supabase
        .from('entry_lines')
        // borra el importe en claro a la vez que escribe el cifrado
        .update({ amount_enc: await encryptCents(key, l.amount_cents), amount_cents: null })
        .eq('id', l.id)
      if (e) throw new Error(e.message)
    }
  })

  // settings.estimated_monthly_income_cents -> income_enc
  steps.push(async () => {
    const { data, error } = await supabase
      .from('settings')
      .select('user_id, estimated_monthly_income_cents, income_enc')
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (data && data.income_enc == null && data.estimated_monthly_income_cents != null) {
      const { error: e } = await supabase
        .from('settings')
        .update({
          income_enc: await encryptCents(key, data.estimated_monthly_income_cents),
          estimated_monthly_income_cents: null,
        })
        .eq('user_id', data.user_id)
      if (e) throw new Error(e.message)
    }
  })

  // goals: name, target_cents, monthly_contribution_cents
  steps.push(async () => {
    const { data, error } = await supabase
      .from('goals')
      .select('id, name, target_cents, target_enc, monthly_contribution_cents, monthly_contribution_enc')
    if (error) throw new Error(error.message)
    for (const g of data ?? []) {
      const patch: TablesUpdate<'goals'> = {}
      if (!isEncrypted(g.name)) patch.name = await encryptString(key, g.name)
      if (g.target_enc == null && g.target_cents != null) {
        patch.target_enc = await encryptCents(key, g.target_cents)
        patch.target_cents = null
      }
      if (g.monthly_contribution_enc == null && g.monthly_contribution_cents != null) {
        patch.monthly_contribution_enc = await encryptCents(key, g.monthly_contribution_cents)
        patch.monthly_contribution_cents = null
      }
      if (Object.keys(patch).length === 0) continue
      const { error: e } = await supabase.from('goals').update(patch).eq('id', g.id)
      if (e) throw new Error(e.message)
    }
  })

  // recurring_templates: description, amount_cents
  steps.push(async () => {
    const { data, error } = await supabase
      .from('recurring_templates')
      .select('id, description, amount_cents, amount_enc')
    if (error) throw new Error(error.message)
    for (const r of data ?? []) {
      const patch: TablesUpdate<'recurring_templates'> = {}
      if (!isEncrypted(r.description)) patch.description = await encryptString(key, r.description)
      if (r.amount_enc == null && r.amount_cents != null) {
        patch.amount_enc = await encryptCents(key, r.amount_cents)
        patch.amount_cents = null
      }
      if (Object.keys(patch).length === 0) continue
      const { error: e } = await supabase.from('recurring_templates').update(patch).eq('id', r.id)
      if (e) throw new Error(e.message)
    }
  })

  let done = 0
  for (const step of steps) {
    await step()
    done++
    onProgress?.(done, steps.length)
  }
}
