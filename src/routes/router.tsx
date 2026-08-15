import { Suspense, lazy } from 'react'
import { Outlet, createBrowserRouter, useMatches } from 'react-router'

import { AppShell } from '@/components/layout/AppShell'
import { Spinner } from '@/components/ui'
import { LoginPage, OnboardingPage, ProfilePage, RequireAuth } from '@/features/auth'

import { ErrorBoundary } from './ErrorBoundary'
import { NotFound } from './NotFound'

/**
 * Тяжёлые экраны грузятся отдельными чанками. Импорт идёт через index.ts фичи —
 * так фича остаётся единственным входом, а сборка режет её в отдельный кусок:
 * в стартовый бандл попадают только оболочка и авторизация.
 */
const HomePage = lazy(() => import('@/features/session').then((m) => ({ default: m.HomePage })))
const SessionPage = lazy(() =>
  import('@/features/session').then((m) => ({ default: m.SessionPage })),
)
const SessionSummaryPage = lazy(() =>
  import('@/features/session').then((m) => ({ default: m.SessionSummaryPage })),
)
const HistoryPage = lazy(() =>
  import('@/features/session').then((m) => ({ default: m.HistoryPage })),
)
const BodyweightPage = lazy(() =>
  import('@/features/bodyweight').then((m) => ({ default: m.BodyweightPage })),
)
const ProgramsPage = lazy(() =>
  import('@/features/programs').then((m) => ({ default: m.ProgramsPage })),
)
const ProgramEditorPage = lazy(() =>
  import('@/features/programs').then((m) => ({ default: m.ProgramEditorPage })),
)

/**
 * Витрина дизайн-системы. Динамический импорт стоит внутри проверки DEV, иначе
 * сборщик всё равно вырежет чанк в прод — но выпустит его файлом.
 */
const Showroom = import.meta.env.DEV
  ? lazy(() => import('@/dev/Showroom').then((m) => ({ default: m.Showroom })))
  : null

/** Дев-маршрут: демо-тренировка в кэше, чтобы открыть настоящий экран сессии. */
const DemoSessionGate = import.meta.env.DEV
  ? lazy(() => import('@/dev/DemoSessionGate').then((m) => ({ default: m.DemoSessionGate })))
  : null

/** Заголовок берётся из handle маршрута — шапка одна на всё приложение. */
type RouteHandle = { title?: string }

function useRouteTitle(): string | undefined {
  const matches = useMatches()
  for (let i = matches.length - 1; i >= 0; i -= 1) {
    const handle = matches[i]?.handle as RouteHandle | undefined
    if (handle?.title) return handle.title
  }
  return undefined
}

/** Ожидание чанка: одна строка по центру, без прыжков вёрстки. */
function PageFallback() {
  return (
    <div role="status" className="flex min-h-[50dvh] items-center justify-center">
      <Spinner size={22} className="text-ink-muted" />
    </div>
  )
}

function AppLayout() {
  const title = useRouteTitle()

  return (
    <AppShell title={title}>
      <Suspense fallback={<PageFallback />}>
        <Outlet />
      </Suspense>
    </AppShell>
  )
}

export const router = createBrowserRouter(
  [
    {
      // Маршрут без element рендерит Outlet; он нужен только чтобы повесить
      // общий errorElement на весь роутер.
      errorElement: <ErrorBoundary />,
      children: [
        // Экраны входа живут вне оболочки: нижняя навигация до входа бессмысленна.
        { path: '/login', element: <LoginPage /> },
        { path: '/onboarding', element: <OnboardingPage /> },

        ...(Showroom && DemoSessionGate
          ? [
              { path: '/__demo', element: <DemoSessionGate /> },
              {
                element: <AppLayout />,
                children: [
                  {
                    path: '__showroom',
                    element: <Showroom />,
                    handle: { title: 'Витрина' },
                  },
                ],
              },
            ]
          : []),

        {
          element: (
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          ),
          children: [
            { index: true, element: <HomePage />, handle: { title: 'Тренировка' } },
            { path: 'programs', element: <ProgramsPage />, handle: { title: 'Программы' } },
            {
              path: 'programs/:programId',
              element: <ProgramEditorPage />,
              handle: { title: 'Программа' },
            },
            {
              path: 'session/:sessionId',
              element: <SessionPage />,
              handle: { title: 'Тренировка' },
            },
            {
              path: 'session/:sessionId/summary',
              element: <SessionSummaryPage />,
              handle: { title: 'Итоги' },
            },
            { path: 'history', element: <HistoryPage />, handle: { title: 'История' } },
            { path: 'profile', element: <ProfilePage />, handle: { title: 'Профиль' } },
            { path: 'weight', element: <BodyweightPage />, handle: { title: 'Вес тела' } },
          ],
        },

        { path: '*', element: <NotFound /> },
      ],
    },
  ],
  // На GitHub Pages сайт живёт в подпапке /predel/. BASE_URL приходит из
  // vite.config, в dev это «/» — один и тот же код работает в обоих местах.
  { basename: import.meta.env.BASE_URL },
)
