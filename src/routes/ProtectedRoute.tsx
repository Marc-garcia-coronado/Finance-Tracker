import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthProvider'
import { LoadingState } from '@/components/states'

export function ProtectedRoute() {
  const { session, loading } = useAuth()
  if (loading) return <LoadingState label="Comprobando sesión…" />
  if (!session) return <Navigate to="/login" replace />
  return <Outlet />
}
