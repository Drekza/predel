/**
 * Словари и константы фазы 1. Русские подписи живут только здесь.
 * Карта «мышца -> стат» продублирована в БД (таблица muscle_stat_map);
 * обе копии обязаны совпадать — это ровно 17 строк из спеки, раздел 3.1.
 */

import type { StatKey } from '@/types/domain'
import { STAT_KEYS } from '@/types/domain'

export { STAT_KEYS }

// --- Статы ---

export const STAT_LABELS_RU: Record<StatKey, string> = {
  chest: 'ГРУДЬ',
  back: 'СПИНА',
  shoulders: 'ПЛЕЧИ',
  arms: 'РУКИ',
  quads: 'КВАДРИЦЕПС',
  posterior: 'ЗАДНЯЯ ЦЕПЬ',
  core: 'КОР',
}

/** CSS-переменные цветов статов из src/index.css (владелец — дизайн-система). */
export const STAT_COLOR_VAR: Record<StatKey, string> = {
  chest: 'var(--color-stat-chest)',
  back: 'var(--color-stat-back)',
  shoulders: 'var(--color-stat-shoulders)',
  arms: 'var(--color-stat-arms)',
  quads: 'var(--color-stat-quads)',
  posterior: 'var(--color-stat-posterior)',
  core: 'var(--color-stat-core)',
}

// --- 17 мышц free-exercise-db ---

export const MUSCLE_LABELS_RU: Record<string, string> = {
  chest: 'грудь',
  lats: 'широчайшие',
  'middle back': 'середина спины',
  traps: 'трапеции',
  shoulders: 'плечи',
  neck: 'шея',
  biceps: 'бицепс',
  triceps: 'трицепс',
  forearms: 'предплечья',
  quadriceps: 'квадрицепс',
  calves: 'икры',
  abductors: 'отводящие',
  adductors: 'приводящие',
  hamstrings: 'бицепс бедра',
  glutes: 'ягодицы',
  'lower back': 'поясница',
  abdominals: 'пресс',
}

/** Ровно 17 строк. Должно совпадать с таблицей public.muscle_stat_map. */
export const MUSCLE_TO_STAT: Record<string, StatKey> = {
  chest: 'chest',

  lats: 'back',
  'middle back': 'back',
  traps: 'back',

  shoulders: 'shoulders',
  neck: 'shoulders',

  biceps: 'arms',
  triceps: 'arms',
  forearms: 'arms',

  quadriceps: 'quads',
  calves: 'quads',
  abductors: 'quads',
  adductors: 'quads',

  hamstrings: 'posterior',
  glutes: 'posterior',
  'lower back': 'posterior',

  abdominals: 'core',
}

// --- 12 значений equipment ---

export const EQUIPMENT_LABELS_RU: Record<string, string> = {
  bands: 'резина',
  barbell: 'штанга',
  'body only': 'без оборудования',
  cable: 'блок',
  dumbbell: 'гантели',
  'exercise ball': 'фитбол',
  'e-z curl bar': 'изогнутый гриф',
  'foam roll': 'ролик',
  kettlebells: 'гири',
  machine: 'тренажёр',
  'medicine ball': 'медбол',
  other: 'другое',
}

// --- Прочие подписи ---

export const SESSION_STATE_LABELS_RU: Record<string, string> = {
  active: 'идёт',
  finished: 'завершена',
  abandoned: 'брошена',
}

export const EXERCISE_KIND_LABELS_RU: Record<string, string> = {
  strength: 'силовое',
  cardio: 'кардио',
}

export const LEVEL_LABELS_RU: Record<string, string> = {
  beginner: 'новичок',
  intermediate: 'средний',
  expert: 'продвинутый',
}

// --- Числовые константы ввода (UI-степперы и валидация) ---

/** Шаг веса по умолчанию, если у упражнения не задан свой weight_step_kg. */
export const DEFAULT_WEIGHT_STEP_KG = 2.5
export const WEIGHT_MIN_KG = 0
export const WEIGHT_MAX_KG = 500
export const REPS_MIN = 1
export const REPS_MAX = 100
export const RIR_MIN = 0
export const RIR_MAX = 5
export const RIR_VALUES = [0, 1, 2, 3, 4, 5] as const
export const TARGET_SETS_MIN = 1
export const TARGET_SETS_MAX = 12

/** Кардио: шаг времени 30 секунд, шаг дистанции 0,1 км. */
export const CARDIO_DURATION_STEP_SEC = 30
export const CARDIO_DURATION_MIN_SEC = 1
export const CARDIO_DURATION_MAX_SEC = 36_000
export const CARDIO_DISTANCE_STEP_M = 100
export const CARDIO_DISTANCE_MAX_M = 100_000

// --- Хелперы подписей: неизвестное значение отдаём как есть, а не ломаемся ---

export function muscleLabelRu(muscle: string): string {
  return MUSCLE_LABELS_RU[muscle] ?? muscle
}

export function equipmentLabelRu(equipment: string | null | undefined): string {
  if (!equipment) return EQUIPMENT_LABELS_RU.other ?? 'другое'
  return EQUIPMENT_LABELS_RU[equipment] ?? equipment
}

export function statOfMuscle(muscle: string): StatKey | undefined {
  return MUSCLE_TO_STAT[muscle]
}
