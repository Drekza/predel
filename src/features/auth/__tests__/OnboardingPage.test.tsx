import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Session, User } from '@supabase/supabase-js'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Profile } from '@/types/domain'
import type { AuthContextValue } from '../AuthProvider'

const { authState, upsertSpy } = vi.hoisted(() => ({
  authState: { current: null as unknown as AuthContextValue },
  upsertSpy: vi.fn(),
}))

vi.mock('../AuthProvider', () => ({ useAuth: () => authState.current }))

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
  return { supabase: { from: () => chain, auth: { signInWithOtp: vi.fn() } } }
})

import { OnboardingPage } from '../OnboardingPage'

const USER = { id: 'u-1', email: 'test@example.com' } as User
const SESSION = { user: USER } as Session
const RAW_PROFILE: Profile = {
  id: 'u-1',
  nickname: 'test',
  bodyweight_kg: null,
  onboarded_at: null,
  created_at: '2026-08-01T10:00:00Z',
  updated_at: '2026-08-01T10:00:00Z',
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/onboarding']}>
        <Routes>
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="/" element={<div>главная</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('OnboardingPage', () => {
  beforeEach(() => {
    upsertSpy.mockClear()
    authState.current = {
      session: SESSION,
      user: USER,
      profile: RAW_PROFILE,
      loading: false,
      signOut: async () => {},
      signingOut: false,
    }
  })

  it('подставляет ник из профиля и не пускает дальше с коротким ником', async () => {
    const user = userEvent.setup()
    renderPage()

    const nickname = screen.getByRole('textbox', { name: 'ник' })
    expect(nickname).toHaveValue('test')

    await user.clear(nickname)
    await user.type(nickname, 'я')
    await user.click(screen.getByRole('button', { name: 'Начать' }))

    expect(screen.getByText('Ник от 2 до 32 символов')).toBeInTheDocument()
    expect(upsertSpy).not.toHaveBeenCalled()
  })

  it('сохраняет ник с весом, ставит отметку онбординга и уводит на главную', async () => {
    const user = userEvent.setup()
    renderPage()

    const nickname = screen.getByRole('textbox', { name: 'ник' })
    await user.clear(nickname)
    await user.type(nickname, 'Кузнец')

    // Степпер стартует с пустого значения: первый плюс даёт минимум диапазона.
    await user.click(screen.getByRole('button', { name: 'Увеличить' }))
    await user.click(screen.getByRole('button', { name: 'Начать' }))

    expect(await screen.findByText('главная')).toBeInTheDocument()

    const row = upsertSpy.mock.calls.at(-1)?.[0] as Record<string, unknown>
    expect(row).toMatchObject({ id: 'u-1', nickname: 'Кузнец', bodyweight_kg: 30 })
    expect(typeof row.onboarded_at).toBe('string')
  })
})
