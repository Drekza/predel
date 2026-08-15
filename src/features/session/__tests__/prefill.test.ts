import { describe, expect, it } from 'vitest'

import type { QueuedOp } from '@/lib/offline/types'
import type {
  Exercise,
  PendingWorkoutSet,
  SessionExerciseView,
  WorkoutSet,
} from '@/types/domain'

import {
  DEFAULT_CARDIO_SEC,
  DEFAULT_REPS,
  DEFAULT_RIR,
  computeBreakdown,
  computeProgress,
  computeSessionTotals,
  draftForExercise,
  durationMs,
  hasQueuedFinish,
  lastSetAt,
  mergeQueuedSets,
  nextCardioDraft,
  nextSetDraft,
  nextStrengthDraft,
  secondsSince,
  setVolumeKg,
  type SetLike,
} from '../prefill'

// --- Фабрики ---------------------------------------------------------------

function strengthSet(over: Partial<SetLike> = {}): SetLike {
  return {
    kind: 'strength',
    weight_kg: 60,
    reps: 10,
    rir: 2,
    duration_sec: null,
    distance_m: null,
    ...over,
  }
}

function cardioSet(over: Partial<SetLike> = {}): SetLike {
  return {
    kind: 'cardio',
    weight_kg: null,
    reps: null,
    rir: null,
    duration_sec: 600,
    distance_m: 1800,
    ...over,
  }
}

function row(over: Partial<WorkoutSet> = {}): WorkoutSet {
  return {
    id: 'srv-1',
    session_id: 'S1',
    exercise_id: 'E1',
    program_item_id: 'PI1',
    order_index: 0,
    kind: 'strength',
    weight_kg: 60,
    reps: 10,
    rir: 2,
    duration_sec: null,
    distance_m: null,
    e1rm: null,
    e1rm_ref: null,
    ri: null,
    score: null,
    client_id: 'c1',
    logged_at: '2026-08-15T10:00:00.000Z',
    ...over,
  }
}

function exercise(over: Partial<Exercise> = {}): Exercise {
  return {
    id: 'E1',
    slug: 'bench-press',
    name_ru: 'Жим лёжа',
    name_en: 'Bench press',
    kind: 'strength',
    equipment: 'barbell',
    category: null,
    mechanic: null,
    force: null,
    level: null,
    primary_muscles: ['chest'],
    secondary_muscles: ['triceps'],
    weight_step_kg: 2.5,
    is_custom: false,
    owner_id: null,
    created_at: '2026-08-01T00:00:00.000Z',
    ...over,
  }
}

function view(over: Partial<SessionExerciseView> = {}): SessionExerciseView {
  return {
    programItemId: 'PI1',
    exercise: exercise(),
    kind: 'strength',
    orderIndex: 0,
    targetSets: 3,
    repMin: 8,
    repMax: 12,
    targetRir: 2,
    targetDurationSec: null,
    targetDistanceM: null,
    lastWeightKg: null,
    lastReps: null,
    lastDurationSec: null,
    lastDistanceM: null,
    sets: [],
    ...over,
  }
}

function logOp(over: Partial<QueuedOp<'log_set'>['payload']> = {}, id = 'q1'): QueuedOp {
  return {
    id,
    kind: 'log_set',
    createdAt: 0,
    attempts: 0,
    status: 'pending',
    nextAttemptAt: 0,
    payload: {
      sessionId: 'S1',
      clientId: id,
      exerciseId: 'E1',
      programItemId: 'PI1',
      orderIndex: 1,
      kind: 'strength',
      weightKg: 70,
      reps: 8,
      rir: 1,
      durationSec: null,
      distanceM: null,
      loggedAt: '2026-08-15T10:05:00.000Z',
      ...over,
    },
  }
}

// --- Силовое предзаполнение ------------------------------------------------

describe('nextStrengthDraft — первый подход упражнения', () => {
  it('берёт вес и повторы из памяти пункта программы', () => {
    expect(nextStrengthDraft({ lastWeightKg: 82.5, lastReps: 9, targetRir: 2 })).toEqual({
      kind: 'strength',
      weightKg: 82.5,
      reps: 9,
      rir: 2,
    })
  })

  it('падает на историю пользователя, когда памяти у программы нет', () => {
    const draft = nextStrengthDraft({
      historySet: strengthSet({ weight_kg: 75, reps: 6 }),
      targetRir: 3,
    })
    expect(draft).toEqual({ kind: 'strength', weightKg: 75, reps: 6, rir: 3 })
  })

  it('память программы важнее истории', () => {
    const draft = nextStrengthDraft({
      lastWeightKg: 60,
      lastReps: 12,
      historySet: strengthSet({ weight_kg: 100, reps: 3 }),
    })
    expect(draft.weightKg).toBe(60)
    expect(draft.reps).toBe(12)
  })

  it('без памяти и истории оставляет вес пустым, а повторы берёт из низа диапазона', () => {
    expect(nextStrengthDraft({ repMin: 6, repMax: 10 })).toEqual({
      kind: 'strength',
      weightKg: null,
      reps: 6,
      rir: DEFAULT_RIR,
    })
  })

  it('без диапазона повторов подставляет значение по умолчанию', () => {
    const draft = nextStrengthDraft({})
    expect(draft.weightKg).toBeNull()
    expect(draft.reps).toBe(DEFAULT_REPS)
  })

  it('добирает повторы независимо от веса, если память неполная', () => {
    const draft = nextStrengthDraft({
      lastWeightKg: 40,
      lastReps: null,
      historySet: strengthSet({ weight_kg: 100, reps: 7 }),
    })
    expect(draft.weightKg).toBe(40)
    expect(draft.reps).toBe(7)
  })

  it('повторы уходят в диапазон, когда их нет ни в памяти, ни в истории', () => {
    const draft = nextStrengthDraft({
      lastWeightKg: 40,
      historySet: strengthSet({ weight_kg: 100, reps: null }),
      repMin: 5,
    })
    expect(draft.weightKg).toBe(40)
    expect(draft.reps).toBe(5)
  })

  it('вес 0 — это вес, а не пустота (упражнения с весом тела)', () => {
    const draft = nextStrengthDraft({ lastWeightKg: 0, lastReps: 15 })
    expect(draft.weightKg).toBe(0)
    expect(draft.reps).toBe(15)
  })

  it('нулевой вес из истории тоже переживает предзаполнение', () => {
    const draft = nextStrengthDraft({ historySet: strengthSet({ weight_kg: 0, reps: 12 }) })
    expect(draft.weightKg).toBe(0)
  })
})

describe('nextStrengthDraft — RIR', () => {
  it('всегда предзаполнен целевым запасом', () => {
    expect(nextStrengthDraft({ targetRir: 1 }).rir).toBe(1)
  })

  it('без цели подставляет 2 — физиологический оптимум из спеки', () => {
    expect(nextStrengthDraft({}).rir).toBe(DEFAULT_RIR)
    expect(nextStrengthDraft({ targetRir: null }).rir).toBe(DEFAULT_RIR)
  })

  it('целевой RIR 0 не подменяется значением по умолчанию', () => {
    expect(nextStrengthDraft({ targetRir: 0 }).rir).toBe(0)
  })

  it('не наследует RIR предыдущего подхода: цель не должна уползать', () => {
    const draft = nextStrengthDraft({
      targetRir: 2,
      sessionSets: [strengthSet({ rir: 0 })],
    })
    expect(draft.rir).toBe(2)
  })
})

describe('nextStrengthDraft — последующие подходы', () => {
  it('повторяет предыдущий подход этой же сессии', () => {
    const draft = nextStrengthDraft({
      lastWeightKg: 60,
      lastReps: 10,
      sessionSets: [strengthSet({ weight_kg: 62.5, reps: 11 })],
    })
    expect(draft.weightKg).toBe(62.5)
    expect(draft.reps).toBe(11)
  })

  it('берёт именно последний подход, а не первый', () => {
    const draft = nextStrengthDraft({
      sessionSets: [
        strengthSet({ weight_kg: 60, reps: 12 }),
        strengthSet({ weight_kg: 65, reps: 10 }),
        strengthSet({ weight_kg: 70, reps: 8 }),
      ],
    })
    expect(draft.weightKg).toBe(70)
    expect(draft.reps).toBe(8)
  })

  it('вес 0 предыдущего подхода сохраняется', () => {
    const draft = nextStrengthDraft({ sessionSets: [strengthSet({ weight_kg: 0, reps: 20 })] })
    expect(draft.weightKg).toBe(0)
  })

  it('игнорирует кардио-отрезки при поиске предыдущего силового подхода', () => {
    const draft = nextStrengthDraft({
      lastWeightKg: 50,
      lastReps: 5,
      sessionSets: [cardioSet()],
    })
    expect(draft.weightKg).toBe(50)
    expect(draft.reps).toBe(5)
  })
})

// --- Кардио ----------------------------------------------------------------

describe('nextCardioDraft', () => {
  it('первый отрезок берёт цели пункта программы', () => {
    expect(nextCardioDraft({ targetDurationSec: 900, targetDistanceM: 2000 })).toEqual({
      kind: 'cardio',
      durationSec: 900,
      distanceM: 2000,
    })
  })

  it('без целей падает на память прошлого раза', () => {
    expect(nextCardioDraft({ lastDurationSec: 720, lastDistanceM: 1500 })).toEqual({
      kind: 'cardio',
      durationSec: 720,
      distanceM: 1500,
    })
  })

  it('цель важнее памяти', () => {
    const draft = nextCardioDraft({
      targetDurationSec: 600,
      lastDurationSec: 1200,
    })
    expect(draft.durationSec).toBe(600)
  })

  it('без целей и памяти — 10 минут без дистанции', () => {
    expect(nextCardioDraft({})).toEqual({
      kind: 'cardio',
      durationSec: DEFAULT_CARDIO_SEC,
      distanceM: null,
    })
  })

  it('время и дистанция подбираются независимо', () => {
    const draft = nextCardioDraft({ targetDurationSec: 300, lastDistanceM: 900 })
    expect(draft.durationSec).toBe(300)
    expect(draft.distanceM).toBe(900)
  })

  it('кардио без дистанции остаётся без дистанции', () => {
    const draft = nextCardioDraft({ targetDurationSec: 600 })
    expect(draft.distanceM).toBeNull()
  })

  it('последующий отрезок повторяет предыдущий в этой сессии', () => {
    const draft = nextCardioDraft({
      targetDurationSec: 600,
      sessionSets: [cardioSet({ duration_sec: 420, distance_m: 1100 })],
    })
    expect(draft).toEqual({ kind: 'cardio', durationSec: 420, distanceM: 1100 })
  })

  it('предыдущий отрезок без дистанции не выдумывает её из цели', () => {
    const draft = nextCardioDraft({
      targetDistanceM: 5000,
      sessionSets: [cardioSet({ duration_sec: 300, distance_m: null })],
    })
    expect(draft.distanceM).toBeNull()
    expect(draft.durationSec).toBe(300)
  })

  it('не заглядывает в историю пользователя — кардио вне зачёта', () => {
    const draft = nextCardioDraft({ historySet: cardioSet({ duration_sec: 3600 }) })
    expect(draft.durationSec).toBe(DEFAULT_CARDIO_SEC)
  })
})

describe('nextSetDraft / draftForExercise', () => {
  it('выбирает форму черновика по виду упражнения', () => {
    expect(nextSetDraft('cardio', {}).kind).toBe('cardio')
    expect(nextSetDraft('strength', {}).kind).toBe('strength')
  })

  it('собирает вход предзаполнения прямо из карточки упражнения', () => {
    const draft = draftForExercise(view({ lastWeightKg: 55, lastReps: 11, targetRir: 1 }))
    expect(draft).toEqual({ kind: 'strength', weightKg: 55, reps: 11, rir: 1 })
  })

  it('кардио-карточка даёт кардио-черновик', () => {
    const draft = draftForExercise(
      view({
        kind: 'cardio',
        exercise: exercise({ kind: 'cardio', name_ru: 'Бег' }),
        repMin: null,
        repMax: null,
        targetRir: null,
        targetDurationSec: 480,
      }),
    )
    expect(draft).toEqual({ kind: 'cardio', durationSec: 480, distanceM: null })
  })

  it('подхватывает историю, переданную извне', () => {
    const draft = draftForExercise(view(), strengthSet({ weight_kg: 90, reps: 4 }))
    expect(draft.kind === 'strength' && draft.weightKg).toBe(90)
  })
})

// --- Наложение очереди -----------------------------------------------------

describe('mergeQueuedSets', () => {
  it('без очереди отдаёт серверные строки по времени', () => {
    const merged = mergeQueuedSets(
      [
        row({ client_id: 'b', logged_at: '2026-08-15T10:10:00.000Z' }),
        row({ client_id: 'a', logged_at: '2026-08-15T10:00:00.000Z' }),
      ],
      [],
      'S1',
    )
    expect(merged.map((set) => set.client_id)).toEqual(['a', 'b'])
    expect(merged.every((set) => set.pending !== true)).toBe(true)
  })

  it('показывает неотправленный подход из очереди и метит его', () => {
    const merged = mergeQueuedSets([], [logOp({}, 'q1')], 'S1')
    expect(merged).toHaveLength(1)
    expect(merged[0]?.pending).toBe(true)
    expect(merged[0]?.weight_kg).toBe(70)
    expect(merged[0]?.client_id).toBe('q1')
  })

  it('не двоит строку, которая уже пришла с сервера', () => {
    const merged = mergeQueuedSets([row({ client_id: 'q1' })], [logOp({}, 'q1')], 'S1')
    expect(merged).toHaveLength(1)
    expect(merged[0]?.pending).toBeUndefined()
    // Выигрывает серверное значение, а не то, что осталось в очереди.
    expect(merged[0]?.weight_kg).toBe(60)
  })

  it('накладывает правку из очереди поверх серверной строки', () => {
    const update: QueuedOp = {
      id: 'u1',
      kind: 'update_set',
      createdAt: 0,
      attempts: 0,
      status: 'pending',
      nextAttemptAt: 0,
      payload: { sessionId: 'S1', setId: 'srv-1', clientId: 'c1', patch: { reps: 12 } },
    }
    const merged = mergeQueuedSets([row({ client_id: 'c1', reps: 10 })], [update], 'S1')
    expect(merged[0]?.reps).toBe(12)
    expect(merged[0]?.weight_kg).toBe(60)
    expect(merged[0]?.pending).toBe(true)
  })

  it('скрывает строку, удаление которой ещё не доехало', () => {
    const remove: QueuedOp = {
      id: 'd1',
      kind: 'delete_set',
      createdAt: 0,
      attempts: 0,
      status: 'pending',
      nextAttemptAt: 0,
      payload: { sessionId: 'S1', setId: 'srv-1', clientId: 'c1' },
    }
    expect(mergeQueuedSets([row({ client_id: 'c1' })], [remove], 'S1')).toHaveLength(0)
  })

  it('не трогает подходы чужой сессии', () => {
    const merged = mergeQueuedSets([], [logOp({ sessionId: 'OTHER' }, 'q9')], 'S1')
    expect(merged).toHaveLength(0)
  })

  it('кардио-отрезок из очереди сохраняет форму без веса и повторов', () => {
    const op = logOp(
      {
        kind: 'cardio',
        weightKg: null,
        reps: null,
        rir: null,
        durationSec: 600,
        distanceM: 1800,
      },
      'q2',
    )
    const merged = mergeQueuedSets([], [op], 'S1')
    expect(merged[0]?.kind).toBe('cardio')
    expect(merged[0]?.duration_sec).toBe(600)
    expect(merged[0]?.weight_kg).toBeNull()
    expect(merged[0]?.rir).toBeNull()
  })

  it('игровые поля оптимистичной строки пустые — очки считает фаза 2', () => {
    const merged = mergeQueuedSets([], [logOp()], 'S1')
    expect(merged[0]?.score).toBeNull()
    expect(merged[0]?.e1rm).toBeNull()
    expect(merged[0]?.ri).toBeNull()
  })
})

describe('hasQueuedFinish', () => {
  const finish: QueuedOp = {
    id: 'f1',
    kind: 'finish_session',
    createdAt: 0,
    attempts: 0,
    status: 'pending',
    nextAttemptAt: 0,
    payload: { sessionId: 'S1', state: 'finished', note: null },
  }

  it('находит незавершённое закрытие своей сессии', () => {
    expect(hasQueuedFinish([finish], 'S1')).toBe(true)
  })

  it('не путает сессии', () => {
    expect(hasQueuedFinish([finish], 'S2')).toBe(false)
  })

  it('провалившееся закрытие не прячет активную тренировку', () => {
    // На сервере сессия осталась активной: спрятать её значит предложить
    // начать новую и молча бросить старую.
    expect(hasQueuedFinish([{ ...finish, status: 'failed' }], 'S1')).toBe(false)
  })
})

// --- Счётчики --------------------------------------------------------------

describe('setVolumeKg', () => {
  it('считает тоннаж силового подхода', () => {
    expect(setVolumeKg(strengthSet({ weight_kg: 80, reps: 5 }))).toBe(400)
  })

  it('кардио тоннажа не даёт', () => {
    expect(setVolumeKg(cardioSet())).toBe(0)
  })

  it('неполный подход даёт ноль, а не NaN', () => {
    expect(setVolumeKg(strengthSet({ weight_kg: null }))).toBe(0)
    expect(setVolumeKg(strengthSet({ reps: null }))).toBe(0)
  })

  it('вес тела 0 кг даёт нулевой тоннаж без ошибок', () => {
    expect(setVolumeKg(strengthSet({ weight_kg: 0, reps: 20 }))).toBe(0)
  })
})

describe('computeSessionTotals', () => {
  it('считает подходы и тоннаж только по силовой работе', () => {
    const totals = computeSessionTotals([
      strengthSet({ weight_kg: 100, reps: 5 }),
      strengthSet({ weight_kg: 100, reps: 5 }),
      cardioSet({ duration_sec: 600, distance_m: 1800 }),
    ])
    expect(totals.setCount).toBe(2)
    expect(totals.volumeKg).toBe(1000)
  })

  it('кардио живёт в отдельных счётчиках', () => {
    const totals = computeSessionTotals([
      cardioSet({ duration_sec: 600, distance_m: 1800 }),
      cardioSet({ duration_sec: 120, distance_m: 300 }),
    ])
    expect(totals.cardioSec).toBe(720)
    expect(totals.cardioDistanceM).toBe(2100)
    expect(totals.setCount).toBe(0)
    expect(totals.volumeKg).toBe(0)
  })

  it('кардио без дистанции не ломает сумму', () => {
    const totals = computeSessionTotals([cardioSet({ duration_sec: 300, distance_m: null })])
    expect(totals.cardioSec).toBe(300)
    expect(totals.cardioDistanceM).toBe(0)
  })

  it('считает длительность по меткам времени', () => {
    const totals = computeSessionTotals([], {
      startedAt: '2026-08-15T10:00:00.000Z',
      finishedAt: '2026-08-15T11:30:00.000Z',
    })
    expect(totals.durationMs).toBe(90 * 60 * 1000)
  })

  it('считает разные упражнения', () => {
    const totals = computeSessionTotals([
      { ...strengthSet(), exercise_id: 'E1' } as SetLike,
      { ...strengthSet(), exercise_id: 'E1' } as SetLike,
      { ...strengthSet(), exercise_id: 'E2' } as SetLike,
    ])
    expect(totals.exerciseCount).toBe(2)
  })
})

describe('durationMs / secondsSince / lastSetAt', () => {
  it('без старта длительности нет', () => {
    expect(durationMs(null)).toBeNull()
  })

  it('незавершённая сессия считается до текущего момента', () => {
    const now = Date.parse('2026-08-15T10:30:00.000Z')
    expect(durationMs('2026-08-15T10:00:00.000Z', null, now)).toBe(30 * 60 * 1000)
  })

  it('битая метка времени не ломает счёт', () => {
    expect(durationMs('не дата')).toBeNull()
  })

  it('секунды считаются от метки, а не от числа тиков', () => {
    const now = Date.parse('2026-08-15T10:02:30.000Z')
    expect(secondsSince('2026-08-15T10:00:00.000Z', now)).toBe(150)
  })

  it('время в будущем не даёт отрицательных секунд', () => {
    const now = Date.parse('2026-08-15T10:00:00.000Z')
    expect(secondsSince('2026-08-15T10:05:00.000Z', now)).toBe(0)
  })

  it('находит время последнего подхода', () => {
    const sets: PendingWorkoutSet[] = [
      row({ logged_at: '2026-08-15T10:00:00.000Z' }),
      row({ logged_at: '2026-08-15T10:20:00.000Z' }),
      row({ logged_at: '2026-08-15T10:10:00.000Z' }),
    ]
    expect(lastSetAt(sets)).toBe(Date.parse('2026-08-15T10:20:00.000Z'))
  })

  it('без подходов таймера отдыха нет', () => {
    expect(lastSetAt([])).toBeNull()
  })
})

// --- Прогресс --------------------------------------------------------------

describe('computeProgress', () => {
  it('считает план по силовым упражнениям', () => {
    const progress = computeProgress([
      view({ targetSets: 3, sets: [row(), row()] }),
      view({ targetSets: 4, sets: [] }),
    ])
    expect(progress.planned).toBe(7)
    expect(progress.done).toBe(2)
  })

  it('кардио не входит ни в план, ни в сделанное', () => {
    const progress = computeProgress([
      view({ targetSets: 3, sets: [row()] }),
      view({
        kind: 'cardio',
        targetSets: 2,
        sets: [row({ kind: 'cardio', weight_kg: null, reps: null, rir: null })],
      }),
    ])
    expect(progress.planned).toBe(3)
    expect(progress.done).toBe(1)
  })

  it('перечисляет силовые упражнения без единого подхода', () => {
    const untouched = view({ exercise: exercise({ id: 'E2', name_ru: 'Тяга' }), sets: [] })
    const progress = computeProgress([view({ sets: [row()] }), untouched])
    expect(progress.untouched).toHaveLength(1)
    expect(progress.untouched[0]?.exercise.name_ru).toBe('Тяга')
  })

  it('доля не переваливает за единицу при перевыполнении', () => {
    const progress = computeProgress([view({ targetSets: 1, sets: [row(), row(), row()] })])
    expect(progress.ratio).toBe(1)
  })

  it('пустой день не делит на ноль', () => {
    expect(computeProgress([]).ratio).toBe(0)
  })
})

// --- Разбивка --------------------------------------------------------------

describe('computeBreakdown', () => {
  const nameOf = (id: string) =>
    id === 'E1'
      ? { name: 'Жим лёжа', kind: 'strength' as const }
      : id === 'E2'
        ? { name: 'Бег', kind: 'cardio' as const }
        : undefined

  it('группирует подходы по упражнениям и считает тоннаж', () => {
    const rows = computeBreakdown(
      [
        row({ exercise_id: 'E1', client_id: 'a', weight_kg: 100, reps: 5 }),
        row({ exercise_id: 'E1', client_id: 'b', weight_kg: 100, reps: 5 }),
      ],
      nameOf,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]?.setCount).toBe(2)
    expect(rows[0]?.volumeKg).toBe(1000)
    expect(rows[0]?.name).toBe('Жим лёжа')
  })

  it('кардио идёт временем и дистанцией, а не подходами', () => {
    const rows = computeBreakdown(
      [
        row({
          exercise_id: 'E2',
          client_id: 'c',
          kind: 'cardio',
          weight_kg: null,
          reps: null,
          rir: null,
          duration_sec: 600,
          distance_m: 1800,
        }),
      ],
      nameOf,
    )
    expect(rows[0]?.setCount).toBe(0)
    expect(rows[0]?.volumeKg).toBe(0)
    expect(rows[0]?.cardioSec).toBe(600)
    expect(rows[0]?.cardioDistanceM).toBe(1800)
  })

  it('соблюдает порядок упражнений в программе', () => {
    const rows = computeBreakdown(
      [
        row({ exercise_id: 'E2', client_id: 'c' }),
        row({ exercise_id: 'E1', client_id: 'a' }),
      ],
      nameOf,
      ['E1', 'E2'],
    )
    expect(rows.map((item) => item.exerciseId)).toEqual(['E1', 'E2'])
  })

  it('неизвестное упражнение не роняет разбивку', () => {
    const rows = computeBreakdown([row({ exercise_id: 'E9', client_id: 'z' })], nameOf)
    expect(rows[0]?.name).toBe('Упражнение')
  })
})
