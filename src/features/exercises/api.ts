/**
 * Доступ к справочнику упражнений.
 *
 * Стратегия: справочник статичный (675 глобальных строк + горстка своих),
 * поэтому грузим его ОДНИМ запросом целиком и фильтруем на клиенте.
 * Так поиск мгновенный и работает офлайн из кэша TanStack Query.
 * staleTime — час: за тренировку справочник не меняется.
 */

import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { qk } from '@/lib/keys'
import { supabase } from '@/lib/supabase'
import { toRussianMessage } from '@/lib/errors'
import { DEFAULT_WEIGHT_STEP_KG } from '@/lib/constants'
import { MUSCLE_KEYS } from '@/types/domain'
import type { Exercise, ExerciseInsert, ExerciseKind } from '@/types/domain'
import { filterExercises, type ExerciseFilter } from './muscleFilters'

export const EXERCISES_STALE_TIME_MS = 60 * 60 * 1000
const EXERCISES_GC_TIME_MS = 24 * 60 * 60 * 1000

/**
 * PostgREST по умолчанию отдаёт максимум 1000 строк. Справочнику этого хватает,
 * но range задаём явно: иначе однажды база вырастет и список молча обрежется.
 */
export const EXERCISES_MAX_ROWS = 1000

const collator = new Intl.Collator('ru')

async function fetchExercises(): Promise<Exercise[]> {
  const { data, error } = await supabase
    .from('exercises')
    .select('*')
    .order('name_ru', { ascending: true })
    .range(0, EXERCISES_MAX_ROWS - 1)

  if (error) throw error
  return data ?? []
}

/** Весь справочник целиком. Один сетевой запрос на всё приложение. */
export function useExerciseCatalog() {
  return useQuery({
    queryKey: qk.exercises(),
    queryFn: fetchExercises,
    staleTime: EXERCISES_STALE_TIME_MS,
    gcTime: EXERCISES_GC_TIME_MS,
    refetchOnMount: false,
  })
}

export type UseExercisesResult = {
  /** Отфильтрованный и отсортированный список. */
  exercises: Exercise[]
  /** Весь справочник — нужен, когда фильтры считаются снаружи. */
  all: Exercise[]
  /** Сколько всего в справочнике (без учёта фильтров). */
  total: number
  isLoading: boolean
  isFetching: boolean
  isError: boolean
  /** Готовое русское сообщение об ошибке, сырой текст наружу не отдаём. */
  errorMessage: string | null
  refetch: () => void
}

/**
 * Список упражнений с фильтрами. Фильтрация клиентская — сетевого запроса
 * на каждое нажатие клавиши не происходит.
 */
export function useExercises(filters?: ExerciseFilter): UseExercisesResult {
  const query = useExerciseCatalog()
  const data = query.data

  const {
    search,
    stat = null,
    muscle = null,
    equipment = null,
    kind = null,
    customOnly = false,
    excludeIds = null,
  } = filters ?? {}

  // Ключ списка исключений сводим к строке: иначе новый массив каждый рендер
  // сбрасывает мемоизацию и справочник пересчитывается вхолостую.
  const excludeKey = excludeIds ? excludeIds.join(',') : ''

  const exercises = useMemo(
    () =>
      filterExercises(data, {
        search,
        stat,
        muscle,
        equipment,
        kind,
        customOnly,
        excludeIds: excludeKey ? excludeKey.split(',') : null,
      }),
    [data, search, stat, muscle, equipment, kind, customOnly, excludeKey],
  )

  return {
    exercises,
    all: data ?? [],
    total: data?.length ?? 0,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    errorMessage: query.error ? toRussianMessage(query.error, 'Не удалось загрузить справочник') : null,
    refetch: () => {
      void query.refetch()
    },
  }
}

/**
 * Одно упражнение. Сначала пробуем взять его из уже загруженного справочника,
 * запрос уходит только если справочника в кэше нет.
 */
export function useExercise(id: string | null | undefined) {
  const queryClient = useQueryClient()

  return useQuery({
    queryKey: qk.exercise(id ?? 'unknown'),
    enabled: Boolean(id),
    staleTime: EXERCISES_STALE_TIME_MS,
    gcTime: EXERCISES_GC_TIME_MS,
    queryFn: async (): Promise<Exercise | null> => {
      const { data, error } = await supabase
        .from('exercises')
        .select('*')
        .eq('id', id as string)
        .maybeSingle()
      if (error) throw error
      return data ?? null
    },
    initialData: () => {
      if (!id) return undefined
      const catalog = queryClient.getQueryData<Exercise[]>(qk.exercises())
      return catalog?.find((exercise) => exercise.id === id)
    },
    initialDataUpdatedAt: () => queryClient.getQueryState(qk.exercises())?.dataUpdatedAt,
  })
}

// --- Своё упражнение ---

export type CustomExerciseInput = {
  nameRu: string
  kind: ExerciseKind
  equipment: string | null
  primaryMuscles: string[]
  secondaryMuscles: string[]
  /** У кардио шага веса нет — поле игнорируется. */
  weightStepKg: number | null
}

export type CustomExerciseErrors = Partial<
  Record<'nameRu' | 'primaryMuscles' | 'weightStepKg', string>
>

export const CUSTOM_NAME_MIN = 2
export const CUSTOM_NAME_MAX = 64

/** Валидация формы. Чистая функция — форма и тесты пользуются одной и той же. */
export function validateCustomExercise(input: CustomExerciseInput): CustomExerciseErrors {
  const errors: CustomExerciseErrors = {}
  const name = input.nameRu.trim()

  if (name.length === 0) errors.nameRu = 'Введите название'
  else if (name.length < CUSTOM_NAME_MIN) errors.nameRu = 'Слишком короткое название'
  else if (name.length > CUSTOM_NAME_MAX) errors.nameRu = `Не длиннее ${CUSTOM_NAME_MAX} символов`

  // Кардио не даёт очков и не влияет на статы, поэтому мышцы у него необязательны.
  if (input.kind === 'strength') {
    if (input.primaryMuscles.length === 0) {
      errors.primaryMuscles = 'Отметьте хотя бы одну основную мышцу'
    }
    const step = input.weightStepKg
    if (step === null || !Number.isFinite(step) || step <= 0) {
      errors.weightStepKg = 'Шаг веса должен быть больше нуля'
    } else if (step > 50) {
      errors.weightStepKg = 'Слишком большой шаг'
    }
  }

  return errors
}

const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ж: 'zh', з: 'z', и: 'i', й: 'i',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u',
  ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e',
  ю: 'yu', я: 'ya', ё: 'e',
}

/** Слаг латиницей: он уникален в пределах владельца, поэтому добавляем короткий суффикс. */
export function buildCustomSlug(nameRu: string): string {
  const base = nameRu
    .toLowerCase()
    .split('')
    .map((char) => TRANSLIT[char] ?? char)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  const suffix = Math.random().toString(36).slice(2, 8)
  return base ? `custom-${base}-${suffix}` : `custom-${suffix}`
}

function sanitizeMuscles(muscles: readonly string[]): string[] {
  const known = new Set<string>(MUSCLE_KEYS)
  return [...new Set(muscles)].filter((muscle) => known.has(muscle))
}

async function currentProfileId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser()
  if (error) throw error
  const id = data.user?.id
  // Сообщение ловится маппером ошибок и превращается в «Сессия истекла — войди заново».
  if (!id) throw new Error('Auth session missing')
  return id
}

/**
 * Создание своего упражнения. is_custom = true, owner_id = текущий профиль —
 * иначе не пройдёт exercises_custom_owner_ck.
 */
export function useCreateCustomExercise() {
  const queryClient = useQueryClient()

  return useMutation<Exercise, unknown, CustomExerciseInput>({
    mutationFn: async (input) => {
      const ownerId = await currentProfileId()
      const isCardio = input.kind === 'cardio'
      const primary = sanitizeMuscles(input.primaryMuscles)
      const secondary = sanitizeMuscles(input.secondaryMuscles).filter(
        (muscle) => !primary.includes(muscle),
      )

      const row: ExerciseInsert = {
        slug: buildCustomSlug(input.nameRu),
        name_ru: input.nameRu.trim(),
        name_en: null,
        kind: input.kind,
        equipment: input.equipment,
        category: isCardio ? 'cardio' : null,
        primary_muscles: primary,
        secondary_muscles: secondary,
        // У кардио вес не логируется, но колонка NOT NULL с check > 0 — кладём дефолт.
        weight_step_kg:
          isCardio || !input.weightStepKg ? DEFAULT_WEIGHT_STEP_KG : input.weightStepKg,
        is_custom: true,
        owner_id: ownerId,
      }

      const { data, error } = await supabase.from('exercises').insert(row).select('*').single()

      if (error) throw error
      return data
    },
    onSuccess: (exercise) => {
      // Дописываем в кэш справочника, чтобы упражнение появилось в списке сразу.
      queryClient.setQueryData<Exercise[]>(qk.exercises(), (previous) => {
        const list = previous ? previous.filter((item) => item.id !== exercise.id) : []
        return [...list, exercise].sort((a, b) => collator.compare(a.name_ru, b.name_ru))
      })
      queryClient.setQueryData(qk.exercise(exercise.id), exercise)
    },
  })
}

/** Русское сообщение для инлайн-подсказки под формой. */
export function exerciseErrorMessage(error: unknown): string {
  return toRussianMessage(error, 'Не удалось сохранить упражнение')
}
