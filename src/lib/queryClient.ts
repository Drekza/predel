import { QueryClient } from '@tanstack/react-query'

import { isRetriableError } from './errors'

const MAX_QUERY_RETRIES = 3

/** Экспоненциальная пауза с потолком: 1с, 2с, 4с ... не больше 15с. */
function backoff(attemptIndex: number): number {
  return Math.min(1000 * 2 ** attemptIndex, 15_000)
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Ретраим только то, что имеет смысл ретраить: сеть и 5xx.
      // Ошибки прав и нарушения ограничений повторять бесполезно.
      retry: (failureCount: number, error: unknown) => {
        if (!isRetriableError(error)) return false
        return failureCount < MAX_QUERY_RETRIES
      },
      retryDelay: backoff,
      staleTime: 30_000,
      gcTime: 24 * 60 * 60 * 1000, // сутки: приложение живёт вкладкой на весь день тренировки
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      networkMode: 'offlineFirst',
    },
    mutations: {
      // Повторы мутаций — забота офлайн-очереди (src/lib/offline/queue.ts),
      // здесь их не дублируем, иначе получим два конкурирующих механизма.
      retry: false,
      networkMode: 'offlineFirst',
    },
  },
})
