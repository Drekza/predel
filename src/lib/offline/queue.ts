/**
 * Очередь оптимистичных мутаций, переживающая перезагрузку (спека 10.4).
 *
 * Принципы:
 *  - Хранилище — localStorage под версионированным ключом. Между вкладками
 *    источник правды — именно хранилище: любая запись идёт поверх свежего
 *    снимка, иначе вкладка со устаревшей памятью затрёт чужой подход.
 *  - FIFO строгий, head-of-line: пока голова очереди не уехала (пауза, отказ,
 *    нет исполнителя), за ней не идёт НИЧЕГО. Иначе finish_session обгонит
 *    подход, а правка — собственную вставку.
 *  - Идемпотентность: id операции = client_id строки sets, повтор упирается
 *    в уникальный индекс sets(session_id, client_id); код 23505 считаем успехом.
 *  - Офлайн не считается попыткой: связь вернётся. Счётчик жгут только
 *    настоящие отказы сервера; после MAX_ATTEMPTS операция помечается failed
 *    и остаётся в очереди — потерять подход нельзя, о нём сообщают пользователю.
 *  - Очередь привязана к профилю: после выхода из аккаунта чужие операции
 *    не отправляются (RLS отклонила бы их окончательно).
 *  - Очередь НЕ знает про Supabase: отправку инжектируют через registerExecutor().
 */

import { useCallback, useEffect, useSyncExternalStore } from 'react'

import { isDuplicateError, isNetworkError, isRetriableError, toRussianMessage } from '../errors'
import { newUuid } from '../uuid'
import type {
  OfflineQueueApi,
  QueueExecutor,
  QueueOpInput,
  QueueOpKind,
  QueueSnapshot,
  QueuedOp,
} from './types'

export const QUEUE_STORAGE_KEY = 'gymrpg.mutation-queue.v1'
export const MAX_ATTEMPTS = 6
export const AUTO_FLUSH_INTERVAL_MS = 15_000

const BASE_DELAY_MS = 1000
const MAX_DELAY_MS = 60_000
const OP_KINDS: QueueOpKind[] = ['log_set', 'update_set', 'delete_set', 'finish_session']

/** Пауза перед попыткой номер attempts: 1с, 2с, 4с, 8с ... не больше минуты. */
export function backoffDelayMs(attempts: number): number {
  const exp = BASE_DELAY_MS * 2 ** Math.max(0, attempts - 1)
  return Math.min(exp, MAX_DELAY_MS)
}

// --- Хранилище -------------------------------------------------------------

function storage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage
  } catch {
    // Приватный режим Safari и подобное — работаем в памяти.
    return null
  }
}

function isQueuedOp(value: unknown): value is QueuedOp {
  if (!value || typeof value !== 'object') return false
  const op = value as Partial<QueuedOp>
  return (
    typeof op.id === 'string' &&
    typeof op.kind === 'string' &&
    (OP_KINDS as string[]).includes(op.kind) &&
    typeof op.payload === 'object' &&
    op.payload !== null &&
    typeof op.createdAt === 'number' &&
    typeof op.attempts === 'number'
  )
}

function readStorage(): QueuedOp[] {
  const store = storage()
  if (!store) return []
  try {
    const raw = store.getItem(QUEUE_STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isQueuedOp).map((op) => ({
      ...op,
      status: op.status === 'failed' ? 'failed' : 'pending',
      nextAttemptAt: typeof op.nextAttemptAt === 'number' ? op.nextAttemptAt : 0,
    }))
  } catch {
    // Битый JSON не должен ронять приложение: считаем очередь пустой.
    return []
  }
}

function writeStorage(ops: QueuedOp[]): void {
  const store = storage()
  if (!store) return
  try {
    store.setItem(QUEUE_STORAGE_KEY, JSON.stringify(ops))
  } catch {
    // Переполнение квоты — данные останутся хотя бы в памяти.
  }
}

// --- Состояние в памяти ----------------------------------------------------

let ops: QueuedOp[] | null = null
let snapshot: QueueSnapshot = { ops: [], pending: 0, failed: [] }
const listeners = new Set<() => void>()

/** Профиль, чьи операции сейчас можно отправлять. null — никто не вошёл. */
let queueOwner: string | null = null

/** Операции без profileId остались от прежних версий — их не прячем. */
function isOwnOp(op: QueuedOp): boolean {
  return op.profileId === undefined || op.profileId === queueOwner
}

function loadOps(): QueuedOp[] {
  if (ops === null) {
    ops = readStorage()
    snapshot = buildSnapshot(ops)
  }
  return ops
}

/**
 * База для записи. Свой список в памяти мог устареть: соседняя вкладка
 * успела добавить подход или снять доставленную операцию. Пишем поверх
 * свежего снимка хранилища, иначе чужая запись потеряется молча.
 */
function baseOps(): QueuedOp[] {
  const current = loadOps()
  return storage() ? readStorage() : current
}

function buildSnapshot(list: QueuedOp[]): QueueSnapshot {
  // Счётчики и баннер — только про текущего пользователя: чужие операции
  // показывать некому и незачем.
  const own = list.filter(isOwnOp)
  return {
    ops: list,
    pending: own.filter((op) => op.status !== 'failed').length,
    failed: own.filter((op) => op.status === 'failed'),
  }
}

function commit(next: QueuedOp[]): void {
  ops = next
  snapshot = buildSnapshot(next)
  writeStorage(next)
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  loadOps()
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Стабильная ссылка — обязательное условие useSyncExternalStore. */
export function getQueueSnapshot(): QueueSnapshot {
  loadOps()
  return snapshot
}

export function getQueuedOps(): QueuedOp[] {
  return getQueueSnapshot().ops
}

export function hasPendingOps(): boolean {
  return getQueueSnapshot().pending > 0
}

/** Перечитать localStorage (после записи из другой вкладки или «перезагрузки»). */
export function reloadQueueFromStorage(): void {
  commit(readStorage())
}

/**
 * Кто сейчас работает с очередью. Зовётся из провайдера авторизации при входе,
 * выходе и смене пользователя. Пока владелец не совпадает, операции лежат
 * нетронутыми: отправлять подходы одного пользователя под токеном другого
 * нельзя — RLS отклонит их окончательно, и тренировка пропадёт.
 */
export function setQueueOwner(profileId: string | null): void {
  if (queueOwner === profileId) return
  queueOwner = profileId
  // Пересобираем снимок (счётчики зависят от владельца) поверх свежего хранилища.
  commit(baseOps())
  if (profileId !== null) void flushQueue()
}

// --- Исполнители -----------------------------------------------------------

const executors = new Map<QueueOpKind, QueueExecutor>()

export function registerExecutor<K extends QueueOpKind>(kind: K, fn: QueueExecutor<K>): void {
  executors.set(kind, fn as QueueExecutor)
}

export function unregisterExecutor(kind: QueueOpKind): void {
  executors.delete(kind)
}

// --- Публичное API ---------------------------------------------------------

/**
 * Поставить операцию в очередь. Возвращает готовую операцию (её id — client_id).
 * Повторный enqueue с тем же id не создаёт дубль.
 */
export function enqueue(input: QueueOpInput): QueuedOp {
  const list = baseOps()
  const id = input.id ?? newUuid()
  const existing = list.find((op) => op.id === id)
  if (existing) return existing

  const op = {
    id,
    kind: input.kind,
    payload: input.payload,
    createdAt: Date.now(),
    attempts: 0,
    ...(queueOwner === null ? {} : { profileId: queueOwner }),
    status: 'pending',
    nextAttemptAt: 0,
  } as QueuedOp

  commit([...list, op])
  void flushQueue()
  return op
}

/** Убрать операцию из очереди (пользователь отказался от повторов). */
export function discard(id: string): void {
  const list = baseOps()
  if (!list.some((op) => op.id === id)) return
  commit(list.filter((op) => op.id !== id))
  // Провалившаяся голова держала весь хвост — после её снятия он поедет.
  void flushQueue()
}

/** Вернуть провалившиеся операции в работу. */
export function retryFailed(): void {
  const list = baseOps()
  if (!list.some((op) => op.status === 'failed')) return
  commit(
    list.map((op) =>
      op.status === 'failed'
        ? { ...op, status: 'pending', attempts: 0, nextAttemptAt: 0, lastError: undefined }
        : op,
    ),
  )
  void flushQueue()
}

export function clearQueue(): void {
  commit([])
}

// --- Отправка --------------------------------------------------------------

let flushing: Promise<void> | null = null

/**
 * Голова очереди текущего пользователя — и только она.
 * Если голова ждёт паузу, провалилась или для неё нет исполнителя, флаш
 * останавливается: обгон ломает FIFO, а на нём держатся итоги сессии
 * (finish_session считает тоннаж и память автозаполнения по доехавшим
 * подходам) и правки подходов, которые ищут строку по client_id.
 */
function nextReadyOp(now: number): QueuedOp | undefined {
  for (const op of loadOps()) {
    // Операции другого профиля — отдельный поток, они просто ждут своего входа.
    if (!isOwnOp(op)) continue
    if (op.status === 'failed') return undefined
    if (!executors.has(op.kind)) return undefined
    if (op.nextAttemptAt > now) return undefined
    return op
  }
  return undefined
}

function removeOp(id: string): void {
  commit(baseOps().filter((op) => op.id !== id))
}

function patchOp(id: string, patch: Partial<QueuedOp>): void {
  commit(baseOps().map((op) => (op.id === id ? ({ ...op, ...patch } as QueuedOp) : op)))
}

/**
 * Отправляет операции по одной в порядке FIFO.
 * Останавливается на ЛЮБОЙ ошибке головы: и на сетевой, и на окончательной.
 * Провалившаяся операция остаётся в очереди и держит хвост, пока пользователь
 * не нажмёт «Повторить» или не удалит её.
 */
export function flushQueue(): Promise<void> {
  if (flushing) return flushing
  flushing = runFlush().finally(() => {
    flushing = null
  })
  return flushing
}

async function runFlush(): Promise<void> {
  loadOps()
  for (;;) {
    const op = nextReadyOp(Date.now())
    if (!op) return

    const executor = executors.get(op.kind)
    if (!executor) return

    try {
      await executor(op.payload as never, op as never)
      removeOp(op.id)
      continue
    } catch (error) {
      // Дубль по уникальному индексу = операция уже доехала. Это успех.
      if (isDuplicateError(error)) {
        removeOp(op.id)
        continue
      }

      // Офлайн — не попытка, а ожидание связи. Иначе полтора часа в подвале
      // зала превращают всю очередь в failed, и тренировка не уезжает никогда.
      const offline = isNetworkError(error)
      const attempts = offline ? op.attempts : op.attempts + 1
      const permanent = !offline && !isRetriableError(error)
      const exhausted = !offline && attempts >= MAX_ATTEMPTS
      const failed = permanent || exhausted

      patchOp(op.id, {
        attempts,
        lastError: toRussianMessage(error),
        status: failed ? 'failed' : 'pending',
        nextAttemptAt: failed
          ? 0
          : Date.now() + (offline ? BASE_DELAY_MS : backoffDelayMs(attempts)),
      })

      // Голова не уехала — хвост стоит. Порядок дороже скорости.
      return
    }
  }
}

// --- Автофлаш --------------------------------------------------------------

let autoFlushRefs = 0
let intervalId: ReturnType<typeof setInterval> | null = null

function handleOnline(): void {
  void flushQueue()
}

function handleVisibility(): void {
  if (typeof document === 'undefined' || document.visibilityState === 'visible') {
    void flushQueue()
  }
}

function handleStorage(event: StorageEvent): void {
  if (event.key !== null && event.key !== QUEUE_STORAGE_KEY) return
  // Хранилище авторитетнее памяти: каждая запись (в любой вкладке) сделана
  // поверх свежего снимка, поэтому перечитывание не может потерять операцию.
  reloadQueueFromStorage()
}

/**
 * Включает автоматическую отправку: события online / visibilitychange,
 * таймер раз в 15 секунд и один флаш прямо сейчас.
 * Возвращает функцию отписки (счётчик ссылок — можно звать из нескольких мест).
 */
export function startQueueAutoFlush(): () => void {
  autoFlushRefs += 1
  if (autoFlushRefs === 1) {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleOnline)
      window.addEventListener('storage', handleStorage)
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibility)
    }
    intervalId = setInterval(handleOnline, AUTO_FLUSH_INTERVAL_MS)
  }
  void flushQueue()

  let stopped = false
  return () => {
    if (stopped) return
    stopped = true
    autoFlushRefs -= 1
    if (autoFlushRefs > 0) return
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('storage', handleStorage)
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleVisibility)
    }
    if (intervalId !== null) {
      clearInterval(intervalId)
      intervalId = null
    }
  }
}

// --- Хук -------------------------------------------------------------------

export function useOfflineQueue(): OfflineQueueApi {
  const state = useSyncExternalStore(subscribe, getQueueSnapshot, getQueueSnapshot)

  useEffect(() => startQueueAutoFlush(), [])

  const flush = useCallback(() => {
    void flushQueue()
  }, [])

  return {
    pending: state.pending,
    failed: state.failed,
    flush,
    retryFailed,
    discard,
  }
}

/** Только для тестов: полный сброс модуля. */
export function __resetQueueForTests(): void {
  ops = null
  snapshot = { ops: [], pending: 0, failed: [] }
  queueOwner = null
  listeners.clear()
  executors.clear()
  flushing = null
  autoFlushRefs = 0
  if (intervalId !== null) {
    clearInterval(intervalId)
    intervalId = null
  }
  const store = storage()
  try {
    store?.removeItem(QUEUE_STORAGE_KEY)
  } catch {
    // ignore
  }
}
