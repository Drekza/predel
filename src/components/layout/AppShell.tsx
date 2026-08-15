import type { ReactNode } from 'react'
import { NavLink, Outlet } from 'react-router'
import { ClipboardList, Dumbbell, History, User } from 'lucide-react'
import { cn } from '@/lib/cn'

type AppShellProps = {
  title?: string
  children?: ReactNode
}

/**
 * Колонка корпуса. Боковые кромки включаются только там, где под них есть
 * место: на телефоне линия у самого края экрана — мусор, на широком — корпус.
 */
const COLUMN = 'mx-auto w-full max-w-[30rem] min-[544px]:border-x min-[544px]:border-edge'

const NAV = [
  { to: '/', label: 'Тренировка', Icon: Dumbbell, end: true },
  { to: '/programs', label: 'Программы', Icon: ClipboardList, end: false },
  { to: '/history', label: 'История', Icon: History, end: false },
  { to: '/profile', label: 'Профиль', Icon: User, end: false },
] as const

/**
 * Корпус станции: шильда сверху, линейка под ней, клавиши снизу.
 * Активная клавиша утоплена в корпус — нажатое выглядит нажатым.
 */
export function AppShell({ title, children }: AppShellProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-body text-ink">
      {/* Корпус непрозрачный: стекло и размытие стоят кадра на телефоне,
          который в зале и так на исходе заряда. На экране шире колонки у корпуса
          появляются боковые кромки — иначе прибор растворяется в пустоте. */}
      <header className="sticky top-0 z-30 bg-body">
        <div className={COLUMN}>
          <div className="flex h-14 items-center gap-3 px-4">
            <h1 className="truncate font-stencil text-lg font-medium tracking-mark uppercase">
              {title ?? 'ПРЕДЕЛ'}
            </h1>
            {/* Марка станции — только когда заголовок занят названием экрана. */}
            {title ? (
              <span aria-hidden className="mark ml-auto shrink-0 text-ink-muted">
                ПРЕДЕЛ
              </span>
            ) : null}
          </div>
          {/* Гравированная линейка вместо разделительной волосины. */}
          <div aria-hidden className="rule-etch h-2 w-full px-4" />
        </div>
      </header>

      <main className={cn(COLUMN, 'flex-1 px-4 pt-4 pb-28')}>{children ?? <Outlet />}</main>

      <nav
        aria-label="Разделы приложения"
        className="fixed inset-x-0 bottom-0 z-30 pb-[env(safe-area-inset-bottom)]"
      >
        <ul className={cn(COLUMN, 'flex gap-px border-t border-edge bg-panel p-1')}>
          {NAV.map(({ to, label, Icon, end }) => (
            <li key={to} className="flex-1">
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    'tap flex h-16 flex-col items-center justify-center gap-1.5 rounded-sm',
                    'transition-[background-color,color] duration-100 ease-station',
                    isActive
                      ? 'recess text-ink'
                      : 'text-ink-muted hover:bg-panel-2 hover:text-ink',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon
                      size={21}
                      strokeWidth={isActive ? 2.2 : 1.7}
                      aria-hidden
                      className={isActive ? 'text-stamp' : undefined}
                    />
                    <span className="font-stencil text-[0.625rem] leading-none tracking-wide-mark uppercase">
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
