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
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h1 className="font-stencil text-xl leading-tight font-medium tracking-mark uppercase text-ink">
          {board.day?.name ?? 'Свободная тренировка'}
        </h1>
        {/* Клеймо поверки: тренировка закрыта, её итог больше не меняется.
            Стоит рядом с названием, а не над ним: это отметка, не рубрика. */}
        <span className="stamped animate-stamp mark inline-flex items-center gap-1.5 rounded-xs px-2 py-1.5">
          <Check size={14} strokeWidth={2.5} aria-hidden />
          тренировка закрыта
        </span>
      </header>

      {/* Итог — одна крупная пластина: три показания, отпечатанные разом. */}
      <div className="plate plate-etch flex flex-col divide-y divide-plate-etch/70 rounded-lg px-4 pt-2 pb-6">
        <Metric label="время" value={formatDurationMs(totals.durationMs)} />
        <Metric label="подходы" value={String(totals.setCount)} />
        <Metric label="тоннаж" value={formatVolume(totals.volumeKg)} />
      </div>

      {/* Кардио отдельной строкой: в тоннаж и в счёт подходов оно не входит. */}
      {hasCardio ? (
        <div className="flex items-center justify-between gap-3 rounded-sm border border-edge/60 bg-panel-2 px-3 py-2.5">
          <span className="mark text-ink-muted">кардио</span>
          <span className="num text-sm text-ink">
            {formatCardio(totals.cardioSec, totals.cardioDistanceM)}
          </span>
        </div>
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className="mark text-ink-muted">по упражнениям</h2>

        {breakdown.length === 0 ? (
          <EmptyState title="Ни одного подхода" hint="В этой тренировке ничего не записано." />
        ) : (
          breakdown.map((row) => (
            <Card key={row.exerciseId}>
              <CardBody className="flex flex-col gap-2.5">
                {/* Название на своей строке: делить её с итогами значит резать
                    многоточием то, ради чего строку и читают. */}
                <div className="flex flex-col gap-1">
                  <h3
                    className={cn(
                      'text-[0.9375rem] leading-snug font-semibold',
                      row.kind === 'cardio' ? 'text-ink-muted' : 'text-ink',
                    )}
                  >
                    {row.name}
                  </h3>
                  <span className="num text-xs text-ink-muted">
                    {row.kind === 'cardio'
                      ? formatCardio(row.cardioSec, row.cardioDistanceM)
                      : `${formatSetsWord(row.setCount)} · ${formatVolume(row.volumeKg)}`}
                  </span>
                </div>

                {/* Каждый подход — гнездо с поставленным клеймом номера. */}
                <ul className="flex flex-wrap gap-1.5">
                  {row.sets.map((set, index) => (
                    <li
                      key={set.client_id}
                      className="recess num rounded-xs px-2 py-1 text-[0.6875rem] text-ink-muted"
                    >
                      <span className="text-stamp">{index + 1}</span>{' '}
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
        <p className="text-xs text-ink-muted">
          <span className="num text-ink">{totals.exerciseCount}</span>{' '}
          {pluralRu(totals.exerciseCount, 'упражнение', 'упражнения', 'упражнений')} за тренировку
        </p>
      ) : null}

      <Button size="lg" fullWidth onClick={() => navigate('/')}>
        На главную
      </Button>
    </div>
  )
}

/** Строка показания на итоговой пластине: метка слева, число справа. */
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-3">
      <span className="mark text-plate-muted">{label}</span>
      <span className="num text-2xl leading-none font-semibold tracking-tight text-plate-ink">
        {value}
      </span>
    </div>
  )
}
