import { useMemo } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router'
import { Check } from 'lucide-react'

import { cn } from '@/lib/cn'
import {
  formatCardio,
  formatDurationMs,
  formatSetsWord,
  formatStrengthSet,
  formatVolume,
  pluralRu,
} from '@/lib/format'
import type { ExerciseKind } from '@/types/domain'
import { Button, Card, CardBody, EmptyState, Skeleton } from '@/components/ui'

import { useSessionBoard } from './api'
import { computeBreakdown } from './prefill'

/**
 * Итоги тренировки.
 *
 * Фаза 1 показывает только честный факт работы: время, подходы, тоннаж и,
 * отдельной строкой, кардио. Очков, статов и уровней здесь нет — они появятся
 * в фазе 2 вместе с триггером расчёта score (спека 2 и 3).
 *
 * TODO (фаза 2): под блоком итогов встанет разбор игрового слоя —
 * прирост статов, изменение уровня, инсайты дневника и калибровка RIR.
 * Заглушку не рисуем: пустая рамка «тут что-то будет» хуже её отсутствия.
 */
export function SessionSummaryPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const board = useSessionBoard(sessionId)

  const nameIndex = useMemo(() => {
    const map = new Map<string, { name: string; kind: ExerciseKind }>()
    for (const view of board.views) {
      map.set(view.exercise.id, { name: view.exercise.name_ru, kind: view.kind })
    }
    return map
  }, [board.views])

  const breakdown = useMemo(
    () =>
      computeBreakdown(
        board.sets,
        (exerciseId) => nameIndex.get(exerciseId),
        board.views.map((view) => view.exercise.id),
      ),
    [board.sets, board.views, nameIndex],
  )

  if (!sessionId) return <Navigate to="/" replace />

  if (board.loading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (!board.session) {
    return (
      <EmptyState
        title="Тренировка не найдена"
        action={
          <Button variant="outline" onClick={() => navigate('/')}>
            На главную
          </Button>
        }
      />
    )
  }

  const { totals } = board
  const hasCardio = totals.cardioSec > 0 || totals.cardioDistanceM > 0

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1.5">
        <span className="flex items-center gap-2 font-mono text-hud uppercase text-ok">
          <Check size={14} strokeWidth={2.5} aria-hidden />
          тренировка закрыта
        </span>
        <h1 className="text-xl leading-tight font-semibold text-text">
          {board.day?.name ?? 'Свободная тренировка'}
        </h1>
      </header>

      <div className="grid grid-cols-3 gap-2">
        <Metric label="время" value={formatDurationMs(totals.durationMs)} />
        <Metric label="подходы" value={String(totals.setCount)} />
        <Metric label="тоннаж" value={formatVolume(totals.volumeKg)} />
      </div>

      {/* Кардио отдельной строкой: в тоннаж и в счёт подходов оно не входит. */}
      {hasCardio ? (
        <div className="flex items-center justify-between gap-3 rounded-md border border-line/60 bg-surface-2 px-3 py-2.5">
          <span className="font-mono text-hud uppercase text-muted">кардио</span>
          <span className="font-mono text-sm text-text tabular-nums">
            {formatCardio(totals.cardioSec, totals.cardioDistanceM)}
          </span>
        </div>
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className="font-mono text-hud uppercase text-muted">по упражнениям</h2>

        {breakdown.length === 0 ? (
          <EmptyState title="Ни одного подхода" hint="В этой тренировке ничего не записано." />
        ) : (
          breakdown.map((row) => (
            <Card key={row.exerciseId}>
              <CardBody className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-3">
                  <h3
                    className={cn(
                      'min-w-0 flex-1 truncate text-[0.9375rem] leading-tight font-semibold',
                      row.kind === 'cardio' ? 'text-muted' : 'text-text',
                    )}
                  >
                    {row.name}
                  </h3>
                  <span className="shrink-0 font-mono text-hud text-muted tabular-nums">
                    {row.kind === 'cardio'
                      ? formatCardio(row.cardioSec, row.cardioDistanceM)
                      : `${formatSetsWord(row.setCount)} · ${formatVolume(row.volumeKg)}`}
                  </span>
                </div>

                <ul className="flex flex-wrap gap-1.5">
                  {row.sets.map((set, index) => (
                    <li
                      key={set.client_id}
                      className="rounded-xs border border-line/70 bg-surface-2 px-2 py-1 font-mono text-[0.6875rem] text-muted tabular-nums"
                    >
                      <span className="text-muted/60">{index + 1}</span>{' '}
                      {set.kind === 'cardio'
                        ? formatCardio(set.duration_sec, set.distance_m)
                        : formatStrengthSet(set.weight_kg, set.reps, set.rir)}
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          ))
        )}
      </section>

      {totals.exerciseCount > 0 ? (
        <p className="font-mono text-hud text-muted">
          {totals.exerciseCount}{' '}
          {pluralRu(totals.exerciseCount, 'упражнение', 'упражнения', 'упражнений')} за тренировку
        </p>
      ) : null}

      <Button size="lg" fullWidth onClick={() => navigate('/')}>
        На главную
      </Button>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="hud-well flex flex-col gap-1 rounded-md border border-line px-2.5 py-2.5">
      <span className="font-mono text-[0.5625rem] tracking-label uppercase text-muted">
        {label}
      </span>
      <span className="font-mono text-base font-semibold text-text tabular-nums">{value}</span>
    </div>
  )
}
