import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Session, User } from '@supabase/supabase-js'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { toDateKey } from '@/lib/format'
import type { BodyweightEntry, Profile } from '@/types/domain'
import type { AuthContextValue } from '@/features/auth/AuthProvider'

const { authState, entriesState, upsertSpy, deleteSpy } = vi.hoisted(() => ({
  authState: { current: null as unknown as AuthContextValue },
  entriesState: { current: [] as unknown[] },
  upsertSpy: vi.fn(),
  deleteSpy: vi.fn(),
}))

vi.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => authState.current }))

vi.mock('@/lib/supabase', () => {
  type Chain = {
    select: () => Chain
    order: () => Chain
    limit: () => Promise<{ data: unknown; error: null }>
    single: () => Promise<{ data: unknown; error: null }>
    upsert: (row: Record<string, unknown>) => Chain
    delete: () => Chain
    eq: (column: string, value: string) => Promise<{ data: null; error: null }>
  }
  const chain: Chain = {
    select: () => chain,
    order: () => chain,
    // Журнал приходит по убыванию даты — хук разворачивает его сам.
    limit: () => Promise.resolve({ data: [...entriesState.current].reverse(), error: null }),
    single: () => Promise.resolve({ data: upsertSpy.mock.calls.at(-1)?.[0], error: null }),
    upsert: (row) => {
      upsertSpy(row)
      return chain
    },
    delete: () => chain,
    eq: (_column, value) => {
      deleteSpy(value)
      return Promise.resolve({ data: null, error: null })
    },
  }
  return { supabase: { from: () => chain } }
})

import { BodyweightPage } from '../BodyweightPage'

const USER = { id: 'u-1', email: 'test@example.com' } as User
const SESSION = { user: USER } as Session
const PROFILE: Profile = {
  id: 'u-1',
  nickname: 'Кузнец',
  bodyweight_kg: 81,
  onboarded_at: '2026-08-01T10:00:00Z',
  created_at: '2026-08-01T10:00:00Z',
  updated_at: '2026-08-01T10:00:00Z',
}

function entry(id: string, measuredOn: string, kg: number): BodyweightEntry {
  return {
    id,
    profile_id: 'u-1',
    measured_on: measuredOn,
    weight_kg: kg,
    created_at: `${measuredOn}T07:00:00Z`,
    updated_at: `${measuredOn}T07:00:00Z`,
  }
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/weight']}>
        <BodyweightPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('BodyweightPage', () => {
  beforeEach(() => {
    upsertSpy.mockClear()
    deleteSpy.mockClear()
    // Даты держим свежими: график показывает период, а не «когда-то давно».
    const today = toDateKey()
    const earlier = toDateKey(Date.now() - 7 * 86_400_000)
    entriesState.current = [entry('e-1', earlier, 82.5), entry('e-2', today, 81)]
    authState.current = {
      session: SESSION,
      user: USER,
      profile: PROFILE,
      loading: false,
      signOut: async () => {},
      signingOut: false,
    }
  })

  it('рисует график по журналу и показывает изменение веса', async () => {
    renderPage()

    const chart = await screen.findByRole('img', { name: /График веса тела/ })
    expect(chart).toBeInTheDocument()
    // Два измерения: 82,5 -> 81.
    expect(screen.getByText('-1,5 кг')).toBeInTheDocument()
    // Максимум периода — верхняя из двух точек.
    expect(screen.getByText('82,5 кг')).toBeInTheDocument()
  })

  it('пустой журнал зовёт записать первое измерение', async () => {
    entriesState.current = []
    renderPage()

    expect(await screen.findByText(/Ни одного измерения/)).toBeInTheDocument()
    expect(screen.getByText('Журнал пуст')).toBeInTheDocument()
  })

  it('записывает вес сегодняшним днём', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('img', { name: /График веса тела/ })

    // Поле подставило последнее измерение — шаг вверх даёт 81,5.
    await user.click(screen.getByRole('button', { name: 'Увеличить' }))
    await user.click(screen.getByRole('button', { name: 'Записать' }))

    expect(upsertSpy).toHaveBeenCalledTimes(1)
    expect(upsertSpy.mock.calls[0]?.[0]).toMatchObject({
      profile_id: 'u-1',
      measured_on: toDateKey(),
      weight_kg: 81.5,
    })
  })

  it('удаляет измерение только после подтверждения на месте', async () => {
    const user = userEvent.setup()
    renderPage()

    const rows = await screen.findAllByRole('button', { name: /удалить измерение/ })
    await user.click(rows[0] as HTMLElement)
    expect(deleteSpy).not.toHaveBeenCalled()

    const list = screen.getByText('измерения').closest('div')?.parentElement as HTMLElement
    await user.click(within(list).getByRole('button', { name: 'Удалить' }))
    expect(deleteSpy).toHaveBeenCalledWith('e-2')
  })
})
