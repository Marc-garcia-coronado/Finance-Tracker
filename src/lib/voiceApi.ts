// Llamada a la Edge Function `parse-movements`. Recibe el texto dictado y los
// nombres de categorías; devuelve la respuesta cruda (se valida con
// parseVoiceResponse). Mapea los errores a mensajes en español.
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { VoicePayload } from './voiceParse'

const MESSAGES: Record<string, string> = {
  rate_limited: 'Has llegado al límite de dictados de hoy. Inténtalo mañana o añade los movimientos a mano.',
  unauthorized: 'Tu sesión ha caducado. Vuelve a iniciar sesión.',
  not_configured: 'El dictado con IA no está configurado en el servidor.',
  bad_request: 'El texto no es válido. Revísalo e inténtalo de nuevo.',
}
const FALLBACK = 'No se pudo interpretar el dictado. Inténtalo de nuevo en unos segundos.'

export async function interpretDictation(payload: VoicePayload): Promise<unknown> {
  const { data, error } = await supabase.functions.invoke('parse-movements', { body: payload })
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const body = (await error.context.json().catch(() => null)) as { error?: string; detail?: string } | null
      const known = body?.error ? MESSAGES[body.error] : undefined
      throw new Error(known ?? (body?.detail ? `${FALLBACK} (${body.detail})` : FALLBACK))
    }
    throw new Error(error instanceof Error && error.message ? error.message : FALLBACK)
  }
  return data
}
