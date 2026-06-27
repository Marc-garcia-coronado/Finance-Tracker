import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

type AuthState = {
  session: Session | null
  loading: boolean
}

const AuthContext = createContext<AuthState | undefined>(undefined)

// Garantiza que el usuario tenga sus cuentas/ajustes por defecto.
// Idempotente: seed_default_accounts usa `on conflict do nothing`.
// Lo lanzamos una sola vez por carga de app, si el usuario aún no tiene cuentas.
let seedAttempted = false
async function ensureSeeded() {
  if (seedAttempted) return
  seedAttempted = true
  const { count, error } = await supabase
    .from('accounts')
    .select('id', { count: 'exact', head: true })
  if (error) {
    seedAttempted = false
    return
  }
  if ((count ?? 0) === 0) {
    await supabase.rpc('seed_default_accounts')
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
      if (data.session) void ensureSeeded()
    })

    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession)
      if (newSession && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
        void ensureSeeded()
      }
      if (event === 'SIGNED_OUT') {
        seedAttempted = false
      }
    })

    return () => sub.subscription.unsubscribe()
  }, [])

  return (
    <AuthContext.Provider value={{ session, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}
