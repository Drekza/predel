/**
 * Фильтры справочника упражнений: 7 статов, 17 мышц, 12 снарядов.
 *
 * Здесь живёт ВСЯ чистая логика отбора и поиска — без React и без сети.
 * Источник истины по группировке мышц — MUSCLE_TO_STAT из @/lib/constants
 * (та же карта продублирована в таблице muscle_stat_map).
 */

import { MUSCLE_TO_STAT, STAT_LABELS_RU, equipmentLabelRu, muscleLabelRu } from '@/lib/constants'
import { EQUIPMENT_KEYS, MUSCLE_KEYS, STAT_KEYS } from '@/types/domain'
import type { Exercise, ExerciseKind, StatKey } from '@/types/domain'

// --- Опции фильтров ---

export type FilterOption<T extends string = string> = { value: T; label: string }

export type MuscleGroup = {
  stat: StatKey
  /** Русская подпись стата: «ЗАДНЯЯ ЦЕПЬ». */
  label: string
  muscles: FilterOption[]
}

/** Показывать не больше стольки результатов, остальное — счётчиком «ещё N». */
export const PICKER_RESULT_LIMIT = 60

/** Кардио внизу списка занимает мало места: превью, дальше — по фильтру «Кардио». */
export const CARDIO_PREVIEW_LIMIT = 5

function buildMusclesByStat(): Record<StatKey, string[]> {
  const acc = {} as Record<StatKey, string[]>
  for (const stat of STAT_KEYS) acc[stat] = []
  // Порядок мышц внутри стата — как в MUSCLE_KEYS, чтобы список не прыгал между сборками.
  for (const muscle of MUSCLE_KEYS) {
    const stat = MUSCLE_TO_STAT[muscle]
    if (stat) acc[stat].push(muscle)
  }
  return acc
}

const MUSCLES_BY_STAT = buildMusclesByStat()

/** Семь статов в фиксированном порядке — первый ряд фильтров в шторке выбора. */
export const STAT_FILTERS: FilterOption<StatKey>[] = STAT_KEYS.map((stat) => ({
  value: stat,
  label: STAT_LABELS_RU[stat],
}))

/** Мышцы, сгруппированные по статам: второй ряд фильтров и чекбоксы своего упражнения. */
export const MUSCLE_GROUPS: MuscleGroup[] = STAT_KEYS.map((stat) => ({
  stat,
  label: STAT_LABELS_RU[stat],
  muscles: MUSCLES_BY_STAT[stat].map((muscle) => ({ value: muscle, label: muscleLabelRu(muscle) })),
}))

export const EQUIPMENT_FILTERS: FilterOption[] = EQUIPMENT_KEYS.map((value) => ({
  value,
  label: equipmentLabelRu(value),
}))

export function musclesOfStat(stat: StatKey): readonly string[] {
  return MUSCLES_BY_STAT[stat]
}

/** Статы, которые затрагивает набор мышц. Порядок — как в STAT_KEYS. */
export function statsOfMuscles(muscles: readonly string[] | null | undefined): StatKey[] {
  if (!muscles || muscles.length === 0) return []
  const seen = new Set<StatKey>()
  for (const muscle of muscles) {
    const stat = MUSCLE_TO_STAT[muscle]
    if (stat) seen.add(stat)
  }
  return STAT_KEYS.filter((stat) => seen.has(stat))
}

type MuscleSource = Pick<Exercise, 'primary_muscles' | 'secondary_muscles'>

export function primaryStats(exercise: MuscleSource): StatKey[] {
  return statsOfMuscles(exercise.primary_muscles)
}

export function exerciseStats(exercise: MuscleSource): StatKey[] {
  return statsOfMuscles([...exercise.primary_muscles, ...exercise.secondary_muscles])
}

/** «грудь, трицепс» — целевые мышцы мелкой строкой под названием. */
export function musclesLabel(exercise: MuscleSource, max = 3): string {
  const muscles = exercise.primary_muscles.length
    ? exercise.primary_muscles
    : exercise.secondary_muscles
  if (muscles.length === 0) return ''
  const shown = muscles.slice(0, max).map(muscleLabelRu)
  const rest = muscles.length - shown.length
  return rest > 0 ? `${shown.join(', ')} +${rest}` : shown.join(', ')
}

// --- Поиск ---

/**
 * Нормализация строки поиска: регистр, «ё» → «е», любые разделители → пробел.
 * «Жим Лёжа» и «жим лежа» после неё совпадают.
 */
export function normalizeSearch(input: string | null | undefined): string {
  if (!input) return ''
  return input
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

// Нормализованные названия считаем один раз на упражнение: справочник статичный,
// а строку поиска пользователь набирает посимвольно.
const haystackCache = new WeakMap<object, string>()

type SearchSource = Pick<Exercise, 'name_ru' | 'name_en'>

function haystack(exercise: SearchSource): string {
  const cached = haystackCache.get(exercise)
  if (cached !== undefined) return cached
  const value = `${normalizeSearch(exercise.name_ru)} ${normalizeSearch(exercise.name_en)}`.trim()
  haystackCache.set(exercise, value)
  return value
}

/** needle должен быть уже нормализован через normalizeSearch. */
export function matchesSearch(exercise: SearchSource, needle: string): boolean {
  if (!needle) return true
  return haystack(exercise).includes(needle)
}

// --- Предикаты фильтров ---

export function matchesMuscle(exercise: MuscleSource, muscle: string): boolean {
  return (
    exercise.primary_muscles.includes(muscle) || exercise.secondary_muscles.includes(muscle)
  )
}

export function matchesPrimaryStat(exercise: MuscleSource, stat: StatKey): boolean {
  return exercise.primary_muscles.some((muscle) => MUSCLE_TO_STAT[muscle] === stat)
}

/** Стат совпал по основным ИЛИ по дополнительным мышцам (основные идут выше в сортировке). */
export function matchesStat(exercise: MuscleSource, stat: StatKey): boolean {
  if (matchesPrimaryStat(exercise, stat)) return true
  return exercise.secondary_muscles.some((muscle) => MUSCLE_TO_STAT[muscle] === stat)
}

export function matchesEquipment(exercise: Pick<Exercise, 'equipment'>, equipment: string): boolean {
  return (exercise.equipment ?? 'other') === equipment
}

// --- Отбор и сортировка ---

export type ExerciseFilter = {
  search?: string
  stat?: StatKey | null
  muscle?: string | null
  equipment?: string | null
  kind?: ExerciseKind | null
  /** Только свои упражнения. */
  customOnly?: boolean
  /** Уже добавленные в день программы — их в списке не показываем. */
  excludeIds?: readonly string[] | null
}

const collator = new Intl.Collator('ru')

/**
 * Меньше — выше в списке. Ранжируем так, чтобы сверху оказалось то,
 * что человек искал: свои упражнения, точное начало названия, основная мышца.
 */
function rank(exercise: Exercise, needle: string, stat: StatKey | null): number {
  let score = 0
  if (needle) {
    const hay = haystack(exercise)
    if (hay.startsWith(needle)) score -= 4
    else if (hay.includes(` ${needle}`)) score -= 2
  }
  if (stat && matchesPrimaryStat(exercise, stat)) score -= 1
  if (exercise.is_custom) score -= 3
  return score
}

export function sortExercises(
  list: readonly Exercise[],
  needle = '',
  stat: StatKey | null = null,
): Exercise[] {
  return [...list].sort((a, b) => {
    const diff = rank(a, needle, stat) - rank(b, needle, stat)
    if (diff !== 0) return diff
    return collator.compare(a.name_ru, b.name_ru)
  })
}

/** Единственная точка отбора: и хук useExercises, и шторка ходят сюда. */
export function filterExercises(
  list: readonly Exercise[] | null | undefined,
  filter: ExerciseFilter = {},
): Exercise[] {
  if (!list || list.length === 0) return []

  const needle = normalizeSearch(filter.search)
  const stat = filter.stat ?? null
  const excluded =
    filter.excludeIds && filter.excludeIds.length > 0 ? new Set(filter.excludeIds) : null

  const matched = list.filter((exercise) => {
    if (excluded?.has(exercise.id)) return false
    if (filter.kind && exercise.kind !== filter.kind) return false
    if (filter.customOnly && !exercise.is_custom) return false
    if (filter.equipment && !matchesEquipment(exercise, filter.equipment)) return false
    if (filter.muscle && !matchesMuscle(exercise, filter.muscle)) return false
    if (stat && !matchesStat(exercise, stat)) return false
    if (needle && !matchesSearch(exercise, needle)) return false
    return true
  })

  return sortExercises(matched, needle, stat)
}

/**
 * Кардио не мешается в общем списке — оно уходит отдельной секцией.
 * Это же разделение защищает основной сценарий: силовые сверху, всегда.
 */
export function splitByKind(list: readonly Exercise[]): {
  strength: Exercise[]
  cardio: Exercise[]
} {
  const strength: Exercise[] = []
  const cardio: Exercise[] = []
  for (const exercise of list) {
    if (exercise.kind === 'cardio') cardio.push(exercise)
    else strength.push(exercise)
  }
  return { strength, cardio }
}
