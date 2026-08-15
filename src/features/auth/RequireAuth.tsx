import type { ReactNode } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router'

import { Spinner } from '@/components/ui'

import { useAuth } from './AuthProvider'

/** Пока не ясно, кто вошёл, показываем ровно одну строку — никаких прыжков верстки. */
function AuthPending() {
  return (
    <div
      role="status"
      className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-bg text-muted"
    >
      <Spinner size={22} className="text-accent" />
      <span className="font-mono text-hud uppercase">Проверяем доступ</span>
    </div>
  )
}

/**
 * Пускает дальше только полностью готового пользователя:
 * без сессии — на вход, без пройденного онбординга — на онбординг.
 */
export function RequireAuth({ children }: { children?: ReactNode }) {
  const { session, profile, loading } = useAuth()
  const location = useLocation()

  if (loading) return <AuthPending />

  if (!session) {
    if (location.pathname === '/login') return <>{children ?? <Outlet />}</>
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }

  // Профиля может не быть вовсе: триггер регистрации намеренно не роняет вход.
  if (!profile || profile.onboarded_at === null) {
    if (location.pathname === '/onboarding') return <>{children ?? <Outlet />}</>
    return <Navigate to="/onboarding" replace />
  }

  return <>{children ?? <Outlet />}</>
}
