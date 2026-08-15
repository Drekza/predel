/**
 * Чистая логика экрана сессии. Ни React, ни Supabase — только данные.
 *
 * Здесь живёт то, что нельзя сломать незаметно:
 *  - предзаполнение следующего подхода (спека 9.2, пункты 2 и 3);
 *  - наложение офлайн-очереди на серверные строки (спека 10.4);
 *  - счётчики сессии (тоннаж, прогресс, кардио отдельной строкой).
 *
 * Главное правило файла: 0 — это значение, а не пустота.
 * Подтягивания с весом 0 кг и разминочный подход на 0 кг обязаны пережить
 * предзаполнение, поэтому нигде не используется проверка на truthiness.
 */

import {
  CARDIO_DISTANCE_MAX_M,
  CARDIO_DURATION_MAX_SEC,
  REPS_MIN,
  WEIGHT_MIN_KG,
} from '@/lib/constants'
import { EM_DASH, formatCardio, formatRepRange, formatRir } from '@/lib/format'
import type { QueuedOp } from '@/lib/offline/types'
import type {
  CardioSetDraft,
  ExerciseKind,
  PendingWorkoutSet,
  SessionExerciseView,
  SessionTotals,
  SetDraft,
  SetDraftFilled,
  StrengthSetDraft,
  WorkoutSet,
} from '@/types/domain'

/** Повторы по умолчанию, когда нет ни памяти, ни истории, ни диапазона. */
export const DEFAULT_REPS = 8
/** Целевой запас по умолчанию: пик k_effort в спеке стоит на RIR 1–2. */
export const DEFAULT_RIR = 2
/** Кардио по умолчанию — 10 минут разминочного бега. */
export const DEFAULT_CARDIO_SEC = 600

/** Минимум полей подхода, нужный логике предзаполнения. */
export type SetLike = Pick<
  WorkoutSet,
  'kind' | 'weight_kg' | 'reps' | 'rir' | 'duration_sec' | 'distance_m'
>

/** Цели и память из program_items — то, что знает программа об упражнении. */
export type PrefillMemory = {
  lastWeightKg?: number | null
  lastReps?: number | null
  lastDurationSec?: number | null
  lastDistanceM?: number | null
  repMin?: number | null
  repMax?: number | null
  targetRir?: number | null
  targetDurationSec?: number | null
  targetDistanceM?: number | null
}

export type PrefillInput = PrefillMemory & {
  /** Подходы этого упражнения в текущей сессии, в порядке логирования. */
  sessionSets?: readonly SetLike[]
  /** Последний подход этого упражнения из истории пользователя (вне сессии). */
  historySet?: SetLike | null
}

// --- Мелкие помощники ------------------------------------------------------

/** Число или null. NaN и Infinity считаем отсутствующим значением. */
function num(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** Первое заданное значение из цепочки. Ноль — заданное значение. */
function firstNumber(...values: Array<number | null | undefined>): number | null {
  for (const value of values) {
    const parsed = num(value)
    if (parsed !== null) return parsed
  }
  return null
}

/** Последний подход нужного вида в текущей сессии. */
function lastSetOfKind(
  sets: readonly SetLike[] | undefined,
  kind: ExerciseKind,
): SetLike | undefined {
  if (!sets) return undefined
  for (let i = sets.length - 1; i >= 0; i -= 1) {
    const candidate = sets[i]
    if (candidate && candidate.kind === kind) return candidate
  }
  return undefined
}

// --- Предзаполнение --------------------------------------------------------

/**
 * Силовой подход.
 *
 * Первый подход упражнения в сессии: память программы -> история -> пусто.
 * Последующие: значения предыдущего подхода этого упражнения в этой сессии.
 * RIR всегда предзаполняется целевым, а не прошлым: цель не должна уползать
 * следом за тем, как тяжело далась работа.
 */
export function nextStrengthDraft(input: PrefillInput): StrengthSetDraft {
  const rir = firstNumber(input.targetRir) ?? DEFAULT_RIR
  const previous = lastSetOfKind(input.sessionSets, 'strength')

  if (previous) {
    return {
      kind: 'strength',
      weightKg: num(previous.weight_kg),
      reps: num(previous.reps),
      rir,
    }
  }

  // Поля тянем независимо: у пункта программы может быть вес без повторов.
  const history = input.historySet
  return {
    kind: 'strength',
    weightKg: firstNumber(input.lastWeightKg, history?.weight_kg),
    reps: firstNumber(input.lastReps, history?.reps, input.repMin) ?? DEFAULT_REPS,
    rir,
  }
}

/**
 * Кардио-отрезок.
 *
 * Первый отрезок: цели программы -> память прошлого раза -> 10 минут без дистанции.
 * Историю пользователя здесь намеренно не спрашиваем: кардио в приложении —
 * факт разминки, а не тренируемая величина, лишний источник данных ему не нужен.
 */
export function nextCardioDraft(input: PrefillInput): CardioSetDraft {
  const previous = lastSetOfKind(input.sessionSets, 'cardio')

  if (previous) {
    return {
      kind: 'cardio',
      durationSec: num(previous.duration_sec),
      distanceM: num(previous.distance_m),
    }
  }

  return {
    kind: 'cardio',
    durationSec: firstNumber(input.targetDurationSec, input.lastDurationSec) ?? DEFAULT_CARDIO_SEC,
    distanceM: firstNumber(input.targetDistanceM, input.lastDistanceM),
  }
}

export function nextSetDraft(kind: ExerciseKind, input: PrefillInput): SetDraft {
  return kind === 'cardio' ? nextCardioDraft(input) : nextStrengthDraft(input)
}

/** Предзаполнение прямо из карточки упражнения сессии. */
export function draftForExercise(
  view: SessionExerciseView,
  historySet?: SetLike | null,
): SetDraft {
  return nextSetDraft(view.kind, {
    lastWeightKg: view.lastWeightKg,
    lastReps: view.lastReps,
    lastDurationSec: view.lastDurationSec,
    lastDistanceM: view.lastDistanceM,
    repMin: view.repMin,
    repMax: view.repMax,
    targetRir: view.targetRir,
    targetDurationSec: view.targetDurationSec,
    targetDistanceM: view.targetDistanceM,
    sessionSets: view.sets,
    historySet,
  })
}

// --- Проверка черновика перед записью -------------------------------------

/**
 * Кнопка записи активна, только когда строка пройдёт ограничения БД.
 * Силовому нужны вес, повторы и запас; кардио — время ИЛИ дистанция
 * (ровно так устроен sets_shape_ck).
 */
export function isSubmittable(draft: SetDraft): boolean {
  if (draft.kind === 'cardio') {
    const hasDuration = draft.durationSec !== null && draft.durationSec > 0
    const hasDistance = draft.distanceM !== null && draft.distanceM > 0
    return hasDuration || hasDistance
  }
  return (
    draft.weightKg !== null &&
    draft.weightKg >= WEIGHT_MIN_KG &&
    draft.reps !== null &&
    draft.reps >= REPS_MIN &&
    draft.rir !== null
  )
}

/**
 * Нули кардио превращаем в null: в БД duration_sec >= 1 и distance_m > 0.
 * Заодно режем по потолкам DDL: ручной ввод «10000» в поле километров даёт
 * 10 000 000 м при пределе numeric(8,1), и подход упал бы на сервере
 * окончательной ошибкой 22003 уже после оптимистичной отрисовки.
 */
export function normalize(draft: SetDraft): SetDraftFilled | null {
  if (!isSubmittable(draft)) return null

  if (draft.kind === 'cardio') {
    return {
      kind: 'cardio',
      durationSec:
        draft.durationSec !== null && draft.durationSec > 0
          ? Math.min(draft.durationSec, CARDIO_DURATION_MAX_SEC)
          : null,
      distanceM:
        draft.distanceM !== null && draft.distanceM > 0
          ? Math.min(draft.distanceM, CARDIO_DISTANCE_MAX_M)
          : null,
    }
  }

  return {
    kind: 'strength',
    weightKg: draft.weightKg as number,
    reps: draft.reps as number,
    rir: draft.rir as number,
  }
}

/** Цель упражнения строкой: «3 × 8–12, RIR 2» или «цель 10:00 · 2 км». */
export function targetLine(view: SessionExerciseView): string {
  if (view.kind === 'cardio') {
    const target = formatCardio(view.targetDurationSec, view.targetDistanceM)
    return target === EM_DASH ? 'кардио · вне зачёта' : `цель ${target}`
  }

  const range = formatRepRange(view.repMin, view.repMax)
  const head = range === EM_DASH ? `${view.targetSets} подх.` : `${view.targetSets} × ${range}`
  return view.targetRir === null ? head : `${head}, ${formatRir(view.targetRir)}`
}

// --- Наложение офлайн-очереди ---------------------------------------------

/** Оптимистичная строка из операции очереди — то, что видно до ответа сервера. */
function optimisticSet(
  payload: {
    sessionId: string
    clientId: string
    exerciseId: string
    programItemId: string | null
    orderIndex: number
    kind: ExerciseKind
    weightKg: number | null
    reps: number | null
    rir: number | null
    durationSec: number | null
    distanceM: number | null
    loggedAt: string
  },
  failed = false,
): PendingWorkoutSet {
  return {
    // Временный id: строка ещё не существует на сервере.
    id: `pending:${payload.clientId}`,
    session_id: payload.sessionId,
    exercise_id: payload.exerciseId,
    program_item_id: payload.programItemId,
    order_index: payload.orderIndex,
    kind: payload.kind,
    weight_kg: payload.weightKg,
    reps: payload.reps,
    rir: payload.rir,
    duration_sec: payload.durationSec,
    distance_m: payload.distanceM,
    // Игровой слой — фаза 2, здесь всегда пусто.
    e1rm: null,
    e1rm_ref: null,
    ri: null,
    score: null,
    client_id: payload.clientId,
    logged_at: payload.loggedAt,
    pending: true,
    // Сервер отказал окончательно: строку не прячем (иначе подход пропадёт
    // без следа), но и за обычную не выдаём — её видно как непринятую.
    failed,
  }
}

/**
 * Складывает подтверждённые сервером строки с тем, что ещё лежит в очереди.
 *
 * Очередь переживает перезагрузку, поэтому именно она, а не кэш запроса,
 * отвечает за неотправленные подходы: обновление списка с сервера не может
 * стереть подход, который не доехал.
 *
 * Порядок разбора важен: сначала строки сервера, потом операции очереди
 * поверх них — так повтор log_set после успешной отправки не создаёт дубль.
 */
export function mergeQueuedSets(
  serverSets: readonly WorkoutSet[],
  ops: readonly QueuedOp[],
  sessionId: string,
): PendingWorkoutSet[] {
  const byClientId = new Map<string, PendingWorkoutSet>()
  for (const set of serverSets) {
    byClientId.set(set.client_id, { ...set })
  }

  for (const op of ops) {
    if (op.payload.sessionId !== sessionId) continue

    switch (op.kind) {
      case 'log_set': {
        // Строка уже пришла с сервера — операция вот-вот уйдёт из очереди.
        if (!byClientId.has(op.payload.clientId)) {
          byClientId.set(op.payload.clientId, optimisticSet(op.payload, op.status === 'failed'))
        }
        break
      }
      case 'update_set': {
        const target = byClientId.get(op.payload.clientId)
        if (!target) break
        const { patch } = op.payload
        byClientId.set(op.payload.clientId, {
          ...target,
          weight_kg: patch.weightKg === undefined ? target.weight_kg : patch.weightKg,
          reps: patch.reps === undefined ? target.reps : patch.reps,
          rir: patch.rir === undefined ? target.rir : patch.rir,
          duration_sec: patch.durationSec === undefined ? target.duration_sec : patch.durationSec,
          distance_m: patch.distanceM === undefined ? target.distance_m : patch.distanceM,
          pending: true,
          failed: target.failed === true || op.status === 'failed',
        })
        break
      }
      case 'delete_set': {
        byClientId.delete(op.payload.clientId)
        break
      }
      case 'finish_session':
        break
    }
  }

  return [...byClientId.values()].sort(compareSets)
}

function compareSets(a: PendingWorkoutSet, b: PendingWorkoutSet): number {
  const at = Date.parse(a.logged_at)
  const bt = Date.parse(b.logged_at)
  if (Number.isFinite(at) && Number.isFinite(bt) && at !== bt) return at - bt
  return a.order_index - b.order_index
}

/**
 * Есть ли в очереди незавершённое закрытие этой сессии.
 *
 * Провалившееся закрытие не считается: на сервере сессия осталась активной,
 * а операция со статусом failed лежит в очереди сколько угодно долго. Прятать
 * из-за неё идущую тренировку нельзя — главный экран предложил бы начать
 * новую и молча бросил бы старую.
 */
export function hasQueuedFinish(ops: readonly QueuedOp[], sessionId: string): boolean {
  return ops.some(
    (op) =>
      op.kind === 'finish_session' &&
      op.payload.sessionId === sessionId &&
      op.status !== 'failed',
  )
}

// --- Счётчики --------------------------------------------------------------

/** Силовой подход считается рабочим и идёт в тоннаж. Кардио — нет. */
export function setVolumeKg(set: SetLike): number {
  if (set.kind !== 'strength') return 0
  const weight = num(set.weight_kg)
  const reps = num(set.reps)
  if (weight === null || reps === null) return 0
  return weight * reps
}

/**
 * Итоги сессии. Кардио живёт в отдельных полях и не смешивается с тоннажем:
 * это осознанное требование, а не упрощение.
 */
export function computeSessionTotals(
  sets: readonly SetLike[],
  options: { startedAt?: string | null; finishedAt?: string | null; now?: number } = {},
): SessionTotals {
  let setCount = 0
  let volumeKg = 0
  let cardioSec = 0
  let cardioDistanceM = 0
  const exercises = new Set<string>()

  for (const set of sets) {
    const withId = set as SetLike & { exercise_id?: string }
    if (withId.exercise_id) exercises.add(withId.exercise_id)

    if (set.kind === 'cardio') {
      cardioSec += num(set.duration_sec) ?? 0
      cardioDistanceM += num(set.distance_m) ?? 0
      continue
    }

    setCount += 1
    volumeKg += setVolumeKg(set)
  }

  return {
    setCount,
    volumeKg,
    exerciseCount: exercises.size,
    durationMs: durationMs(options.startedAt, options.finishedAt, options.now),
    cardioSec,
    cardioDistanceM,
  }
}

/**
 * Длительность по меткам времени, а не по накопленному тику.
 * Вкладку сворачивают посреди тренировки — таймер обязан пережить это без вранья.
 */
export function durationMs(
  startedAt: string | null | undefined,
  finishedAt?: string | null,
  now: number = Date.now(),
): number | null {
  if (!startedAt) return null
  const start = Date.parse(startedAt)
  if (!Number.isFinite(start)) return null
  const end = finishedAt ? Date.parse(finishedAt) : now
  if (!Number.isFinite(end)) return null
  return Math.max(0, end - start)
}

/** Секунды с последнего подхода — источник правды для таймера отдыха. */
export function secondsSince(timestamp: string | number | null, now: number = Date.now()): number {
  if (timestamp === null) return 0
  const at = typeof timestamp === 'number' ? timestamp : Date.parse(timestamp)
  if (!Number.isFinite(at)) return 0
  return Math.max(0, Math.floor((now - at) / 1000))
}

/** Время последнего подхода сессии в миллисекундах. */
export function lastSetAt(sets: readonly PendingWorkoutSet[]): number | null {
  let latest: number | null = null
  for (const set of sets) {
    const at = Date.parse(set.logged_at)
    if (!Number.isFinite(at)) continue
    if (latest === null || at > latest) latest = at
  }
  return latest
}

// --- Прогресс по плану дня -------------------------------------------------

export type SessionProgress = {
  /** Сделано рабочих (силовых) подходов. */
  done: number
  /** Запланировано силовых подходов — сумма target_sets. */
  planned: number
  /** Доля 0..1, обрезанная сверху. */
  ratio: number
  /** Силовые упражнения дня, где нет ни одного подхода. */
  untouched: SessionExerciseView[]
}

/**
 * Прогресс считаем только по силовой работе: кардио — разминка,
 * оно не должно закрывать план дня и не должно его раздувать.
 */
export function computeProgress(views: readonly SessionExerciseView[]): SessionProgress {
  let done = 0
  let planned = 0
  const untouched: SessionExerciseView[] = []

  for (const view of views) {
    if (view.kind === 'cardio') continue
    planned += Math.max(0, view.targetSets)
    const logged = view.sets.filter((set) => set.kind === 'strength').length
    done += logged
    if (logged === 0) untouched.push(view)
  }

  const ratio = planned > 0 ? Math.min(1, done / planned) : done > 0 ? 1 : 0
  return { done, planned, ratio, untouched }
}

// --- Разбивка по упражнениям (итоговый экран) ------------------------------

export type ExerciseBreakdown = {
  exerciseId: string
  name: string
  kind: ExerciseKind
  setCount: number
  volumeKg: number
  cardioSec: number
  cardioDistanceM: number
  sets: PendingWorkoutSet[]
}

/**
 * Разбивка итогов по упражнениям. Порядок — как в программе дня,
 * упражнения вне программы дописываются в конец в порядке первого подхода.
 */
export function computeBreakdown(
  sets: readonly PendingWorkoutSet[],
  nameOf: (exerciseId: string) => { name: string; kind: ExerciseKind } | undefined,
  order: readonly string[] = [],
): ExerciseBreakdown[] {
  const rank = new Map<string, number>()
  order.forEach((id, index) => rank.set(id, index))

  const byExercise = new Map<string, ExerciseBreakdown>()
  for (const set of sets) {
    let row = byExercise.get(set.exercise_id)
    if (!row) {
      const meta = nameOf(set.exercise_id)
      row = {
        exerciseId: set.exercise_id,
        name: meta?.name ?? 'Упражнение',
        kind: meta?.kind ?? set.kind,
        setCount: 0,
        volumeKg: 0,
        cardioSec: 0,
        cardioDistanceM: 0,
        sets: [],
      }
      byExercise.set(set.exercise_id, row)
    }

    row.sets.push(set)
    if (set.kind === 'cardio') {
      row.cardioSec += num(set.duration_sec) ?? 0
      row.cardioDistanceM += num(set.distance_m) ?? 0
    } else {
      row.setCount += 1
      row.volumeKg += setVolumeKg(set)
    }
  }

  const rows = [...byExercise.values()]
  return rows.sort((a, b) => {
    const ra = rank.get(a.exerciseId) ?? Number.MAX_SAFE_INTEGER
    const rb = rank.get(b.exerciseId) ?? Number.MAX_SAFE_INTEGER
    return ra - rb
  })
}
