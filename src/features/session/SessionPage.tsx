import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router'
import { AlertTriangle, CloudOff, Flag, RotateCw, Trash2 } from 'lucide-react'

import { cn } from '@/lib/cn'
import { formatDurationHuman, formatVolume, pluralRu } from '@/lib/format'
import { useOfflineQueue } from '@/lib/offline/queue'
import type { QueueOpKind, SetPatch } from '@/lib/offline/types'
import type { PendingWorkoutSet, SessionExerciseView, SetDraftFilled } from '@/types/domain'
import { Button, EmptyState, Skeleton, useToast } from '@/components/ui'

import { ExerciseBlock } from './ExerciseBlock'
import { RestTimer } from './RestTimer'
import {
  useAbandonSession,
  useDeleteSet,
  useFinishSession,
  useLogSet,
  useRefreshSession,
  useSessionBoard,
  useUpdateSet,
} from './api'
import { computeProgress, durationMs, lastSetAt } from './prefill'

/** Часы сессии обновляем раз в 10 секунд: минутной точности здесь достаточно. */
const CLOCK_TICK_MS = 10_000

/** Больше тридцати гнёзд лента не вмещает — дальше показываем полосу. */
const TALLY_MAX_CELLS = 30

/** Подписи операций очереди для баннера неотправленного. */
const QUEUE_OP_LABELS: Record<QueueOpKind, string> = {
  log_set: 'подход',
  update_set: 'правка подхода',
  delete_set: 'удаление подхода',
  finish_session: 'завершение тренировки',
}

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const sync = () => setNow(Date.now())
    const id = window.setInterval(sync, intervalMs)
    // Возврат из фона: время считается от метки старта, а не от числа тиков.
    document.addEventListener('visibilitychange', sync)
    window.addEventListener('focus', sync)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', sync)
      window.removeEventListener('focus', sync)
    }
  }, [intervalMs])

  return now
}

/**
 * Экран логирования тренировки.
 *
 * Всё, что нужно сделать сегодня, лежит одним списком. Подход записывается
 * между подходами, одной рукой, и появляется мгновенно — сеть догоняет.
 */
export function SessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const toast = useToast()
  const now = useNow(CLOCK_TICK_MS)

  const board = useSessionBoard(sessionId)
  const logSet = useLogSet()
  const updateSet = useUpdateSet()
  const deleteSet = useDeleteSet()
  const finishSession = useFinishSession()
  const abandonSession = useAbandonSession()
  const queue = useOfflineQueue()

  const [askFinish, setAskFinish] = useState(false)
  const [askAbandon, setAskAbandon] = useState(false)

  // Возврат из фона: пока приложение было свёрнуто, очередь могла дослать подходы.
  const refresh = useRefreshSession(sessionId)
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [refresh])

  const progress = useMemo(() => computeProgress(board.views), [board.views])
  const restSince = useMemo(() => lastSetAt(board.sets), [board.sets])
  const elapsed = durationMs(board.session?.started_at, null, now)

  const handleLog = (view: SessionExerciseView, draft: SetDraftFilled) => {
    if (!sessionId) return
    logSet.mutate({
      sessionId,
      exerciseId: view.exercise.id,
      programItemId: view.programItemId,
      // Сквозная нумерация по сессии — порядок записи, а не порядок в программе.
      orderIndex: board.sets.length,
      draft,
    })
  }

  const handleUpdate = (set: PendingWorkoutSet, patch: SetPatch) => {
    if (!sessionId) return
    updateSet.mutate({
      sessionId,
      clientId: set.client_id,
      setId: set.pending ? null : set.id,
      patch,
    })
  }

  const handleDelete = (set: PendingWorkoutSet) => {
    if (!sessionId) return
    deleteSet.mutate({ sessionId, clientId: set.client_id, setId: set.pending ? null : set.id })
    toast.show('Подход удалён')
  }

  const doFinish = () => {
    if (!sessionId) return
    finishSession.mutate(
      { sessionId },
      {
        onSuccess: () => navigate(`/session/${sessionId}/summary`, { replace: true }),
        onError: () => toast.show('Не удалось завершить тренировку', 'error'),
      },
    )
  }

  const handleFinishClick = () => {
    if (progress.untouched.length > 0 && !askFinish) {
      setAskFinish(true)
      return
    }
    doFinish()
  }

  const doAbandon = () => {
    if (!sessionId) return
    abandonSession.mutate(
      { sessionId },
      {
        onSuccess: () => {
          toast.show('Тренировка прервана')
          navigate('/', { replace: true })
        },
        onError: () => toast.show('Не удалось прервать тренировку', 'error'),
      },
    )
  }

  if (!sessionId) return <Navigate to="/" replace />

  if (board.loading) return <SessionSkeleton />

  if (!board.session) {
    return (
      <EmptyState
        title="Тренировка не найдена"
        hint="Возможно, она уже завершена или удалена."
        action={
          <Button variant="outline" onClick={() => navigate('/')}>
            На главную
          </Button>
        }
      />
    )
  }

  // Завершённую сессию логировать нельзя — её место на итоговом экране.
  if (board.session.state !== 'active') {
    return <Navigate to={`/session/${sessionId}/summary`} replace />
  }

  return (
    <div className="flex flex-col gap-3 pb-14">
      {/* Шильда сессии липнет под шапкой: лента поверки видна всю тренировку. */}
      {/* Кромка обязательна: корпус непрозрачный, и без неё пластина уезжающей
          карточки срезается встык с показаниями шильды. */}
      <header className="sticky top-16 z-20 -mx-4 border-b border-edge bg-body px-4 pt-1 pb-3 shadow-[0_10px_18px_-14px_rgb(0_0_0/0.95)]">
        {/* Название дня занимает строку целиком: это первое, что читают, и
            делить её с показаниями значит обрезать её на узком телефоне. */}
        <h2 className="truncate font-stencil text-2xl leading-tight font-medium tracking-mark uppercase text-ink">
          {board.day?.name ?? 'Свободная тренировка'}
        </h2>

        <div className="mt-2.5 flex items-end gap-3">
          <SetTally done={progress.done} planned={progress.planned} ratio={progress.ratio} />
          <span className="num shrink-0 text-tally leading-none text-ink">
            {progress.done}
            <span className="text-ink-muted">/{progress.planned}</span>
          </span>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          {/* Показания времени идут вместе с остальными показаниями, а не в
              заголовке: отдых между подходами читают чаще, чем тоннаж.
              У длительности сессии подписи нет — рядом с «отдых» она
              однозначна, а лишнее слово гонит ряд на вторую строку. */}
          <RestTimer since={restSince} />
          <span className="num text-xs text-ink-muted">
            {formatDurationHuman(elapsed === null ? null : elapsed / 1000)}
          </span>
          <span className="mark text-ink-muted">
            тоннаж <span className="num text-ink">{formatVolume(board.totals.volumeKg)}</span>
          </span>
          {/* Кардио в липкой шапке не стоит: между подходами решение принимают
              по отдыху, времени и тоннажу, а итог по кардио ждёт на сводке
              отдельной пластиной. Строка шапки дороже этого показания. */}
          {board.pending > 0 ? (
            <span className="mark flex items-center gap-1.5 text-ink-muted">
              <CloudOff size={12} aria-hidden />
              <span className="num text-ink">{board.pending}</span> в очереди
            </span>
          ) : null}
        </div>
      </header>

      {queue.failed.length > 0 ? (
        <div className="bezel flex flex-col gap-2 rounded-sm bg-panel px-3 py-2.5">
          <div className="flex items-center gap-2.5">
            <AlertTriangle size={16} aria-hidden className="shrink-0 text-warn" />
            <p className="flex-1 text-sm leading-snug text-ink">
              {queue.failed.length}{' '}
              {pluralRu(queue.failed.length, 'запись', 'записи', 'записей')} не ушли на сервер.
              Пока они здесь, остальные тоже ждут.
            </p>
            <Button size="sm" variant="outline" onClick={queue.retryFailed}>
              <RotateCw size={14} aria-hidden />
              Повторить
            </Button>
          </div>
          {/* Удалить запись — единственный выход, если сервер отказывает всегда. */}
          <ul className="flex flex-col gap-1">
            {queue.failed.map((op) => (
              <li key={op.id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-xs text-ink-muted">
                  {QUEUE_OP_LABELS[op.kind]}
                  {op.lastError ? ` · ${op.lastError}` : ''}
                </span>
                <Button size="sm" variant="ghost" onClick={() => queue.discard(op.id)}>
                  <Trash2 size={14} aria-hidden />
                  Удалить
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {board.views.length === 0 ? (
        <EmptyState
          title="В этом дне нет упражнений"
          hint="Добавь их в конструкторе программы, и они появятся здесь."
          action={
            <Button variant="outline" onClick={() => navigate('/programs')}>
              К программам
            </Button>
          }
        />
      ) : (
        board.views.map((view) => (
          <ExerciseBlock
            key={view.programItemId ?? view.exercise.id}
            view={view}
            historySet={board.history[view.exercise.id] ?? null}
            onLog={handleLog}
            onUpdateSet={handleUpdate}
            onDeleteSet={handleDelete}
          />
        ))
      )}

      {/* Завершение — инлайн, без модалок: предупреждение раскрывается на месте. */}
      <div className="flex flex-col gap-2.5 pt-1">
        {askFinish && progress.untouched.length > 0 ? (
          <div className="bezel flex flex-col gap-2 rounded-sm bg-panel px-3 py-3">
            <p className="text-sm text-ink">
              Без единого подхода {progress.untouched.length}{' '}
              {pluralRu(progress.untouched.length, 'упражнение', 'упражнения', 'упражнений')}:
            </p>
            <ul className="flex flex-col gap-0.5">
              {progress.untouched.map((view) => (
                <li key={view.exercise.id} className="truncate text-sm text-ink-muted">
                  · {view.exercise.name_ru}
                </li>
              ))}
            </ul>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" size="sm" fullWidth onClick={() => setAskFinish(false)}>
                Вернуться
              </Button>
              <Button size="sm" fullWidth loading={finishSession.isPending} onClick={doFinish}>
                Всё равно завершить
              </Button>
            </div>
          </div>
        ) : (
          <Button size="lg" fullWidth loading={finishSession.isPending} onClick={handleFinishClick}>
            <Flag size={17} aria-hidden />
            Завершить тренировку
          </Button>
        )}

        {askAbandon ? (
          <div className="bezel flex items-center gap-2 rounded-sm bg-panel px-3 py-2">
            <span className="flex-1 text-sm text-ink">Прервать без записи итогов?</span>
            <Button size="sm" variant="ghost" onClick={() => setAskAbandon(false)}>
              Нет
            </Button>
            <Button size="sm" variant="danger" onClick={doAbandon}>
              Прервать
            </Button>
          </div>
        ) : (
          <Button variant="ghost" size="sm" fullWidth onClick={() => setAskAbandon(true)}>
            Прервать тренировку
          </Button>
        )}
      </div>
    </div>
  )
}

/**
 * Лента поверки: гнездо на каждый плановый подход, поставленное клеймо —
 * киноварь. Сколько сделано и сколько осталось, читается без чтения цифр.
 */
export function SetTally({ done, planned, ratio }: { done: number; planned: number; ratio: number }) {
  const shared = 'h-3.5 flex-1 min-w-0'
  return (
    <div
      role="progressbar"
      aria-label="Прогресс тренировки"
      aria-valuemin={0}
      aria-valuemax={planned}
      aria-valuenow={done}
      className="recess flex flex-1 gap-px rounded-xs p-px"
    >
      {planned > 0 && planned <= TALLY_MAX_CELLS ? (
        Array.from({ length: planned }, (_, index) => (
          <span
            key={index}
            aria-hidden
            className={cn(shared, index < done ? 'bg-stamp' : 'bg-panel-2')}
          />
        ))
      ) : (
        <span aria-hidden className="h-3.5 w-full bg-panel-2">
          <span
            className="block h-full bg-stamp transition-[width] duration-200 ease-station"
            style={{ width: `${Math.round(ratio * 100)}%` }}
          />
        </span>
      )}
    </div>
  )
}

function SessionSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-56 w-full" />
      <Skeleton className="h-56 w-full" />
    </div>
  )
}
