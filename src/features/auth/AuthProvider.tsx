import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Session, User } from '@supabase/supabase-js'

import { env } from '@/lib/env'
import { setQueueOwner } from '@/lib/offline/queue'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/types/domain'

import { useProfile, useSignOut } from './api'
import { NotConfiguredScreen } from './NotConfiguredScreen'

export type AuthContextValue = {
  session: Session | null
  user: User | null
  profile: Profile | null
  /** true, пока неизвестно, кто вошёл и пройден ли онбординг. */
  loading: boolean
  signOut: () => Promise<void>
  signingOut: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

/**
 * Хвосты magic link в адресной строке. Supabase их уже разобрал
 * (detectSessionInUrl), а токен в истории браузера нам не нужен.
 */
const AUTH_QUERY_PARAMS = [
  'access_token',
  'refresh_token',
  'expires_in',
  'expires_at',
  'token_type',
  'provider_token',
  'provider_refresh_token',
  'type',
  'code',
  'error',
  'error_code',
  'error_description',
]

const AUTH_HASH_RE = /(access_token|refresh_token|error|error_code|error_description|type)=/

/** Режем строку запроса руками: URLSearchParams перекодировал бы чужие параметры. */
function stripAuthQuery(search: string): string {
  if (search.length <= 1) return ''
  const kept = search
    .slice(1)
    .split('&')
    .filter((pair) => {
      const rawKey = pair.split('=')[0] ?? ''
      let key = rawKey
      try {
        key = decodeURIComponent(rawKey)
      } catch {
        // Кривой процент-энкодинг — сравниваем как есть.
      }
      return !AUTH_QUERY_PARAMS.includes(key)
    })
  return kept.length > 0 ? `?${kept.join('&')}` : ''
}

function cleanAuthParamsFromUrl(): void {
  if (typeof window === 'undefined') return
  if (typeof window.history?.replaceState !== 'function') return

  const { pathname, search, hash } = window.location
  const nextSearch = stripAuthQuery(search)
  const nextHash = hash.length > 1 && AUTH_HASH_RE.test(hash) ? '' : hash
  if (nextSearch === search && nextHash === hash) return

  window.history.replaceState(window.history.state, '', `${pathname}${nextSearch}${nextHash}`)
}

function AuthGate({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [session, setSession] = useState<Session | null>(null)
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    let active = true

    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return
        setSession(data.session ?? null)
        setInitialized(true)
        if (data.session) cleanAuthParamsFromUrl()
      })
      .catch(() => {
        if (active) setInitialized(true)
      })

    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return
      // Внутри колбэка supabase дёргать нельзя — только состояние.
      setSession(nextSession ?? null)
      setInitialized(true)
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') cleanAuthParamsFromUrl()
    })

    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [])

  const userId = session?.user.id ?? null
  const previousUserId = useRef<string | null>(null)

  // Сменился пользователь — чужой кэш держать нельзя, а очередь мутаций
  // обязана узнать нового владельца: подходы прошлого пользователя не должны
  // уехать под чужим токеном (RLS отклонила бы их окончательно).
  useEffect(() => {
    const previous = previousUserId.current
    previousUserId.current = userId
    if (previous === userId) return
    setQueueOwner(userId)
    if (previous !== null) queryClient.clear()
  }, [userId, queryClient])

  const profileQuery = useProfile(userId ?? undefined)
  const signOutMutation = useSignOut()

  const signOut = useCallback(async () => {
    await signOutMutation.mutateAsync()
    setSession(null)
  }, [signOutMutation])

  const loading = !initialized || (userId !== null && profileQuery.isPending)

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile: profileQuery.data ?? null,
      loading,
      signOut,
      signingOut: signOutMutation.isPending,
    }),
    [session, profileQuery.data, loading, signOut, signOutMutation.isPending],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/**
 * Провайдер сессии. Если Supabase не настроен, приложение дальше не идёт:
 * без бэкенда любой экран всё равно пуст, а причина должна быть видна.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  if (!env.isConfigured) return <NotConfiguredScreen />
  return <AuthGate>{children}</AuthGate>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth должен вызываться внутри <AuthProvider>')
  return ctx
}
