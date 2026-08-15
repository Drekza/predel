import { useNavigate } from 'react-router'
import { ChevronRight, History } from 'lucide-react'

import {
  formatCardio,
  formatDurationMs,
  formatRelativeDay,
  formatTime,
  formatVolume,
} from '@/lib/format'
import { Button, EmptyState, Skeleton } from '@/components/ui'

import { useSessionsHistory, type HistoryRow } from './api'

/** Завершённые тренировки. Дальше — по кнопке, без бесконечной ленты. */
export function HistoryPage() {
  const navigate = useNavigate()
  const query = useSessionsHistory()

  if (query.isPending) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    )
  }

  const rows = query.data?.pages.flatMap((page) => page.rows) ?? []

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<History size={22} aria-hidden />}
        title="История пуста"
        hint="Здесь появятся завершённые тренировки."
        action={<Button onClick={() => navigate('/')}>К тренировке</Button>}
      />
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {rows.map((row) => (
        <SessionRow
          key={row.session.id}
          row={row}
          onOpen={() => navigate(`/session/${row.session.id}/summary`)}
        />
      ))}

      {query.hasNextPage ? (
        <Button
          variant="outline"
          fullWidth
          loading={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          Показать ещё
        </Button>
      ) : (
        <p className="mark py-2 text-center text-ink-muted/60">это всё</p>
      )}
    </div>
  )
}

/** Экспортируется ещё и для витрины дизайн-системы (`src/dev/Showroom.tsx`). */
export function SessionRow({ row, onOpen }: { row: HistoryRow; onOpen: () => void }) {
  const { session, dayName, totals } = row
  const abandoned = session.state === 'abandoned'
  const hasCardio = totals.cardioSec > 0 || totals.cardioDistanceM > 0

  return (
    <button
      type="button"
      onClick={onOpen}
      className="bezel tap flex w-full items-center gap-3 rounded-lg bg-panel px-3.5 py-3 text-left transition-colors duration-100 ease-station hover:bg-panel-2"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="num text-xs text-ink">{formatRelativeDay(session.started_at)}</span>
          <span className="num text-xs text-ink-muted/70">
            {formatTime(session.started_at)}
          </span>
          {abandoned ? (
            <span className="font-stencil text-[0.625rem] font-medium tracking-wide-mark uppercase text-warn">
              прервана
            </span>
          ) : null}
        </div>

        <p className="mt-1.5 truncate text-[0.9375rem] leading-tight font-semibold text-ink">
          {dayName ?? 'Свободная тренировка'}
        </p>

        {/* Итоги поверенной тренировки напечатаны на пластине — их читают, а не листают. */}
        <p className="plate num mt-2 rounded-xs px-2 py-1 text-xs leading-snug">
          {formatDurationMs(totals.durationMs)} · {totals.setCount} подх. ·{' '}
          {formatVolume(totals.volumeKg)}
        </p>

        {hasCardio ? (
          <p className="mark mt-1.5 text-ink-muted">
            кардио:{' '}
            <span className="num">{formatCardio(totals.cardioSec, totals.cardioDistanceM)}</span>
          </p>
        ) : null}
      </div>

      <ChevronRight size={16} aria-hidden className="shrink-0 text-ink-muted" />
    </button>
  )
}
