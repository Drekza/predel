import { useState, type ComponentProps } from 'react'

import type {
  Exercise,
  PendingWorkoutSet,
  SessionExerciseView,
  StatKey,
} from '@/types/domain'
import { STAT_KEYS } from '@/types/domain'
import {
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  DurationStepper,
  EmptyState,
  Field,
  Input,
  NumberStepper,
  RirStepper,
  Segmented,
  Sheet,
  Skeleton,
  Spinner,
  StatBadge,
  Textarea,
  useToast,
} from '@/components/ui'
import { ExerciseBlock } from '@/features/session/ExerciseBlock'
import { RestTimer } from '@/features/session/RestTimer'
import { SetTally } from '@/features/session/SessionPage'
import { AuthContext } from '@/features/auth/AuthProvider'
import { LoginPage } from '@/features/auth'
import { DayCard } from '@/features/session/HomePage'
import { SessionRow } from '@/features/session/HistoryPage'
import { ProgramCard } from '@/features/programs/ProgramsPage'

/**
 * Витрина дизайн-системы. Живёт только в дев-сборке и нужна ровно для одного:
 * увидеть мир целиком в браузере, не поднимая базу и не логинясь.
 * В прод-бандл маршрут не попадает — см. router.tsx.
 *
 * Фикстуры намеренно приведены через `as`: это не данные приложения, а болванки
 * для отрисовки, и повторять здесь всю схему таблиц смысла нет.
 */

const STAT_LABELS: Record<StatKey, string> = {
  chest: 'грудь',
  back: 'спина',
  shoulders: 'плечи',
  arms: 'руки',
  quads: 'квадрицепс',
  posterior: 'задняя цепь',
  core: 'кор',
}

function exercise(id: string, name: string, kind: 'strength' | 'cardio'): Exercise {
  return {
    id,
    name_ru: name,
    kind,
    weight_step_kg: kind === 'strength' ? 2.5 : 0,
  } as unknown as Exercise
}

function strengthSet(
  clientId: string,
  weightKg: number,
  reps: number,
  rir: number,
  flags: { pending?: boolean; failed?: boolean } = {},
): PendingWorkoutSet {
  return {
    client_id: clientId,
    id: clientId,
    kind: 'strength',
    weight_kg: weightKg,
    reps,
    rir,
    duration_sec: null,
    distance_m: null,
    ...flags,
  } as unknown as PendingWorkoutSet
}

const BENCH: SessionExerciseView = {
  programItemId: 'item-1',
  exercise: exercise('ex-1', 'Жим лёжа со штангой', 'strength'),
  kind: 'strength',
  orderIndex: 0,
  targetSets: 4,
  repMin: 6,
  repMax: 10,
  targetRir: 2,
  targetDurationSec: null,
  targetDistanceM: null,
  lastWeightKg: 82.5,
  lastReps: 8,
  lastDurationSec: null,
  lastDistanceM: null,
  sets: [
    strengthSet('s-1', 82.5, 10, 2),
    strengthSet('s-2', 82.5, 9, 1),
    strengthSet('s-3', 85, 7, 1, { pending: true }),
  ],
}

const ROW: SessionExerciseView = {
  programItemId: 'item-2',
  exercise: exercise('ex-2', 'Тяга штанги в наклоне', 'strength'),
  kind: 'strength',
  orderIndex: 1,
  targetSets: 3,
  repMin: 8,
  repMax: 12,
  targetRir: 2,
  targetDurationSec: null,
  targetDistanceM: null,
  lastWeightKg: 70,
  lastReps: 10,
  lastDurationSec: null,
  lastDistanceM: null,
  sets: [],
}

const TREADMILL: SessionExerciseView = {
  programItemId: 'item-3',
  exercise: exercise('ex-3', 'Бег на дорожке', 'cardio'),
  kind: 'cardio',
  orderIndex: 2,
  targetSets: 1,
  repMin: null,
  repMax: null,
  targetRir: null,
  targetDurationSec: 600,
  targetDistanceM: 1500,
  lastWeightKg: null,
  lastReps: null,
  lastDurationSec: 600,
  lastDistanceM: 1500,
  sets: [],
}

const DAY_CARD = {
  day: { id: 'day-1', name: 'День A · верх', order_index: 0 },
  exerciseCount: 5,
  strengthSetCount: 17,
  lastSessionAt: '2026-08-12T18:20:00.000Z',
} as unknown as ComponentProps<typeof DayCard>['card']

const DAY_CARD_EMPTY = {
  day: { id: 'day-2', name: 'День B · низ', order_index: 1 },
  exerciseCount: 0,
  strengthSetCount: 0,
  lastSessionAt: null,
} as unknown as ComponentProps<typeof DayCard>['card']

const PROGRAM_ACTIVE = {
  id: 'prog-1',
  name: 'Верх / низ, четыре дня',
  is_active: true,
  dayCount: 4,
  dayNames: ['День A · верх', 'День B · низ', 'День C · верх', 'День D · низ'],
} as unknown as ComponentProps<typeof ProgramCard>['program']

const PROGRAM_IDLE = {
  id: 'prog-2',
  name: 'Силовой блок на трёх днях',
  is_active: false,
  dayCount: 3,
  dayNames: ['Присед', 'Жим', 'Тяга'],
} as unknown as ComponentProps<typeof ProgramCard>['program']

const HISTORY_DONE = {
  session: { id: 'sess-1', started_at: '2026-08-13T17:05:00.000Z', state: 'finished' },
  dayName: 'День A · верх',
  totals: {
    setCount: 18,
    volumeKg: 8420,
    exerciseCount: 5,
    durationMs: 71 * 60 * 1000,
    cardioSec: 600,
    cardioDistanceM: 1500,
  },
} as unknown as ComponentProps<typeof SessionRow>['row']

const HISTORY_ABANDONED = {
  session: { id: 'sess-2', started_at: '2026-08-10T08:40:00.000Z', state: 'abandoned' },
  dayName: 'День B · низ',
  totals: {
    setCount: 3,
    volumeKg: 960,
    exerciseCount: 1,
    durationMs: 12 * 60 * 1000,
    cardioSec: 0,
    cardioDistanceM: 0,
  },
} as unknown as ComponentProps<typeof SessionRow>['row']

/** Пустая сессия для витрины: экран входа рисуется как для гостя. */
const SIGNED_OUT = {
  session: null,
  user: null,
  profile: null,
  loading: false,
  signOut: async () => {},
  signingOut: false,
}

export function Showroom() {
  const toast = useToast()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [weight, setWeight] = useState<number | null>(82.5)
  const [reps, setReps] = useState<number | null>(9)
  const [rir, setRir] = useState<number | null>(2)
  const [seconds, setSeconds] = useState<number | null>(630)
  const [mode, setMode] = useState<'day' | 'week'>('day')
  // Метка «подход был минуту с небольшим назад» — берётся один раз, чтобы
  // таймер отдыха на витрине показывал живое значение, а не прыгал при рендере.
  const [restSince] = useState(() => Date.now() - 74_000)
  const noop = () => {}

  return (
    <div className="flex flex-col gap-8 pb-16">
      <section className="flex flex-col gap-3">
        <header className="sticky top-16 z-20 -mx-4 border-b border-edge bg-body px-4 pt-1 pb-3 shadow-[0_10px_18px_-14px_rgb(0_0_0/0.95)]">
          <h2 className="truncate font-stencil text-2xl leading-tight font-medium tracking-mark uppercase text-ink">
            День A · верх
          </h2>
          <div className="mt-2.5 flex items-end gap-3">
            <SetTally done={3} planned={8} ratio={3 / 8} />
            <span className="num shrink-0 text-tally leading-none text-ink">
              3<span className="text-ink-muted">/8</span>
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <RestTimer since={restSince} />
            <span className="num text-xs text-ink-muted">42 мин</span>
            <span className="mark text-ink-muted">
              тоннаж <span className="num text-ink">2 320 кг</span>
            </span>
          </div>
        </header>

        <ExerciseBlock view={BENCH} onLog={noop} onUpdateSet={noop} onDeleteSet={noop} />
        <ExerciseBlock view={ROW} onLog={noop} onUpdateSet={noop} onDeleteSet={noop} />
        <ExerciseBlock view={TREADMILL} onLog={noop} onUpdateSet={noop} onDeleteSet={noop} />

        <div className="flex flex-col gap-2.5 pt-1">
          <Button size="lg" fullWidth>
            Завершить тренировку
          </Button>
          <Button variant="ghost" size="sm" fullWidth>
            Прервать тренировку
          </Button>
        </div>
      </section>

      <Divider label="главная: дни программы" />
      <section className="flex flex-col gap-2.5">
        <DayCard
          card={DAY_CARD}
          muted={false}
          loading={false}
          confirming={false}
          activeDayName={null}
          onStart={noop}
          onCancel={noop}
        />
        <DayCard
          card={DAY_CARD_EMPTY}
          muted
          loading={false}
          confirming={false}
          activeDayName={null}
          onStart={noop}
          onCancel={noop}
        />
      </section>

      <Divider label="программы" />
      <section className="flex flex-col gap-2.5">
        <ProgramCard
          program={PROGRAM_ACTIVE}
          confirming={false}
          busy={false}
          onToggleConfirm={noop}
          onDelete={noop}
          onActivate={noop}
        />
        <ProgramCard
          program={PROGRAM_IDLE}
          confirming={false}
          busy={false}
          onToggleConfirm={noop}
          onDelete={noop}
          onActivate={noop}
        />
      </section>

      <Divider label="история" />
      <section className="flex flex-col gap-2">
        <SessionRow row={HISTORY_DONE} onOpen={noop} />
        <SessionRow row={HISTORY_ABANDONED} onOpen={noop} />
      </section>

      <Divider label="экран входа" />
      {/* Единственный способ увидеть вход, не разлогинив живого пользователя:
          подменяем контекст авторизации пустой сессией. */}
      <section className="overflow-hidden rounded-lg border border-edge">
        <AuthContext.Provider value={SIGNED_OUT}>
          <LoginPage />
        </AuthContext.Provider>
      </section>

      <Divider label="кнопки" />
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <Button size="lg">Записать подход</Button>
          <Button size="md" variant="outline">
            К программам
          </Button>
          <Button size="sm" variant="ghost">
            Отмена
          </Button>
          <Button size="sm" variant="danger">
            Удалить
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button disabled>Недоступно</Button>
          <Button variant="outline" disabled>
            Недоступно
          </Button>
          <Button loading>Отправка</Button>
          <Button variant="outline" loading>
            Отправка
          </Button>
        </div>
      </section>

      <Divider label="ввод" />
      <section className="flex flex-col gap-4">
        <Field label="ник" hint="как тебя увидит круг">
          <Input placeholder="например, Дрекза" defaultValue="Дрекза" />
        </Field>
        <Field label="вес тела, кг">
          <Input inputMode="decimal" defaultValue="82,4" />
        </Field>
        <Field label="почта" error="Адрес без «@» — письмо не уйдёт">
          <Input invalid defaultValue="drekza.mail" />
        </Field>
        <Field label="заметка">
          <Textarea placeholder="Что стоит запомнить об этой тренировке" />
        </Field>
        <Segmented
          aria-label="Период"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'day', label: 'День' },
            { value: 'week', label: 'Неделя' },
          ]}
        />
      </section>

      <Divider label="степперы" />
      <section className="flex flex-col gap-4">
        <Field label="вес, кг">
          <NumberStepper
            value={weight}
            onChange={setWeight}
            step={2.5}
            precision={2}
            unit="кг"
            size="lg"
            aria-label="Вес в килограммах"
          />
        </Field>
        <Field label="повторы">
          <NumberStepper
            value={reps}
            onChange={setReps}
            step={1}
            precision={0}
            size="lg"
            aria-label="Повторы"
          />
        </Field>
        <RirStepper value={rir} onChange={setRir} targetRir={2} />
        <Field label="время">
          <DurationStepper valueSec={seconds} onChange={setSeconds} stepSec={30} size="lg" />
        </Field>
        <Field label="повторы, компактный размер">
          <NumberStepper value={reps} onChange={setReps} step={1} precision={0} />
        </Field>
      </section>

      <Divider label="статы фазы 2" />
      <section className="flex flex-wrap gap-1.5">
        {STAT_KEYS.map((stat, index) => (
          <StatBadge key={stat} stat={stat} label={STAT_LABELS[stat]} value={(index + 2) * 3} />
        ))}
      </section>

      <Divider label="карточка, пустой экран, ожидание" />
      <section className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            понедельник
            <span className="text-ink">
              <span className="num">4</span> упражнения
            </span>
          </CardHeader>
          <CardBody>
            <p className="text-sm leading-relaxed text-ink-muted">
              Жим лёжа, тяга в наклоне, разводка, планка. Вес и повторы предзаполнятся из прошлой
              сессии.
            </p>
          </CardBody>
          <CardFooter>
            <Button size="sm" variant="outline">
              Открыть
            </Button>
          </CardFooter>
        </Card>

        <EmptyState
          title="Программ пока нет"
          hint="Собери первую: дни, упражнения и цели по подходам."
          action={<Button size="sm">Создать программу</Button>}
        />

        <div className="flex flex-col gap-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-2/3" />
        </div>

        <div className="flex items-center gap-3 text-ink-muted">
          <Spinner size={22} />
          <span className="text-sm">Загрузка справочника</span>
        </div>
      </section>

      <Divider label="слои" />
      <section className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setSheetOpen(true)}>
          Открыть шторку
        </Button>
        <Button variant="outline" onClick={() => toast.show('Подход записан')}>
          Тост
        </Button>
        <Button variant="outline" onClick={() => toast.show('Сервер не принял подход', 'error')}>
          Тост ошибки
        </Button>
      </section>

      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="выбор упражнения">
        <div className="flex flex-col gap-2 pb-2">
          <Input placeholder="Поиск по названию" />
          <p className="text-sm leading-relaxed text-ink-muted">
            692 упражнения, поиск по названию, фильтры по группе мышц и оборудованию.
          </p>
        </div>
      </Sheet>

    </div>
  )
}

function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="mark shrink-0 text-ink-muted">{label}</span>
      <span aria-hidden className="rule-etch h-2 flex-1" />
    </div>
  )
}
