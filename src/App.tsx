import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { queryClient } from '@/lib/queryClient'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { LoginPage } from '@/features/auth/LoginPage'
import { ProtectedRoute } from '@/routes/ProtectedRoute'
import { AppLayout } from '@/components/AppLayout'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { MovimientosPage } from '@/features/movimientos/MovimientosPage'
import { MensualPage } from '@/features/mensual/MensualPage'
import { RecurrentesPage } from '@/features/recurrentes/RecurrentesPage'
import { ObjetivosPage } from '@/features/objetivos/ObjetivosPage'
import { PatrimonioPage } from '@/features/patrimonio/PatrimonioPage'
import { ConfigPage } from '@/features/config/ConfigPage'

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<ProtectedRoute />}>
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
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}
