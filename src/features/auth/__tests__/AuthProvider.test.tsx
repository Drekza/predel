import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Profile } from '@/types/domain'

const { envState, supabaseMock, unsubscribe } = vi.hoisted(() => {
  const unsubscribe = vi.fn()
  return {
    envState: { isConfigured: true, missing: [] as string[] },
    unsubscribe,
    supabaseMock: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe } } })),
      signOut: vi.fn(() => Promise.resolve({ error: null })),
      profileRow: null as Profile | null,
    },
  }
})

vi.mock('@/lib/env', () => ({ env: envState }))

vi.mock('@/lib/supabase', () => {
  type Chain = {
    select: () => Chain
    eq: () => Chain
    maybeSingle: () => Promise<{ data: Profile | null; error: null }>
    single: () => Promise<{ data: Profile | null; error: null }>
    upsert: () => Chain
  }
  const chain: Chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: () => Promise.resolve({ data: supabaseMock.profileRow, error: null }),
    single: () => Promise.resolve({ data: supabaseMock.profileRow, error: null }),
    upsert: () => chain,
  }
  return {
    supabase: {
      from: () => chain,
      auth: {
        getSession: supabaseMock.getSession,
        onAuthStateChange: supabaseMock.onAuthStateChange,
        signOut: supabaseMock.signOut,
      },
    },
  }
})

import { AuthProvider, useAuth } from '../AuthProvider'

const PROFILE: Profile = {
  id: 'u-1',
  nickname: 'Кузнец',
  bodyweight_kg: 82.5,
  onboarded_at: '2026-08-01T10:00:00Z',
  created_at: '2026-08-01T10:00:00Z',
  updated_at: '2026-08-01T10:00:00Z',
}

function Probe() {
  const { profile, loading, user } = useAuth()
  if (loading) return <span>ждём</span>
  return <span>{`${user?.email ?? 'нет почты'} · ${profile?.nickname ?? 'нет профиля'}`}</span>
}

function renderProvider(children: ReactNode = <Probe />) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>,
  )
}

describe('AuthProvider', () => {
  beforeEach(() => {
    envState.isConfigured = true
    envState.missing = []
    supabaseMock.profileRow = PROFILE
    supabaseMock.getSession.mockReset()
    supabaseMock.onAuthStateChange.mockClear()
    unsubscribe.mockClear()
    window.history.replaceState({}, '', '/')
  })

  it('чистит адресную строку от хвостов magic link и отдаёт профиль', async () => {
    supabaseMock.getSession.mockResolvedValue({
      data: { session: { user: { id: 'u-1', email: 'test@example.com' } } },
      error: null,
    })
    window.history.replaceState({}, '', '/?code=abc123&next=/history#access_token=tok&type=magiclink')

    renderProvider()

    expect(await screen.findByText('test@example.com · Кузнец')).toBeInTheDocument()
    expect(window.location.search).toBe('?next=/history')
    expect(window.location.hash).toBe('')
    expect(window.location.pathname).toBe('/')
  })

  it('отписывается от смены сессии при размонтировании', async () => {
    supabaseMock.getSession.mockResolvedValue({ data: { session: null }, error: null })

    const view = renderProvider()
    expect(await screen.findByText('нет почты · нет профиля')).toBeInTheDocument()

    view.unmount()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('без ключей Supabase показывает экран настройки вместо приложения', () => {
    envState.isConfigured = false
    envState.missing = ['VITE_SUPABASE_ANON_KEY']

    renderProvider(<span>приложение</span>)

    expect(screen.getByText('VITE_SUPABASE_ANON_KEY')).toBeInTheDocument()
    expect(screen.queryByText('приложение')).not.toBeInTheDocument()
  })
})
