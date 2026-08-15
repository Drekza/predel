import { render, screen } from '@testing-library/react'
import type { Session, User } from '@supabase/supabase-js'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Profile } from '@/types/domain'
import type { AuthContextValue } from '../AuthProvider'

const { authState } = vi.hoisted(() => ({
  authState: { current: null as unknown as AuthContextValue },
}))

vi.mock('../AuthProvider', () => ({ useAuth: () => authState.current }))

import { RequireAuth } from '../RequireAuth'

const USER = { id: 'u-1', email: 'test@example.com' } as User
const SESSION = { user: USER } as Session
const PROFILE: Profile = {
  id: 'u-1',
  nickname: 'Тест',
  bodyweight_kg: 80,
  onboarded_at: '2026-08-01T10:00:00Z',
  created_at: '2026-08-01T10:00:00Z',
  updated_at: '2026-08-01T10:00:00Z',
}

function setAuth(patch: Partial<AuthContextValue>): void {
  authState.current = {
    session: null,
    user: null,
    profile: null,
    loading: false,
    signOut: async () => {},
    signingOut: false,
    ...patch,
  }
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<div>экран входа</div>} />
        <Route path="/onboarding" element={<div>онбординг</div>} />
        <Route element={<RequireAuth />}>
          <Route path="/" element={<div>главная</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('RequireAuth', () => {
  beforeEach(() => {
    setAuth({})
  })

  it('ждёт, пока неизвестно, кто вошёл', () => {
    setAuth({ loading: true })
    renderAt('/')

    expect(screen.getByRole('status')).toHaveTextContent('Проверяем доступ')
    expect(screen.queryByText('главная')).not.toBeInTheDocument()
  })

  it('без сессии отправляет на вход', () => {
    setAuth({ session: null })
    renderAt('/')

    expect(screen.getByText('экран входа')).toBeInTheDocument()
  })

  it('без пройденного онбординга отправляет на онбординг', () => {
    setAuth({
      session: SESSION,
      user: USER,
      profile: { ...PROFILE, onboarded_at: null },
    })
    renderAt('/')

    expect(screen.getByText('онбординг')).toBeInTheDocument()
  })

  it('без строки профиля тоже отправляет на онбординг', () => {
    setAuth({ session: SESSION, user: USER, profile: null })
    renderAt('/')

    expect(screen.getByText('онбординг')).toBeInTheDocument()
  })

  it('готового пользователя пускает дальше', () => {
    setAuth({ session: SESSION, user: USER, profile: PROFILE })
    renderAt('/')

    expect(screen.getByText('главная')).toBeInTheDocument()
  })
})
