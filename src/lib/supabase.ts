import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error(
    'Faltan VITE_SUPABASE_URL y/o VITE_SUPABASE_ANON_KEY. ' +
      'Copia .env.example a .env.local y rellena los valores.',
  )
}

// Solo la anon key vive en el cliente. La service_role key NUNCA entra aquí.
export const OFFLINE_MESSAGE = 'Sin conexión: la app es de solo lectura hasta que vuelva la red.'

// Sin red falla al instante con un mensaje en español (en vez de «Failed to fetch»).
const guardedFetch: typeof fetch = (input, init) => {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return Promise.reject(new Error(OFFLINE_MESSAGE))
  }
  return fetch(input, init)
}

export const supabase = createClient<Database>(url, anonKey, {
  global: { fetch: guardedFetch },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
