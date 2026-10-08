import type { ReactNode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { demoQueryClient, queryClient } from '../queryClient'
import { useDemoMode } from './demoMode'

// Entrega la caché demo o la real según el modo. Al cambiar de una a otra los
// componentes se re-renderizan solos con los datos que toquen, sin recargar.
export function DemoQueryProvider({ children }: { children: ReactNode }) {
  const demo = useDemoMode()
  return <QueryClientProvider client={demo ? demoQueryClient : queryClient}>{children}</QueryClientProvider>
}
