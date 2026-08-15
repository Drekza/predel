/**
 * Данные журнала веса тела.
 *
 * Журнал — источник истины, `profiles.bodyweight_kg` из него выводится:
 * триггер `sync_profile_bodyweight` (миграция 0010) кладёт в профиль вес
 * последнего измерения. Поэтому любая мутация здесь гасит и кэш профиля.
 *
 * Фильтра по profile_id в запросах нет — его делает RLS. Идентификатор нужен
 * только для ключа кэша и для вставки.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query'

import { toRussianMessage } from '@/lib/errors'
import { qk } from '@/lib/keys'
import { supabase } from '@/lib/supabase'
import type { BodyweightEntry } from '@/types/domain'

/**
 * Потолок выборки. Одно измерение в день — это два года журнала; всё, что
 * старше, графику не нужно, а страничить ради этого нечего.
 */
const ENTRIES_LIMIT = 730

export function bodyweightErrorMessage(error: unknown): string {
  return toRussianMessage(error, 'Не удалось записать вес. Попробуй ещё раз')
}

/** Журнал по возрастанию даты — в том порядке, в каком его рисует график. */
export function useBodyweightEntries(
  profileId: string | undefined,
): UseQueryResult<BodyweightEntry[], unknown> {
  return useQuery({
    queryKey: qk.bodyweight(profileId ?? 'anonymous'),
    enabled: Boolean(profileId),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<BodyweightEntry[]> => {
      // Запрашиваем свежие, а отдаём в хронологии: limit должен отрезать
      // старое, а не новое.
      const { data, error } = await supabase
        .from('bodyweight_entries')
        .select('*')
        .order('measured_on', { ascending: false })
        .limit(ENTRIES_LIMIT)
      if (error) throw error
      return (data ?? []).slice().reverse()
    },
  })
}

export type BodyweightDraft = {
  /** Локальная дата пользователя, «2026-08-16». */
  measuredOn: string
  weightKg: number
}

/**
 * Запись измерения. Именно upsert: на день приходится одно значение,
 * повторная запись за ту же дату исправляет прежнюю, а не плодит вторую.
 */
export function useSaveBodyweight(
  profileId: string | undefined,
): UseMutationResult<BodyweightEntry, unknown, BodyweightDraft> {
  const queryClient = useQueryClient()

  return useMutation<BodyweightEntry, unknown, BodyweightDraft>({
    mutationFn: async (draft) => {
      if (!profileId) throw new Error('Нет активной сессии')

      const { data, error } = await supabase
        .from('bodyweight_entries')
        .upsert(
          {
            profile_id: profileId,
            measured_on: draft.measuredOn,
            weight_kg: draft.weightKg,
          },
          { onConflict: 'profile_id,measured_on' },
        )
        .select('*')
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => invalidate(queryClient, profileId),
  })
}

export function useDeleteBodyweightEntry(
  profileId: string | undefined,
): UseMutationResult<void, unknown, string> {
  const queryClient = useQueryClient()

  return useMutation<void, unknown, string>({
    mutationFn: async (id) => {
      const { error } = await supabase.from('bodyweight_entries').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidate(queryClient, profileId),
  })
}

/** Профиль тоже перечитываем: его текущий вес переставил серверный триггер. */
function invalidate(
  queryClient: ReturnType<typeof useQueryClient>,
  profileId: string | undefined,
): void {
  if (!profileId) return
  void queryClient.invalidateQueries({ queryKey: qk.bodyweight(profileId) })
  void queryClient.invalidateQueries({ queryKey: qk.profile(profileId) })
}
