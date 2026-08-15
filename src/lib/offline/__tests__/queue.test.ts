import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  MAX_ATTEMPTS,
  QUEUE_STORAGE_KEY,
  __resetQueueForTests,
  backoffDelayMs,
  discard,
  enqueue,
  flushQueue,
  getQueueSnapshot,
  registerExecutor,
  reloadQueueFromStorage,
  retryFailed,
  setQueueOwner,
} from '../queue'
import type { FinishSessionPayload, LogSetPayload, QueuedOp } from '../types'

const T0 = new Date('2026-08-15T10:00:00.000Z').getTime()

function logSetPayload(over: Partial<LogSetPayload> = {}): LogSetPayload {
  return {
    sessionId: 'session-1',
    clientId: 'client-1',
    exerciseId: 'exercise-1',
    programItemId: null,
    orderIndex: 1,
    kind: 'strength',
    weightKg: 80,
    reps: 8,
    rir: 2,
    durationSec: null,
    distanceM: null,
    loggedAt: new Date(T0).toISOString(),
    ...over,
  }
}

function finishPayload(): FinishSessionPayload {
  return { sessionId: 'session-1', state: 'finished', note: null }
}

/** Ошибка в форме PostgrestError. */
function pgError(code: string, message = 'boom'): { code: string; message: string } {
  return { code, message }
}

const networkError = new TypeError('Failed to fetch')

function readStored(): QueuedOp[] {
  const raw = localStorage.getItem(QUEUE_STORAGE_KEY)
  return raw ? (JSON.parse(raw) as QueuedOp[]) : []
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(T0)
  localStorage.clear()
  __resetQueueForTests()
})

afterEach(() => {
  __resetQueueForTests()
  localStorage.clear()
  vi.useRealTimers()
})

describe('backoffDelayMs', () => {
  it('растёт экспоненциально и упирается в потолок', () => {
    expect(backoffDelayMs(1)).toBe(1000)
    expect(backoffDelayMs(2)).toBe(2000)
    expect(backoffDelayMs(3)).toBe(4000)
    expect(backoffDelayMs(4)).toBe(8000)
    expect(backoffDelayMs(20)).toBe(60_000)
  })
})

describe('enqueue', () => {
  it('кладёт операцию в localStorage под версионированным ключом', () => {
    const op = enqueue({ kind: 'log_set', id: 'client-1', payload: logSetPayload() })

    const stored = readStored()
    expect(stored).toHaveLength(1)
    expect(stored[0]?.id).toBe('client-1')
    expect(stored[0]?.kind).toBe('log_set')
    expect(stored[0]?.attempts).toBe(0)
    expect(op.id).toBe('client-1')
    expect(getQueueSnapshot().pending).toBe(1)
  })

  it('повторный enqueue с тем же id не создаёт дубль', () => {
    enqueue({ kind: 'log_set', id: 'client-1', payload: logSetPayload() })
    enqueue({ kind: 'log_set', id: 'client-1', payload: logSetPayload() })

    expect(getQueueSnapshot().ops).toHaveLength(1)
  })
})

describe('flushQueue', () => {
  it('отправляет операции строго в порядке FIFO и чистит очередь', async () => {
    const sent: string[] = []
    registerExecutor('log_set', async (payload) => {
      sent.push(payload.clientId)
    })
    registerExecutor('finish_session', async () => {
      sent.push('finish')
    })

    enqueue({ kind: 'log_set', id: 'a', payload: logSetPayload({ clientId: 'a' }) })
    enqueue({ kind: 'log_set', id: 'b', payload: logSetPayload({ clientId: 'b' }) })
    enqueue({ kind: 'finish_session', id: 'c', payload: finishPayload() })

    await flushQueue()

    expect(sent).toEqual(['a', 'b', 'finish'])
    expect(getQueueSnapshot().ops).toEqual([])
    expect(readStored()).toEqual([])
  })

  it('не отправляет ничего, пока исполнитель не зарегистрирован', async () => {
    enqueue({ kind: 'log_set', id: 'a', payload: logSetPayload() })
    await flushQueue()

    expect(getQueueSnapshot().pending).toBe(1)
  })

  it('считает 23505 успехом: повтор того же client_id не остаётся в очереди', async () => {
    const calls: string[] = []
    registerExecutor('log_set', async (payload) => {
      calls.push(payload.clientId)
      throw pgError('23505', 'duplicate key value violates unique constraint')
    })

    enqueue({ kind: 'log_set', id: 'client-1', payload: logSetPayload() })
    await flushQueue()

    expect(calls).toEqual(['client-1'])
    expect(getQueueSnapshot().ops).toEqual([])
    expect(getQueueSnapshot().failed).toEqual([])
  })

  it('после сетевой ошибки ставит паузу и не трогает операцию до её конца', async () => {
    const executor = vi.fn(async () => {
      throw networkError
    })
    registerExecutor('log_set', executor)

    enqueue({ kind: 'log_set', id: 'a', payload: logSetPayload() })
    await flushQueue()

    const [first] = getQueueSnapshot().ops
    expect(executor).toHaveBeenCalledTimes(1)
    // Офлайн не считается попыткой: счётчик жгут только отказы сервера.
    expect(first?.attempts).toBe(0)
    expect(first?.status).toBe('pending')
    expect(first?.nextAttemptAt).toBe(T0 + 1000)
    expect(first?.lastError).toBe('Нет связи, изменения сохранены и уйдут позже')

    // Рано: пауза ещё не прошла.
    await flushQueue()
    expect(executor).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(1000)
    await flushQueue()
    expect(executor).toHaveBeenCalledTimes(2)
    expect(getQueueSnapshot().ops[0]?.nextAttemptAt).toBe(T0 + 1000 + 1000)
  })

  it('отказ сервера растит backoff экспоненциально', async () => {
    const executor = vi.fn(async () => {
      throw pgError('500', 'internal server error')
    })
    registerExecutor('log_set', executor)

    enqueue({ kind: 'log_set', id: 'a', payload: logSetPayload() })
    await flushQueue()
    expect(getQueueSnapshot().ops[0]?.attempts).toBe(1)
    expect(getQueueSnapshot().ops[0]?.nextAttemptAt).toBe(T0 + 1000)

    vi.advanceTimersByTime(1000)
    await flushQueue()
    expect(getQueueSnapshot().ops[0]?.attempts).toBe(2)
    expect(getQueueSnapshot().ops[0]?.nextAttemptAt).toBe(T0 + 1000 + 2000)
  })

  it('офлайн не исчерпывает попытки: подход не становится failed никогда', async () => {
    registerExecutor('log_set', async () => {
      throw networkError
    })

    enqueue({ kind: 'log_set', id: 'a', payload: logSetPayload() })

    for (let i = 0; i < MAX_ATTEMPTS * 2; i += 1) {
      vi.advanceTimersByTime(15_000)
      await flushQueue()
    }

    const snapshot = getQueueSnapshot()
    expect(snapshot.failed).toEqual([])
    expect(snapshot.pending).toBe(1)
  })

  it('сетевая ошибка останавливает флаш и сохраняет порядок', async () => {
    const seen: string[] = []
    registerExecutor('log_set', async (payload) => {
      seen.push(payload.clientId)
      throw networkError
    })

    enqueue({ kind: 'log_set', id: 'a', payload: logSetPayload({ clientId: 'a' }) })
    enqueue({ kind: 'log_set', id: 'b', payload: logSetPayload({ clientId: 'b' }) })
    await flushQueue()

    expect(seen).toEqual(['a'])
    expect(getQueueSnapshot().ops).toHaveLength(2)
    expect(getQueueSnapshot().ops[0]?.id).toBe('a')
  })

  it('после MAX_ATTEMPTS отказов сервера помечает failed, но не удаляет молча', async () => {
    registerExecutor('log_set', async () => {
      throw pgError('500', 'internal server error')
    })

    enqueue({ kind: 'log_set', id: 'a', payload: logSetPayload() })

    for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
      vi.advanceTimersByTime(60_000)
      await flushQueue()
    }

    const snapshot = getQueueSnapshot()
    expect(snapshot.ops).toHaveLength(1)
    expect(snapshot.pending).toBe(0)
    expect(snapshot.failed).toHaveLength(1)
    expect(snapshot.failed[0]?.attempts).toBe(MAX_ATTEMPTS)
    expect(readStored()).toHaveLength(1)
  })

  it('провалившаяся операция держит хвост очереди: FIFO не обгоняют', async () => {
    const seen: string[] = []
    registerExecutor('log_set', async (payload) => {
      seen.push(payload.clientId)
      if (payload.clientId === 'a') throw pgError('42501', 'permission denied')
    })
    registerExecutor('finish_session', async () => {
      seen.push('finish')
    })

    enqueue({ kind: 'log_set', id: 'a', payload: logSetPayload({ clientId: 'a' }) })
    enqueue({ kind: 'log_set', id: 'b', payload: logSetPayload({ clientId: 'b' }) })
    enqueue({ kind: 'finish_session', id: 'c', payload: finishPayload() })
    await flushQueue()

    const snapshot = getQueueSnapshot()
    // Итоги нельзя считать по неполным данным — завершение ждёт подходов.
    expect(seen).toEqual(['a'])
    expect(snapshot.failed).toHaveLength(1)
    expect(snapshot.failed[0]?.id).toBe('a')
    expect(snapshot.failed[0]?.lastError).toBe('Нет доступа')
    expect(snapshot.pending).toBe(2)

    // Пользователь убрал застрявшую операцию — хвост поехал.
    discard('a')
    await flushQueue()
    expect(seen).toEqual(['a', 'b', 'finish'])
    expect(getQueueSnapshot().ops).toEqual([])
  })

  it('операция на паузе не пропускает вперёд следующие', async () => {
    const seen: string[] = []
    registerExecutor('log_set', async (payload) => {
      seen.push(payload.clientId)
      if (payload.clientId === 'a') throw networkError
    })
    registerExecutor('finish_session', async () => {
      seen.push('finish')
    })

    enqueue({ kind: 'log_set', id: 'a', payload: logSetPayload({ clientId: 'a' }) })
    await flushQueue()

    enqueue({ kind: 'finish_session', id: 'c', payload: finishPayload() })
    await flushQueue()

    expect(seen).toEqual(['a'])
  })

  it('нарушение check-ограничения даёт русское сообщение', async () => {
    registerExecutor('log_set', async () => {
      throw pgError('23514', 'violates check constraint "sets_shape_ck"')
    })

    enqueue({ kind: 'log_set', id: 'a', payload: logSetPayload() })
    await flushQueue()

    expect(getQueueSnapshot().failed[0]?.lastError).toBe('Значение вне допустимого диапазона')
  })
})

describe('переживание перезагрузки', () => {
  it('поднимает очередь из localStorage и дожимает операцию', async () => {
    const stored: QueuedOp[] = [
      {
        id: 'client-42',
        kind: 'log_set',
        payload: logSetPayload({ clientId: 'client-42' }),
        createdAt: T0 - 5000,
        attempts: 1,
        status: 'pending',
        nextAttemptAt: 0,
      },
    ]
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(stored))

    // Имитация запуска приложения после перезагрузки вкладки.
    reloadQueueFromStorage()
    expect(getQueueSnapshot().pending).toBe(1)

    const sent: string[] = []
    registerExecutor('log_set', async (payload) => {
      sent.push(payload.clientId)
    })
    await flushQueue()

    expect(sent).toEqual(['client-42'])
    expect(readStored()).toEqual([])
  })

  it('битый JSON в хранилище не роняет очередь', () => {
    localStorage.setItem(QUEUE_STORAGE_KEY, '{не json')
    reloadQueueFromStorage()

    expect(getQueueSnapshot().ops).toEqual([])
  })
})

describe('привязка к профилю', () => {
  it('после выхода не отправляет операции прежнего пользователя', async () => {
    setQueueOwner('user-a')
    enqueue({ kind: 'log_set', id: 'a', payload: logSetPayload() })

    // Выход из аккаунта: чужой токен отправлять эти подходы не должен.
    setQueueOwner(null)

    const seen: string[] = []
    registerExecutor('log_set', async (payload) => {
      seen.push(payload.clientId)
    })
    await flushQueue()
    expect(seen).toEqual([])
    // И в счётчиках чужая операция не мелькает.
    expect(getQueueSnapshot().pending).toBe(0)
    expect(getQueueSnapshot().ops).toHaveLength(1)

    // Законный владелец вернулся — подход уехал.
    setQueueOwner('user-a')
    await flushQueue()
    expect(seen).toEqual(['client-1'])
  })
})

describe('несколько вкладок', () => {
  it('снятие доставленной операции не стирает подход соседней вкладки', async () => {
    const seen: string[] = []
    let release: () => void = () => {}
    registerExecutor('log_set', (payload) => {
      seen.push(payload.clientId)
      if (payload.clientId !== 'a') return Promise.resolve()
      return new Promise<void>((resolve) => {
        release = resolve
      })
    })

    enqueue({ kind: 'log_set', id: 'a', payload: logSetPayload({ clientId: 'a' }) })
    const flush = flushQueue()

    // Пока наш подход ждал ответа, соседняя вкладка записала свой.
    const other: QueuedOp = {
      id: 'b',
      kind: 'log_set',
      payload: logSetPayload({ clientId: 'b' }),
      createdAt: T0,
      attempts: 0,
      status: 'pending',
      nextAttemptAt: 0,
    }
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify([...readStored(), other]))

    release()
    await flush

    expect(seen).toEqual(['a', 'b'])
    expect(readStored()).toEqual([])
  })
})

describe('retryFailed и discard', () => {
  it('retryFailed сбрасывает попытки и отправляет заново', async () => {
    let shouldFail = true
    const executor = vi.fn(async () => {
      if (shouldFail) throw pgError('42501', 'permission denied')
    })
    registerExecutor('log_set', executor)

    enqueue({ kind: 'log_set', id: 'a', payload: logSetPayload() })
    await flushQueue()
    expect(getQueueSnapshot().failed).toHaveLength(1)

    shouldFail = false
    retryFailed()
    await flushQueue()

    expect(executor).toHaveBeenCalledTimes(2)
    expect(getQueueSnapshot().ops).toEqual([])
  })

  it('discard убирает операцию из очереди и из хранилища', () => {
    enqueue({ kind: 'log_set', id: 'a', payload: logSetPayload() })
    expect(readStored()).toHaveLength(1)

    discard('a')

    expect(getQueueSnapshot().ops).toEqual([])
    expect(readStored()).toEqual([])
  })
})
