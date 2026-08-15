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
        <p className="py-2 text-center font-mono text-hud uppercase text-muted/60">
          это всё
        </p>
      )}
    </div>
  )
}

function SessionRow({ row, onOpen }: { row: HistoryRow; onOpen: () => void }) {
  const { session, dayName, totals } = row
  const abandoned = session.state === 'abandoned'
  const hasCardio = totals.cardioSec > 0 || totals.cardioDistanceM > 0

  return (
    <button
      type="button"
      onClick={onOpen}
      className="tap flex w-full items-center gap-3 rounded-lg border border-line bg-surface px-3.5 py-3 text-left transition-colors duration-100 ease-hud hover:border-accent/40"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-hud uppercase text-muted">
            {formatRelativeDay(session.started_at)}
          </span>
          <span className="font-mono text-hud text-muted/60 tabular-nums">
            {formatTime(session.started_at)}
          </span>
          {abandoned ? (
            <span className="font-mono text-[0.5625rem] tracking-label uppercase text-warn">
              прервана
            </span>
          ) : null}
        </div>

        <p className="mt-1 truncate text-[0.9375rem] leading-tight font-semibold text-text">
          {dayName ?? 'Свободная тренировка'}
        </p>

        <p className="mt-1 font-mono text-hud tracking-normal text-muted tabular-nums">
          {formatDurationMs(totals.durationMs)} · {totals.setCount} подх. ·{' '}
          {formatVolume(totals.volumeKg)}
        </p>

        {hasCardio ? (
          <p className="mt-0.5 font-mono text-hud tracking-normal text-muted/70 tabular-nums">
            кардио: {formatCardio(totals.cardioSec, totals.cardioDistanceM)}
          </p>
        ) : null}
      </div>

      <ChevronRight size={16} aria-hidden className="shrink-0 text-muted" />
    </button>
  )
}
