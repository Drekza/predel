import { useMemo, useState } from 'react'
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

  /**
   * Пластина достаётся ровно одному дню — тому, что не выполнялся дольше всех
   * (никогда не выполнявшийся идёт первым). Это подсказка глазу, а не
   * предписание: стартовать можно любой день, программа остаётся источником
   * истины. Четыре светлые полосы подряд обесценили бы саму пластину.
   */
  const suggestedDayId = useMemo(() => {
    const days = program?.days ?? []
    if (days.length === 0) return null
    const ranked = [...days].sort((a, b) => {
      if (a.lastSessionAt === null && b.lastSessionAt === null) {
        return a.day.order_index - b.day.order_index
      }
      if (a.lastSessionAt === null) return -1
      if (b.lastSessionAt === null) return 1
      return a.lastSessionAt.localeCompare(b.lastSessionAt)
    })
    return ranked[0]?.day.id ?? null
  }, [program])
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
        <section className="bezel flex flex-col gap-3 rounded-lg bg-panel-2 px-4 py-4">
          <div className="flex items-center gap-2">
            {/* Лампа станции: горит, пока идёт поверка. */}
            <span className="size-1.5 animate-pulse bg-ok" aria-hidden />
            <span className="mark text-ink">тренировка идёт</span>
          </div>
          <p className="text-lg leading-tight font-semibold text-ink">
            {activeDayName ?? 'Свободная тренировка'}
          </p>
          <p className="mark text-ink-muted">
            начата <span className="text-ink">{formatDaysAgo(session.started_at)}</span>
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
            <h2 className="mark truncate text-ink-muted">{program.program.name}</h2>
            <Link
              to={`/programs/${program.program.id}`}
              className="mark shrink-0 text-ink-muted transition-colors duration-100 ease-station hover:text-ink"
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
                muted={Boolean(session) || card.day.id !== suggestedDayId}
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

/** Экспортируется ещё и для витрины дизайн-системы (`src/dev/Showroom.tsx`). */
export function DayCard({
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
    // Брошенная сессия не возвращается — рамка киноварью предупреждает об этом.
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-stamp/60 bg-panel-2 px-4 py-3.5">
        <p className="text-sm leading-snug text-ink">
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
      </div>
    )
  }

  return (
    <Card>
      <CardBody className="flex flex-col gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-[0.9375rem] leading-tight font-semibold text-ink">
            {day.name}
          </h3>
          <p className="mark mt-1.5 text-ink-muted">
            <span className="num">{exerciseCount}</span>{' '}
            {pluralRu(exerciseCount, 'упражнение', 'упражнения', 'упражнений')}
            {strengthSetCount > 0 ? (
              <>
                {' · '}
                {formatSetsWord(strengthSetCount)}
              </>
            ) : null}
          </p>
          <p className="mark mt-1 text-ink-muted/70">
            {lastSessionAt ? (
              <>
                последний раз {formatDaysAgo(lastSessionAt)}
              </>
            ) : (
              'ещё не выполнялся'
            )}
          </p>
        </div>

        {/* Пуск дня — единственное действие карточки: пластина во всю ширину. */}
        <Button
          variant={muted ? 'outline' : 'primary'}
          size="lg"
          fullWidth
          loading={loading}
          disabled={exerciseCount === 0}
          onClick={onStart}
        >
          Начать
          <ChevronRight size={15} aria-hidden />
        </Button>
      </CardBody>
    </Card>
  )
}
