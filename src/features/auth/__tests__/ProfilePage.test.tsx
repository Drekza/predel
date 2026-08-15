import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Session, User } from '@supabase/supabase-js'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Profile } from '@/types/domain'
import type { AuthContextValue } from '../AuthProvider'

const { authState, queueState, signOutSpy, upsertSpy } = vi.hoisted(() => ({
  authState: { current: null as unknown as AuthContextValue },
  queueState: {
    current: { pending: 0, failed: [] as { id: string; lastError?: string }[] },
  },
  signOutSpy: vi.fn(),
  upsertSpy: vi.fn(),
}))

vi.mock('../AuthProvider', () => ({ useAuth: () => authState.current }))

vi.mock('@/lib/offline/queue', () => ({
  useOfflineQueue: () => ({
    pending: queueState.current.pending,
    failed: queueState.current.failed,
    flush: vi.fn(),
    retryFailed: vi.fn(),
    discard: vi.fn(),
  }),
}))

vi.mock('@/lib/supabase', () => {
  type Chain = {
    select: () => Chain
    eq: () => Chain
    maybeSingle: () => Promise<{ data: unknown; error: null }>
    single: () => Promise<{ data: unknown; error: null }>
    upsert: (row: Record<string, unknown>) => Chain
  }
  const chain: Chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    single: () => Promise.resolve({ data: upsertSpy.mock.calls.at(-1)?.[0], error: null }),
    upsert: (row) => {
      upsertSpy(row)
      return chain
    },
  }
  return { supabase: { from: () => chain, auth: { signOut: vi.fn() } } }
})

import { ProfilePage } from '../ProfilePage'

const USER = { id: 'u-1', email: 'test@example.com' } as User
const SESSION = { user: USER } as Session
const PROFILE: Profile = {
  id: 'u-1',
  nickname: 'Кузнец',
  bodyweight_kg: 82.5,
  onboarded_at: '2026-08-01T10:00:00Z',
  created_at: '2026-08-01T10:00:00Z',
  updated_at: '2026-08-01T10:00:00Z',
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/profile']}>
        <ProfilePage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ProfilePage', () => {
  beforeEach(() => {
    upsertSpy.mockClear()
    signOutSpy.mockClear()
    signOutSpy.mockResolvedValue(undefined)
    queueState.current = { pending: 0, failed: [] }
    authState.current = {
      session: SESSION,
      user: USER,
      profile: PROFILE,
      loading: false,
      signOut: signOutSpy,
      signingOut: false,
    }
  })

  it('показывает почту, ник и вес, сохраняет только изменённое', async () => {
    const user = userEvent.setup()
    renderPage()

    expect(screen.getByText('test@example.com')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'ник' })).toHaveValue('Кузнец')
    expect(screen.getByRole('button', { name: /вес тела/ })).toHaveTextContent('82,5')

    // Ничего не трогали — сохранять нечего.
    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeDisabled()

    await user.type(screen.getByRole('textbox', { name: 'ник' }), 'ъ')
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(await screen.findByText('сохранено')).toBeInTheDocument()
    expect(upsertSpy).toHaveBeenCalledTimes(1)
    expect(upsertSpy.mock.calls[0]?.[0]).toMatchObject({
      id: 'u-1',
      nickname: 'Кузнецъ',
      bodyweight_kg: 82.5,
    })
    // Онбординг уже пройден — отметку не переставляем.
    expect(upsertSpy.mock.calls[0]?.[0]).not.toHaveProperty('onboarded_at')
  })

  it('изменённый вес уходит и в журнал измерений', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: 'Увеличить' }))
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(await screen.findByText('сохранено')).toBeInTheDocument()
    expect(upsertSpy.mock.calls[0]?.[0]).toMatchObject({ id: 'u-1', bodyweight_kg: 83 })

    const entry = upsertSpy.mock.calls[1]?.[0] as Record<string, unknown>
    expect(entry).toMatchObject({ profile_id: 'u-1', weight_kg: 83 })
    expect(entry.measured_on).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('считает неотправленные операции очереди', () => {
    queueState.current = {
      pending: 3,
      failed: [{ id: 'op-1', lastError: 'Нет доступа' }],
    }
    renderPage()

    expect(screen.getByText(/операции ждут/)).toBeInTheDocument()
    expect(screen.getByText(/операция не ушла/)).toBeInTheDocument()
    expect(screen.getByText('Нет доступа')).toBeInTheDocument()
  })

  it('выходит только после подтверждения прямо на экране', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: 'Выйти' }))
    expect(signOutSpy).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Да, выйти' }))
    expect(signOutSpy).toHaveBeenCalledTimes(1)
  })
})
