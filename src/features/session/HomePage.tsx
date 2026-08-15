import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ChevronRight, Dumbbell, Play } from 'lucide-react'

import { formatDaysAgo, formatSetsWord, pluralRu } from '@/lib/format'
import { Button, Card, CardBody, EmptyState, Skeleton, useToast } from '@/components/ui'

import {
  useActiveProgram,
  useActiveSession,
  useFinishSession,
  useStartSession,
  type ProgramDayCard,
} from './api'

/**
 * Главный экран: что тренируем сегодня.
 * Если тренировка уже идёт — она и есть главное на экране.
 */
export function HomePage() {
  const navigate = useNavigate()
  const toast = useToast()

  const programQuery = useActiveProgram()
  const activeSession = useActiveSession()
  const startSession = useStartSession()
  const finishSession = useFinishSession()

  const [startingDayId, setStartingDayId] = useState<string | null>(null)
  const [confirmDayId, setConfirmDayId] = useState<string | null>(null)

  const program = programQuery.data ?? null
  const session = activeSession.data ?? null
  const activeDayName =
    session && program
      ? (program.days.find((card) => card.day.id === session.program_day_id)?.day.name ?? null)
      : null

  const start = (dayId: string) => {
    setConfirmDayId(null)
    setStartingDayId(dayId)
    startSession.mutate(dayId, {
      onSuccess: (created) => navigate(`/session/${created.id}`),
      onError: () => {
        setStartingDayId(null)
        toast.show('Не удалось начать тренировку', 'error')
      },
    })
  }

  /**
   * Пока идёт тренировка, «Начать» — деструктивное действие: сервер пометит
   * текущую сессию брошенной, её итоги и память автозаполнения пропадут.
   * Спрашиваем на месте, без модалки — как в остальных экранах.
   */
  const requestStart = (dayId: string) => {
    if (session && confirmDayId !== dayId) {
      setConfirmDayId(dayId)
      return
    }
    start(dayId)
  }

  const finish = () => {
    if (!session) return
    finishSession.mutate(
      { sessionId: session.id },
      {
        onSuccess: () => navigate(`/session/${session.id}/summary`),
        onError: () => toast.show('Не удалось завершить тренировку', 'error'),
      },
    )
  }

  if (programQuery.isPending || activeSession.isPending) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {session ? (
        <section className="hud-brackets flex flex-col gap-3 rounded-lg border border-accent/50 bg-surface px-4 py-4 shadow-hud">
          <div className="flex items-center gap-2">
            <span className="size-1.5 animate-pulse rounded-full bg-accent" aria-hidden />
            <span className="font-mono text-hud uppercase text-accent">тренировка идёт</span>
          </div>
          <p className="text-lg leading-tight font-semibold text-text">
            {activeDayName ?? 'Свободная тренировка'}
          </p>
          <p className="font-mono text-hud text-muted">
            начата {formatDaysAgo(session.started_at)}
          </p>

          <div className="flex flex-col gap-2 pt-1">
            <Button size="lg" fullWidth onClick={() => navigate(`/session/${session.id}`)}>
              <Play size={17} aria-hidden />
              Продолжить тренировку
            </Button>
            <Button
              variant="outline"
              size="md"
              fullWidth
              loading={finishSession.isPending}
              onClick={finish}
            >
              Завершить
            </Button>
          </div>
        </section>
      ) : null}

      {program ? (
        <section className="flex flex-col gap-2.5">
          <header className="flex items-baseline justify-between gap-3">
            <h2 className="truncate font-mono text-hud uppercase text-muted">
              {program.program.name}
            </h2>
            <Link
              to={`/programs/${program.program.id}`}
              className="shrink-0 font-mono text-hud uppercase text-muted transition-colors duration-100 hover:text-accent"
            >
              изменить
            </Link>
          </header>

          {program.days.length === 0 ? (
            <EmptyState
              title="В программе нет дней"
              hint="Добавь тренировочный день в конструкторе."
              action={
                <Button
                  variant="outline"
                  onClick={() => navigate(`/programs/${program.program.id}`)}
                >
                  Открыть конструктор
                </Button>
              }
            />
          ) : (
            program.days.map((card) => (
              <DayCard
                key={card.day.id}
                card={card}
                muted={Boolean(session)}
                loading={startingDayId === card.day.id && startSession.isPending}
                confirming={confirmDayId === card.day.id}
                activeDayName={activeDayName}
                onStart={() => requestStart(card.day.id)}
                onCancel={() => setConfirmDayId(null)}
              />
            ))
          )}
        </section>
      ) : (
        <EmptyState
          icon={<Dumbbell size={22} aria-hidden />}
          title="Нет активной программы"
          hint="Программа — единственный источник истины о том, что делать сегодня. Собери её в конструкторе."
          action={<Button onClick={() => navigate('/programs')}>Собрать программу</Button>}
        />
      )}
    </div>
  )
}

function DayCard({
  card,
  muted,
  loading,
  confirming,
  activeDayName,
  onStart,
  onCancel,
}: {
  card: ProgramDayCard
  muted: boolean
  loading: boolean
  /** Идёт тренировка, и пользователь уже нажал «Начать» на этом дне. */
  confirming: boolean
  activeDayName: string | null
  onStart: () => void
  onCancel: () => void
}) {
  const { day, exerciseCount, strengthSetCount, lastSessionAt } = card

  if (confirming) {
    return (
      <Card>
        <CardBody className="flex flex-col gap-2">
          <p className="text-sm text-text">
            Идёт тренировка «{activeDayName ?? 'Свободная тренировка'}». Начать «{day.name}»
            значит бросить её без итогов.
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" fullWidth onClick={onCancel}>
              Отмена
            </Button>
            <Button variant="danger" size="sm" fullWidth loading={loading} onClick={onStart}>
              Бросить и начать
            </Button>
          </div>
        </CardBody>
      </Card>
    )
  }

  return (
    <Card>
      <CardBody className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[0.9375rem] leading-tight font-semibold text-text">
            {day.name}
          </h3>
          <p className="mt-1 font-mono text-hud tracking-normal text-muted">
            {exerciseCount}{' '}
            {pluralRu(exerciseCount, 'упражнение', 'упражнения', 'упражнений')}
            {strengthSetCount > 0 ? ` · ${formatSetsWord(strengthSetCount)}` : ''}
          </p>
          <p className="mt-0.5 font-mono text-hud tracking-normal text-muted/70">
            {lastSessionAt ? `последний раз ${formatDaysAgo(lastSessionAt)}` : 'ещё не выполнялся'}
          </p>
        </div>

        <Button
          variant={muted ? 'outline' : 'primary'}
          size="md"
          loading={loading}
          disabled={exerciseCount === 0}
          onClick={onStart}
          className="shrink-0"
        >
          Начать
          <ChevronRight size={15} aria-hidden />
        </Button>
      </CardBody>
    </Card>
  )
}
