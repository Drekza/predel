import type { ReactNode } from 'react'
import { NavLink, Outlet } from 'react-router'
import { ClipboardList, Dumbbell, History, User } from 'lucide-react'
import { cn } from '@/lib/cn'

type AppShellProps = {
  title?: string
  children?: ReactNode
}

const NAV = [
  { to: '/', label: 'Тренировка', Icon: Dumbbell, end: true },
  { to: '/programs', label: 'Программы', Icon: ClipboardList, end: false },
  { to: '/history', label: 'История', Icon: History, end: false },
  { to: '/profile', label: 'Профиль', Icon: User, end: false },
] as const

export function AppShell({ title, children }: AppShellProps) {
  return (
    <div className="hud-grid flex min-h-dvh flex-col bg-bg text-text">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur-md">
        <div className="relative mx-auto flex h-14 w-full max-w-[30rem] items-center px-4">
          <h1 className="truncate font-mono text-sm font-semibold tracking-hud uppercase">
            {title ?? 'ПРЕДЕЛ'}
          </h1>
          {/* Метка канала: короткий отрезок под началом заголовка */}
          <span aria-hidden className="absolute -bottom-px left-4 h-px w-7 bg-accent" />
        </div>
      </header>

      <main className="mx-auto w-full max-w-[30rem] flex-1 px-4 pt-4 pb-28">
        {children ?? <Outlet />}
      </main>

      <nav
        aria-label="Разделы приложения"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md"
      >
        <ul className="mx-auto flex w-full max-w-[30rem]">
          {NAV.map(({ to, label, Icon, end }) => (
            <li key={to} className="flex-1">
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    'tap relative flex h-16 flex-col items-center justify-center gap-1',
                    'transition-colors duration-100 ease-hud',
                    isActive ? 'text-accent' : 'text-muted hover:text-text',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive ? (
                      <span
                        aria-hidden
                        className="absolute inset-x-5 top-0 h-0.5 bg-accent shadow-[0_0_10px_0] shadow-accent/60"
                      />
                    ) : null}
                    <Icon size={20} strokeWidth={isActive ? 2.2 : 1.8} aria-hidden />
                    <span className="font-mono text-[0.5625rem] tracking-label uppercase">
                      {label}
                    </span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
