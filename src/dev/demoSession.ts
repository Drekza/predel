import type { QueryClient } from '@tanstack/react-query'

import { qk } from '@/lib/keys'

/**
 * Демо-тренировка для дев-сборки: кладёт в кэш TanStack Query готовый план
 * сессии, записанные подходы и историю, после чего настоящий `/session/:id`
 * рисуется настоящими хуками, без базы и без сети.
 *
 * Нужна ровно для одного — увидеть и снять главный экран продукта, пока в базе
 * пусто. В прод-бандл модуль не попадает: он импортируется только из ветки
 * `import.meta.env.DEV` в роутере.
 */
export const DEMO_SESSION_ID = '__demo'
/** Завершённая сессия — для экрана итогов. */
export const DEMO_DONE_SESSION_ID = '__demo-done'
/** Программа — для конструктора и выбора упражнения. */
export const DEMO_PROGRAM_ID = '__demo-prog'

const EX_BENCH = 'demo-ex-bench'
const EX_ROW = 'demo-ex-row'
const EX_PRESS = 'demo-ex-press'
const EX_RUN = 'demo-ex-run'

/** Метки времени фиксированные: снимок должен быть одинаковым от запуска к запуску. */
const STARTED_AT = '2026-08-15T17:04:00.000Z'

function exercise(id: string, nameRu: string, kind: 'strength' | 'cardio', step: number) {
  return { id, name_ru: nameRu, name_en: nameRu, kind, weight_step_kg: step }
}

function item(
  id: string,
  exerciseId: string,
  orderIndex: number,
  target: {
    sets: number
    repMin?: number
    repMax?: number
    rir?: number
    durationSec?: number
    distanceM?: number
    lastWeightKg?: number
    lastReps?: number
    lastDurationSec?: number
    lastDistanceM?: number
  },
  ex: ReturnType<typeof exercise>,
) {
  return {
    id,
    exercise_id: exerciseId,
    order_index: orderIndex,
    target_sets: target.sets,
    rep_min: target.repMin ?? null,
    rep_max: target.repMax ?? null,
    target_rir: target.rir ?? null,
    target_duration_sec: target.durationSec ?? null,
    target_distance_m: target.distanceM ?? null,
    last_weight_kg: target.lastWeightKg ?? null,
    last_reps: target.lastReps ?? null,
    last_duration_sec: target.lastDurationSec ?? null,
    last_distance_m: target.lastDistanceM ?? null,
    exercise: ex,
  }
}

function loggedSet(
  index: number,
  exerciseId: string,
  weightKg: number,
  reps: number,
  rir: number,
  minutesIn: number,
) {
  return {
    id: `demo-set-${index}`,
    client_id: `demo-set-${index}`,
    session_id: DEMO_SESSION_ID,
    exercise_id: exerciseId,
    kind: 'strength',
    weight_kg: weightKg,
    reps,
    rir,
    duration_sec: null,
    distance_m: null,
    order_index: index,
    logged_at: new Date(Date.parse(STARTED_AT) + minutesIn * 60_000).toISOString(),
  }
}

export function seedDemoSession(client: QueryClient): void {
  const bench = exercise(EX_BENCH, 'Жим лёжа со штангой', 'strength', 2.5)
  const row = exercise(EX_ROW, 'Тяга штанги в наклоне', 'strength', 2.5)
  const press = exercise(EX_PRESS, 'Жим гантелей сидя', 'strength', 1.25)
  const run = exercise(EX_RUN, 'Бег на дорожке', 'cardio', 0)

  const plan = {
    session: {
      id: DEMO_SESSION_ID,
      program_day_id: 'demo-day',
      started_at: STARTED_AT,
      finished_at: null,
      state: 'active',
      total_volume_kg: 0,
    },
    day: { id: 'demo-day', name: 'День A · верх', order_index: 0 },
    items: [
      item(
        'demo-item-run',
        EX_RUN,
        0,
        { sets: 1, durationSec: 600, distanceM: 1500, lastDurationSec: 600, lastDistanceM: 1500 },
        run,
      ),
      item(
        'demo-item-bench',
        EX_BENCH,
        1,
        { sets: 4, repMin: 6, repMax: 10, rir: 2, lastWeightKg: 82.5, lastReps: 8 },
        bench,
      ),
      item(
        'demo-item-row',
        EX_ROW,
        2,
        { sets: 4, repMin: 8, repMax: 12, rir: 2, lastWeightKg: 70, lastReps: 10 },
        row,
      ),
      item(
        'demo-item-press',
        EX_PRESS,
        3,
        { sets: 3, repMin: 10, repMax: 14, rir: 2, lastWeightKg: 22.5, lastReps: 12 },
        press,
      ),
    ],
  }

  const sets = [
    loggedSet(0, EX_BENCH, 82.5, 10, 2, 6),
    loggedSet(1, EX_BENCH, 82.5, 9, 1, 10),
    loggedSet(2, EX_BENCH, 85, 7, 1, 14),
    loggedSet(3, EX_BENCH, 85, 6, 1, 18),
    loggedSet(4, EX_ROW, 70, 12, 2, 21),
    {
      ...loggedSet(5, EX_RUN, 0, 0, 0, 1),
      kind: 'cardio',
      weight_kg: null,
      reps: null,
      rir: null,
      duration_sec: 630,
      distance_m: 1500,
    },
  ]

  const exerciseIds = [...new Set(plan.items.map((entry) => entry.exercise_id))].sort()

  // Без этого react-query сходит за свежими данными сразу после монтирования
  // и затрёт демо пустым ответом из настоящей базы.
  const frozen = {
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  } as const

  client.setQueryDefaults(qk.session(DEMO_SESSION_ID), frozen)
  client.setQueryDefaults(qk.sessionSets(DEMO_SESSION_ID), frozen)
  client.setQueryDefaults([...qk.exercises(), 'last-sets', exerciseIds], frozen)

  client.setQueryData(qk.session(DEMO_SESSION_ID), plan)
  client.setQueryData(qk.sessionSets(DEMO_SESSION_ID), sets)
  client.setQueryData([...qk.exercises(), 'last-sets', exerciseIds], {
    [EX_PRESS]: {
      kind: 'strength',
      weight_kg: 22.5,
      reps: 12,
      rir: 2,
      duration_sec: null,
      distance_m: null,
    },
  })

  // --- Завершённая сессия: экран итогов ------------------------------------

  const donePlan = {
    ...plan,
    session: {
      ...plan.session,
      id: DEMO_DONE_SESSION_ID,
      finished_at: new Date(Date.parse(STARTED_AT) + 71 * 60_000).toISOString(),
      state: 'finished',
    },
  }
  const doneSets = [
    ...sets,
    loggedSet(10, EX_ROW, 70, 11, 2, 25),
    loggedSet(11, EX_ROW, 70, 10, 1, 29),
    loggedSet(12, EX_PRESS, 22.5, 14, 2, 36),
    loggedSet(13, EX_PRESS, 22.5, 12, 1, 40),
    loggedSet(14, EX_PRESS, 22.5, 11, 0, 44),
  ].map((entry) => ({ ...entry, session_id: DEMO_DONE_SESSION_ID }))

  client.setQueryDefaults(qk.session(DEMO_DONE_SESSION_ID), frozen)
  client.setQueryDefaults(qk.sessionSets(DEMO_DONE_SESSION_ID), frozen)
  client.setQueryData(qk.session(DEMO_DONE_SESSION_ID), donePlan)
  client.setQueryData(qk.sessionSets(DEMO_DONE_SESSION_ID), doneSets)

  // --- Программа: конструктор и выбор упражнения ---------------------------

  const program = {
    id: DEMO_PROGRAM_ID,
    name: 'Верх / низ, четыре дня',
    is_active: true,
    days: [
      {
        id: 'demo-day',
        program_id: DEMO_PROGRAM_ID,
        order_index: 0,
        name: 'День A · верх',
        items: plan.items.map((entry, index) => ({
          ...entry,
          program_day_id: 'demo-day',
          order_index: index,
        })),
      },
      {
        id: 'demo-day-2',
        program_id: DEMO_PROGRAM_ID,
        order_index: 1,
        name: 'День B · низ',
        items: [],
      },
    ],
  }

  client.setQueryDefaults(qk.program(DEMO_PROGRAM_ID), frozen)
  client.setQueryData(qk.program(DEMO_PROGRAM_ID), program)

  // --- Главный экран: дни активной программы -------------------------------
  // Ключ активной программы производный от qk.programs() — см. session/api.ts.
  const activeProgramKey = [...qk.programs(), 'active-with-days']
  client.setQueryDefaults(activeProgramKey, frozen)
  client.setQueryData(activeProgramKey, {
    program: { id: DEMO_PROGRAM_ID, name: program.name, is_active: true },
    days: [
      {
        day: program.days[0],
        exerciseCount: 4,
        strengthSetCount: 11,
        lastSessionAt: '2026-08-12T18:20:00.000Z',
      },
      {
        day: program.days[1],
        exerciseCount: 5,
        strengthSetCount: 15,
        lastSessionAt: '2026-08-14T18:05:00.000Z',
      },
      {
        day: { id: 'demo-day-3', program_id: DEMO_PROGRAM_ID, order_index: 2, name: 'День C · тяга' },
        exerciseCount: 4,
        strengthSetCount: 12,
        lastSessionAt: null,
      },
    ],
  })

  client.setQueryDefaults(qk.activeSession(), frozen)
  client.setQueryData(qk.activeSession(), null)
}
