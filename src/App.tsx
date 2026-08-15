import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router'

import { ToastProvider } from '@/components/ui'
import { AuthProvider, NotConfiguredScreen } from '@/features/auth'
import { env } from '@/lib/env'
import { queryClient } from '@/lib/queryClient'
import { router } from '@/routes/router'

/**
 * Композиция провайдеров: кэш запросов -> сессия пользователя -> тосты -> роутер.
 * Порядок важен: AuthProvider ходит в react-query, тосты нужны любому экрану.
 *
 * Без ключей Supabase роутер не поднимаем вовсе: любой экран всё равно был бы
 * пустым, а причина должна быть видна сразу (никакого белого экрана).
 */
export default function App() {
  if (!env.isConfigured) return <NotConfiguredScreen />

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}
