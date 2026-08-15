/**
 * Данные авторизации и профиля.
 * Прямых вызовов supabase из компонентов нет — только через эти хуки.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query'

import { getErrorCode, getErrorMessage, getErrorStatus, toRussianMessage } from '@/lib/errors'
import { qk } from '@/lib/keys'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/types/domain'

// --- Границы значений (совпадают с check-ограничениями таблицы profiles) ---

export const NICKNAME_MIN = 2
export const NICKNAME_MAX = 32
/** В БД: bodyweight_kg > 20 and < 400. Степперу даём диапазон с запасом внутрь. */
export const BODYWEIGHT_MIN = 30
export const BODYWEIGHT_MAX = 250
export const BODYWEIGHT_STEP = 0.5

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

// --- Валидация. null — всё хорошо, строка — что показать под полем ---

export function validateEmail(raw: string): string | null {
  const email = normalizeEmail(raw)
  if (email === '') return 'Введи почту — на неё придёт ссылка'
  if (email.length > 254 || !EMAIL_RE.test(email)) return 'Проверь адрес, похоже на опечатку'
  return null
}

export function validateNickname(raw: string): string | null {
  const nickname = raw.trim()
  if (nickname.length < NICKNAME_MIN) return `Ник от ${NICKNAME_MIN} до ${NICKNAME_MAX} символов`
  if (nickname.length > NICKNAME_MAX) return `Ник от ${NICKNAME_MIN} до ${NICKNAME_MAX} символов`
  return null
}

export function validateBodyweight(kg: number | null): string | null {
  if (kg === null) return null
  if (!Number.isFinite(kg)) return 'Вес — это число'
  if (kg <= 20 || kg >= 400) return 'Вес должен быть между 20 и 400 кг'
  return null
}

// --- Ошибки ---

/** Лимит писем на входе — самая частая ошибка, у неё отдельный текст. */
export function isRateLimitError(error: unknown): boolean {
  if (getErrorStatus(error) === 429) return true
  const haystack = `${getErrorCode(error) ?? ''} ${getErrorMessage(error)}`
  return /rate.?limit|too many requests|only request this after/i.test(haystack)
}

export function authErrorMessage(error: unknown): string {
  if (isRateLimitError(error)) {
    return 'Писем слишком много. Подожди минуту и попробуй снова'
  }
  return toRussianMessage(error, 'Не удалось отправить ссылку. Попробуй ещё раз')
}

export function profileErrorMessage(error: unknown): string {
  return toRussianMessage(error, 'Не удалось сохранить профиль. Попробуй ещё раз')
}

// --- Профиль ---

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  return data ?? null
}

/**
 * Профиль текущего пользователя. Строку обычно создаёт триггер handle_new_user,
 * но он намеренно не роняет регистрацию — поэтому null здесь допустим
 * и означает «профиль дозаполнит онбординг».
 */
export function useProfile(userId: string | undefined): UseQueryResult<Profile | null, unknown> {
  return useQuery({
    queryKey: qk.profile(userId ?? 'anonymous'),
    enabled: Boolean(userId),
    queryFn: () => fetchProfile(userId as string),
    staleTime: 5 * 60_000,
  })
}

export type ProfileDraft = {
  nickname: string
  bodyweightKg: number | null
  /** true — проставить onboarded_at и пустить пользователя в приложение. */
  completeOnboarding?: boolean
}

/**
 * Сохранение профиля. Именно upsert, а не update: строки может не быть,
 * если триггер регистрации её не создал.
 */
export function useUpdateProfile(
  userId: string | undefined,
): UseMutationResult<Profile, unknown, ProfileDraft> {
  const queryClient = useQueryClient()

  return useMutation<Profile, unknown, ProfileDraft>({
    mutationFn: async (draft) => {
      if (!userId) throw new Error('Нет активной сессии')

      const row = {
        id: userId,
        nickname: draft.nickname.trim(),
        bodyweight_kg: draft.bodyweightKg,
        ...(draft.completeOnboarding ? { onboarded_at: new Date().toISOString() } : {}),
      }

      const { data, error } = await supabase
        .from('profiles')
        .upsert(row, { onConflict: 'id' })
        .select('*')
        .single()

      if (error) throw error
      return data
    },
    onSuccess: (profile) => {
      if (userId) queryClient.setQueryData(qk.profile(userId), profile)
    },
  })
}

// --- Вход и выход ---

/** Вход по ссылке из письма: пароля в приложении нет вообще. */
export function useSignInWithOtp(): UseMutationResult<string, unknown, string> {
  return useMutation<string, unknown, string>({
    mutationFn: async (rawEmail) => {
      const email = normalizeEmail(rawEmail)
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: typeof window === 'undefined' ? undefined : window.location.origin,
          shouldCreateUser: true,
        },
      })
      if (error) throw error
      return email
    },
  })
}

export function useSignOut(): UseMutationResult<void, unknown, void> {
  const queryClient = useQueryClient()

  return useMutation<void, unknown, void>({
    mutationFn: async () => {
      const { error } = await supabase.auth.signOut()
      // Сессии уже нет — считаем выход состоявшимся, а не ошибкой.
      if (error && !/session missing|session_not_found/i.test(getErrorMessage(error))) {
        throw error
      }
    },
    onSettled: () => {
      queryClient.removeQueries({ queryKey: qk.all() })
    },
  })
}
