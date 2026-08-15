import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { signInWithOtp } = vi.hoisted(() => ({ signInWithOtp: vi.fn() }))

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { signInWithOtp }, from: vi.fn() },
}))

vi.mock('../AuthProvider', () => ({
  useAuth: () => ({
    session: null,
    user: null,
    profile: null,
    loading: false,
    signOut: async () => {},
    signingOut: false,
  }),
}))

import { LoginPage } from '../LoginPage'

function Wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/login']}>{children}</MemoryRouter>
    </QueryClientProvider>
  )
}

function renderPage() {
  return render(<LoginPage />, { wrapper: Wrapper })
}

describe('LoginPage', () => {
  beforeEach(() => {
    signInWithOtp.mockReset()
    // Подменяем только часы: таймеры остаются настоящими, иначе виснет ввод.
    vi.useFakeTimers({ toFake: ['Date'] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function setupUser() {
    return userEvent.setup()
  }

  it('не отправляет письмо на кривой адрес и объясняет почему', async () => {
    const user = setupUser()
    renderPage()

    await user.type(screen.getByRole('textbox', { name: 'почта' }), 'сам-по-себе')
    await user.click(screen.getByRole('button', { name: 'Прислать ссылку' }))

    expect(screen.getByText('Проверь адрес, похоже на опечатку')).toBeInTheDocument()
    expect(signInWithOtp).not.toHaveBeenCalled()
  })

  it('шлёт ссылку и держит повтор под кулдауном 60 секунд', async () => {
    const user = setupUser()
    signInWithOtp.mockResolvedValue({ data: {}, error: null })
    renderPage()

    await user.type(screen.getByRole('textbox', { name: 'почта' }), '  Test@Example.COM ')
    await user.click(screen.getByRole('button', { name: 'Прислать ссылку' }))

    expect(await screen.findByText('ссылка отправлена')).toBeInTheDocument()
    expect(signInWithOtp).toHaveBeenCalledWith({
      email: 'test@example.com',
      options: { emailRedirectTo: window.location.origin, shouldCreateUser: true },
    })
    expect(screen.getByText('test@example.com')).toBeInTheDocument()

    const resend = screen.getByRole('button', { name: 'Отправить ещё раз' })
    expect(resend).toBeDisabled()
    expect(screen.getByText('01:00')).toBeInTheDocument()

    // Перематываем часы на минуту вперёд — тикающий интервал догонит сам.
    act(() => {
      vi.setSystemTime(Date.now() + 61_000)
    })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Отправить ещё раз' })).toBeEnabled()
    })
    expect(screen.queryByText('01:00')).not.toBeInTheDocument()
  })

  it('у лимита писем отдельное сообщение', async () => {
    const user = setupUser()
    signInWithOtp.mockResolvedValue({
      data: {},
      error: { status: 429, message: 'Email rate limit exceeded' },
    })
    renderPage()

    await user.type(screen.getByRole('textbox', { name: 'почта' }), 'test@example.com')
    await user.click(screen.getByRole('button', { name: 'Прислать ссылку' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Писем слишком много. Подожди минуту и попробуй снова',
    )
  })
})
