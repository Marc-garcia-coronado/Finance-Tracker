// Lectura/escritura de la fila `vault` (material de llaves envuelto) en Supabase.
import { supabase } from '../supabase'
import type { VaultRow } from './keyvault'

export async function fetchVaultRow(): Promise<VaultRow | null> {
  const { data, error } = await supabase.from('vault').select('*').maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  return {
    salt_p: data.salt_p,
    salt_r: data.salt_r,
    wrap_p: data.wrap_p,
    wrap_r: data.wrap_r,
    verifier: data.verifier,
    version: data.version,
  }
}

export async function saveVaultRow(row: VaultRow): Promise<void> {
  const { data: sess } = await supabase.auth.getSession()
  const user_id = sess.session?.user.id
  if (!user_id) throw new Error('Sesión no válida')
  const { error } = await supabase.from('vault').insert({ user_id, ...row })
  if (error) throw new Error(error.message)
}
