import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

import { router } from '../router'

/** Собирает полные пути всех маршрутов дерева. */
function collectPaths(
  routes: readonly { path?: string; index?: boolean; children?: readonly unknown[] }[],
  prefix = '',
): string[] {
  const out: string[] = []
  for (const route of routes) {
    const own = route.path ?? ''
    const full = own.startsWith('/') ? own : own === '' ? prefix : `${prefix}/${own}`.replace('//', '/')
    if (route.index) out.push(prefix === '' ? '/' : prefix)
    else if (own !== '') out.push(full)
    if (route.children) out.push(...collectPaths(route.children as never[], full))
  }
  return out
}

describe('router', () => {
  it('содержит все маршруты из контракта фазы 1', () => {
    const paths = collectPaths(router.routes as never[])

    for (const expected of [
      '/login',
      '/onboarding',
      '/',
      '/programs',
      '/programs/:programId',
      '/session/:sessionId',
      '/session/:sessionId/summary',
      '/history',
      '/profile',
      '/*',
    ]) {
      expect(paths).toContain(expected)
    }
  })
})

describe('App без переменных окружения', () => {
  it('показывает экран настройки, а не белый экран', async () => {
    vi.resetModules()
    vi.doMock('@/lib/env', () => ({
      env: {
        supabaseUrl: '',
        supabaseAnonKey: '',
        isConfigured: false,
        missing: ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'],
        isDev: false,
        isTest: true,
      },
    }))

    const { default: App } = await import('../../App')
    render(<App />)

    expect(screen.getByText('Нет подключения к базе')).toBeInTheDocument()
    expect(screen.getByText('VITE_SUPABASE_URL')).toBeInTheDocument()

    vi.doUnmock('@/lib/env')
    vi.resetModules()
  })
})
