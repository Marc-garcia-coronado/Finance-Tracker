import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
    // Sin red las lecturas se pausan y siguen mostrando la caché; las escrituras
    // se intentan igualmente y fallan al instante con un mensaje claro (supabase.ts)
    // en vez de quedarse en cola: la app es de solo lectura sin conexión.
    mutations: {
      networkMode: 'always',
    },
  },
})
