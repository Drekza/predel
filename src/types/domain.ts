/**
 * Прикладные типы домена. Тонкий слой поверх строк БД:
 * компоненты и хуки работают с ними, а не с Database[...] напрямую.
 */

import type { Database, Json, Tables, TablesInsert, TablesUpdate } from './database'

export type { Json }

// --- Enum'ы ---

export type StatKey = Database['public']['Enums']['stat_key']
export type SessionState = Database['public']['Enums']['session_state']
export type ExerciseKind = Database['public']['Enums']['exercise_kind']

/** Порядок статов на радаре и в списках — фиксирован, не менять произвольно. */
export const STAT_KEYS = [
  'chest',
  'back',
  'shoulders',
  'arms',
  'quads',
  'posterior',
  'core',
] as const satisfies readonly StatKey[]

/** 17 мышц из free-exercise-db — словарь primary_muscles / secondary_muscles. */
export const MUSCLE_KEYS = [
  'chest',
  'lats',
  'middle back',
  'traps',
  'shoulders',
  'neck',
  'biceps',
  'triceps',
  'forearms',
  'quadriceps',
  'calves',
  'abductors',
  'adductors',
  'hamstrings',
  'glutes',
  'lower back',
  'abdominals',
] as const

export type MuscleKey = (typeof MUSCLE_KEYS)[number]

/** 12 значений equipment из free-exercise-db. */
export const EQUIPMENT_KEYS = [
  'bands',
  'barbell',
  'body only',
  'cable',
  'dumbbell',
  'exercise ball',
  'e-z curl bar',
  'foam roll',
  'kettlebells',
  'machine',
  'medicine ball',
  'other',
] as const

export type EquipmentKey = (typeof EQUIPMENT_KEYS)[number]

// --- Строки таблиц ---

export type Profile = Tables<'profiles'>
export type ProfileInsert = TablesInsert<'profiles'>
export type ProfileUpdate = TablesUpdate<'profiles'>

export type Exercise = Tables<'exercises'>
export type ExerciseInsert = TablesInsert<'exercises'>
export type ExerciseUpdate = TablesUpdate<'exercises'>

export type Program = Tables<'programs'>
export type ProgramInsert = TablesInsert<'programs'>
export type ProgramUpdate = TablesUpdate<'programs'>

export type ProgramDay = Tables<'program_days'>
export type ProgramDayInsert = TablesInsert<'program_days'>
export type ProgramDayUpdate = TablesUpdate<'program_days'>

export type ProgramItem = Tables<'program_items'>
export type ProgramItemInsert = TablesInsert<'program_items'>
export type ProgramItemUpdate = TablesUpdate<'program_items'>

export type Session = Tables<'sessions'>
export type SessionInsert = TablesInsert<'sessions'>
export type SessionUpdate = TablesUpdate<'sessions'>

/** Строка таблицы `sets`. Имя WorkoutSet — чтобы не конфликтовать с глобальным Set. */
export type WorkoutSet = Tables<'sets'>
export type WorkoutSetInsert = TablesInsert<'sets'>
export type WorkoutSetUpdate = TablesUpdate<'sets'>

export type MuscleStatMapRow = Tables<'muscle_stat_map'>
export type GameConfigRow = Tables<'game_config'>

export type Circle = Tables<'circles'>
export type CircleMember = Tables<'circle_members'>
export type CircleInvite = Tables<'circle_invites'>

// --- Сужения по kind (в БД форму строки гарантирует sets_shape_ck) ---

/** Силовой подход: вес, повторы, RIR заполнены. */
export type StrengthSet = WorkoutSet & {
  kind: 'strength'
  weight_kg: number
  reps: number
  rir: number
}

/** Кардио-отрезок: время и/или дистанция. Ни веса, ни повторов, ни RIR. */
export type CardioSet = WorkoutSet & {
  kind: 'cardio'
  weight_kg: null
  reps: null
  rir: null
}

export function isCardioSet(set: WorkoutSet): set is CardioSet {
  return set.kind === 'cardio'
}

export function isStrengthSet(set: WorkoutSet): set is StrengthSet {
  return set.kind === 'strength'
}

export function isCardioExercise(exercise: Pick<Exercise, 'kind'>): boolean {
  return exercise.kind === 'cardio'
}

// --- Составные формы (то, что реально приходит из select с вложенностью) ---

export type ProgramItemWithExercise = ProgramItem & {
  exercise: Exercise
}

export type ProgramDayWithItems = ProgramDay & {
  items: ProgramItemWithExercise[]
}

export type ProgramWithDays = Program & {
  days: ProgramDayWithItems[]
}

export type SessionWithSets = Session & {
  sets: WorkoutSet[]
}

export type SessionWithDay = Session & {
  program_day: ProgramDay | null
}

/** Строка подхода в UI: серверная либо ещё не подтверждённая (оптимистичная). */
export type PendingWorkoutSet = WorkoutSet & {
  /** true, пока подход лежит в офлайн-очереди и не подтверждён сервером. */
  pending?: boolean
  /** true, если сервер отказал окончательно: строка видна, но не принята. */
  failed?: boolean
}

/**
 * Упражнение сессии: пункт программы + уже записанные подходы.
 * Силовые цели (repMin/repMax/targetRir) заполнены у kind='strength',
 * кардио-цели (targetDurationSec/targetDistanceM) — у kind='cardio'.
 */
export type SessionExerciseView = {
  programItemId: string | null
  exercise: Exercise
  kind: ExerciseKind
  orderIndex: number
  targetSets: number
  repMin: number | null
  repMax: number | null
  targetRir: number | null
  targetDurationSec: number | null
  targetDistanceM: number | null
  lastWeightKg: number | null
  lastReps: number | null
  lastDurationSec: number | null
  lastDistanceM: number | null
  sets: PendingWorkoutSet[]
}

// --- Черновик подхода в форме логирования ---

export type StrengthSetDraft = {
  kind: 'strength'
  weightKg: number | null
  reps: number | null
  rir: number | null
}

export type CardioSetDraft = {
  kind: 'cardio'
  durationSec: number | null
  distanceM: number | null
}

export type SetDraft = StrengthSetDraft | CardioSetDraft

/** Полностью заполненный черновик — то, что уходит в мутацию. */
export type StrengthSetDraftFilled = {
  kind: 'strength'
  weightKg: number
  reps: number
  rir: number
}

export type CardioSetDraftFilled = {
  kind: 'cardio'
  durationSec: number | null
  distanceM: number | null
}

export type SetDraftFilled = StrengthSetDraftFilled | CardioSetDraftFilled

/** Силовой черновик заполнен целиком? */
export function isStrengthDraftFilled(draft: StrengthSetDraft): draft is StrengthSetDraftFilled {
  return draft.weightKg !== null && draft.reps !== null && draft.rir !== null
}

/** Кардио-черновик: достаточно времени ИЛИ дистанции (как в sets_shape_ck). */
export function isCardioDraftFilled(draft: CardioSetDraft): draft is CardioSetDraftFilled {
  return draft.durationSec !== null || draft.distanceM !== null
}

// --- Агрегаты фазы 1 (без игрового слоя) ---

export type SessionTotals = {
  setCount: number
  /** Только силовые подходы: sum(weight_kg * reps). Кардио сюда не попадает. */
  volumeKg: number
  exerciseCount: number
  durationMs: number | null
  /** Кардио отдельной строкой, не смешивается с тоннажем. */
  cardioSec: number
  cardioDistanceM: number
}

/** Разбивка тоннажа по статам — используется на итоговом экране. */
export type StatBreakdown = Record<StatKey, number>
