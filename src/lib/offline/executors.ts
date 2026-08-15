/**
 * Исполнители офлайн-очереди: единственное место, где операции очереди
 * превращаются в запросы к Supabase.
 *
 * Очередь (queue.ts) намеренно ничего не знает про сеть и про Supabase —
 * отправку в неё инжектируют отсюда. Регистрация идемпотентна и вызывается
 * при старте приложения (main.tsx) и при импорте features/session/api.ts,
 * чтобы очередь работала и в тех сценариях, где страница сессии открыта
 * первой после перезагрузки.
 *
 * Результат записи кладётся ПРЯМО в кэш запроса, а не выпрашивается рефетчем:
 * TanStack Query глотает ошибку рефетча (refetchQueries ловит её через
 * .catch(noop)), поэтому неудачный перезапрос выглядел бы как успех —
 * операция ушла бы из очереди, а строка не попала бы в кэш, и подход исчез
 * бы с экрана. Инвалидация остаётся фоновой сверкой и НЕ ожидается: ждать её
 * внутри последовательного флаша значит держать всю очередь.
 */

import { qk } from '@/lib/keys'
import { queryClient } from '@/lib/queryClient'
import { supabase } from '@/lib/supabase'
import type { WorkoutSet, WorkoutSetUpdate } from '@/types/domain'

import { registerExecutor } from './queue'

let registered = false

/** Порядок как в useSessionSets: по времени лога. */
function byLoggedAt(a: WorkoutSet, b: WorkoutSet): number {
  return Date.parse(a.logged_at) - Date.parse(b.logged_at)
}

/**
 * Точечная правка кэша подходов сессии + фоновая сверка с сервером.
 * Если запроса в кэше нет (экран не открыт), ничего не выдумываем:
 * setQueryData с undefined не создаёт запись.
 */
function patchSetsCache(sessionId: string, update: (rows: WorkoutSet[]) => WorkoutSet[]): void {
  queryClient.setQueryData<WorkoutSet[]>(qk.sessionSets(sessionId), (prev) =>
    prev === undefined ? prev : update(prev),
  )
  void queryClient.invalidateQueries({ queryKey: qk.sessionSets(sessionId) })
}

export function registerOfflineExecutors(): void {
  if (registered) return
  registered = true

  registerExecutor('log_set', async (payload) => {
    const { data, error } = await supabase
      .from('sets')
      .insert({
        session_id: payload.sessionId,
        exercise_id: payload.exerciseId,
        program_item_id: payload.programItemId,
        order_index: payload.orderIndex,
        // kind всё равно перезапишет триггер из exercises.kind — клиенту тут не верят.
        kind: payload.kind,
        weight_kg: payload.weightKg,
        reps: payload.reps,
        rir: payload.rir,
        duration_sec: payload.durationSec,
        distance_m: payload.distanceM,
        client_id: payload.clientId,
        logged_at: payload.loggedAt,
      })
      .select('*')
      .single()
    if (error) throw error

    const row = data as WorkoutSet | null
    if (!row) return
    patchSetsCache(payload.sessionId, (rows) =>
      [...rows.filter((item) => item.client_id !== payload.clientId), row].sort(byLoggedAt),
    )
  })

  registerExecutor('update_set', async (payload) => {
    const { weightKg, reps, rir, durationSec, distanceM } = payload.patch
    const patch: WorkoutSetUpdate = {}
    if (weightKg !== undefined) patch.weight_kg = weightKg
    if (reps !== undefined) patch.reps = reps
    if (rir !== undefined) patch.rir = rir
    if (durationSec !== undefined) patch.duration_sec = durationSec
    if (distanceM !== undefined) patch.distance_m = distanceM
    if (Object.keys(patch).length === 0) return

    // Ищем строку по client_id, а не по id: id может ещё не быть на клиенте.
    // Строка гарантированно существует: строгий FIFO очереди не выпускает
    // правку вперёд собственной вставки.
    const { error } = await supabase
      .from('sets')
      .update(patch)
      .eq('session_id', payload.sessionId)
      .eq('client_id', payload.clientId)
    if (error) throw error

    patchSetsCache(payload.sessionId, (rows) =>
      rows.map((row) =>
        row.client_id === payload.clientId
          ? {
              ...row,
              weight_kg: weightKg === undefined ? row.weight_kg : weightKg,
              reps: reps === undefined ? row.reps : reps,
              rir: rir === undefined ? row.rir : rir,
              duration_sec: durationSec === undefined ? row.duration_sec : durationSec,
              distance_m: distanceM === undefined ? row.distance_m : distanceM,
            }
          : row,
      ),
    )
  })

  registerExecutor('delete_set', async (payload) => {
    const { error } = await supabase
      .from('sets')
      .delete()
      .eq('session_id', payload.sessionId)
      .eq('client_id', payload.clientId)
    if (error) throw error

    patchSetsCache(payload.sessionId, (rows) =>
      rows.filter((row) => row.client_id !== payload.clientId),
    )
  })

  registerExecutor('finish_session', async (payload) => {
    const { error } = await supabase.rpc('finish_session', {
      p_session_id: payload.sessionId,
      p_state: payload.state,
      p_note: payload.note,
    })
    if (error) throw error
    // Строгий FIFO очереди гарантирует, что все подходы уже доехали
    // и сервер посчитал итоги по полным данным.
    void queryClient.invalidateQueries({ queryKey: qk.sessions() })
    void queryClient.invalidateQueries({ queryKey: qk.programs() })
  })
}
