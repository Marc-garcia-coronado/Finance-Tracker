import { lazy, Suspense } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { queryClient } from '@/lib/queryClient'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { CryptoProvider } from '@/features/crypto/CryptoProvider'
import { VaultGate } from '@/features/crypto/VaultGate'
import { ProtectedRoute } from '@/routes/ProtectedRoute'
import { AppLayout } from '@/components/AppLayout'
import { LoadingState } from '@/components/states'

// Code-splitting por ruta: el bundle de cada página (y recharts en el
// Dashboard) se carga bajo demanda.
const LoginPage = lazy(() =>
  import('@/features/auth/LoginPage').then((m) => ({ default: m.LoginPage })),
)
const DashboardPage = lazy(() =>
  import('@/features/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })),
)
const MovimientosPage = lazy(() =>
  import('@/features/movimientos/MovimientosPage').then((m) => ({ default: m.MovimientosPage })),
)
const MensualPage = lazy(() =>
  import('@/features/mensual/MensualPage').then((m) => ({ default: m.MensualPage })),
)
const RecurrentesPage = lazy(() =>
  import('@/features/recurrentes/RecurrentesPage').then((m) => ({ default: m.RecurrentesPage })),
)
const ObjetivosPage = lazy(() =>
  import('@/features/objetivos/ObjetivosPage').then((m) => ({ default: m.ObjetivosPage })),
)
const PatrimonioPage = lazy(() =>
  import('@/features/patrimonio/PatrimonioPage').then((m) => ({ default: m.PatrimonioPage })),
)
const ConfigPage = lazy(() =>
  import('@/features/config/ConfigPage').then((m) => ({ default: m.ConfigPage })),
)

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <CryptoProvider>
          <BrowserRouter>
            <Suspense fallback={<LoadingState />}>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route element={<ProtectedRoute />}>
                  <Route element={<VaultGate />}>
                    <Route element={<AppLayout />}>
                      <Route index element={<DashboardPage />} />
                      <Route path="movimientos" element={<MovimientosPage />} />
                      <Route path="mensual" element={<MensualPage />} />
                      <Route path="recurrentes" element={<RecurrentesPage />} />
                      <Route path="objetivos" element={<ObjetivosPage />} />
                      <Route path="patrimonio" element={<PatrimonioPage />} />
                      <Route path="config" element={<ConfigPage />} />
                    </Route>
                  </Route>
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </CryptoProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}
