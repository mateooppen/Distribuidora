import { QueryClient } from '@tanstack/react-query'

/**
 * Cliente compartido de React Query.
 *
 * `staleTime: 30s` — los resultados se consideran frescos durante 30 segundos
 * (no re-fetch al re-montar componentes en ese rango).
 * `refetchOnWindowFocus: false` — evita re-fetch al cambiar de tab.
 * `placeholderData: keepPreviousData` se aplica per-query donde haga falta.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})
