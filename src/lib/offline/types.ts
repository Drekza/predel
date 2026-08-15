/**
 * Типы офлайн-очереди мутаций (спека 10.4).
 * Очередь не знает про Supabase: реальную отправку инжектирует
 * фича через registerExecutor(). Здесь только форма данных.
 */

import type { ExerciseKind, SessionState } from '@/types/domain'

export type QueueOpKind = 'log_set' | 'update_set' | 'delete_set' | 'finish_session'

export type QueueOpStatus = 'pending' | 'failed'

/**
 * Записать подход. clientId совпадает с QueuedOp.id и уходит в sets.client_id —
 * на нём держится идемпотентность (уникальный индекс sets(session_id, client_id)).
 */
export type LogSetPayload = {
  sessionId: string
  clientId: string
  exerciseId: string
  programItemId: string | null
  orderIndex: number
  kind: ExerciseKind
  /** Силовой подход. */
  weightKg: number | null
  reps: number | null
  rir: number | null
  /** Кардио-отрезок. */
  durationSec: number | null
  distanceM: number | null
  /** ISO-время нажатия кнопки, а не момента отправки. */
  loggedAt: string
}

export type SetPatch = {
  weightKg?: number | null
  reps?: number | null
  rir?: number | null
  durationSec?: number | null
  distanceM?: number | null
}

export type UpdateSetPayload = {
  sessionId: string
  /** id строки на сервере; null, если строка ещё не подтверждена (ищем по clientId). */
  setId: string | null
  clientId: string
  patch: SetPatch
}

export type DeleteSetPayload = {
  sessionId: string
  setId: string | null
  clientId: string
}

export type FinishSessionPayload = {
  sessionId: string
  state: Extract<SessionState, 'finished' | 'abandoned'>
  note: string | null
}

export type QueueOpPayloadMap = {
  log_set: LogSetPayload
  update_set: UpdateSetPayload
  delete_set: DeleteSetPayload
  finish_session: FinishSessionPayload
}

type QueuedOpOf<K extends QueueOpKind> = {
  /** uuid; для log_set он же client_id строки sets. */
  id: string
  kind: K
  payload: QueueOpPayloadMap[K]
  createdAt: number
  attempts: number
  /**
   * Чей это подход. Общий телефон и выход из аккаунта: чужие операции нельзя
   * отправлять под новым токеном — RLS отклонит их навсегда.
   * undefined — операция из версии до появления поля.
   */
  profileId?: string
  status: QueueOpStatus
  /** Раньше этого времени операцию не трогаем (экспоненциальный backoff). */
  nextAttemptAt: number
  /** Уже переведённое в русский сообщение последней ошибки. */
  lastError?: string
}

/** Без параметра — размеченное объединение всех видов операций. */
export type QueuedOp<K extends QueueOpKind = QueueOpKind> = { [P in K]: QueuedOpOf<P> }[K]

/** Что кладут в enqueue(): служебные поля проставит очередь. */
export type QueueOpInput<K extends QueueOpKind = QueueOpKind> = {
  [P in K]: {
    kind: P
    payload: QueueOpPayloadMap[P]
    /** Обычно = client_id подхода. Если не задан — сгенерится uuid. */
    id?: string
  }
}[K]

/** Реальная отправка. Успех — resolve; ошибку очередь классифицирует сама. */
export type QueueExecutor<K extends QueueOpKind = QueueOpKind> = (
  payload: QueueOpPayloadMap[K],
  op: QueuedOp<K>,
) => Promise<unknown>

export type QueueSnapshot = {
  ops: QueuedOp[]
  /** Сколько операций ждёт отправки. */
  pending: number
  /** Операции, исчерпавшие попытки: их показываем пользователю, молча не удаляем. */
  failed: QueuedOp[]
}

export type OfflineQueueApi = {
  pending: number
  failed: QueuedOp[]
  flush: () => void
  retryFailed: () => void
  discard: (id: string) => void
}
