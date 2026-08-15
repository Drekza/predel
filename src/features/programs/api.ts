/**
 * Запросы и мутации конструктора программ.
 *
 * Правила зоны:
 *  - обращения к Supabase живут только здесь, компоненты вызывают хуки;
 *  - каждый ключ берётся из `qk`, руками массивы не собираются;
 *  - все мутации оптимистичные: onMutate правит кэш, onError откатывает,
 *    onSettled инвалидирует. Ошибка уходит тостом на русском.
 *
 * Идентификаторы новых строк генерирует клиент (`newId()`): так оптимистичная
 * строка и серверная — это одна и та же строка, подмены id после ответа нет.
 *
 * Дырки в order_index безвредны: порядок задаётся сортировкой по нему,
 * а плотную нумерацию восстанавливает ближайшая перестановка (см. reorder.ts).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useToast } from '@/components/ui'
import { toRussianMessage } from '@/lib/errors'
import { qk } from '@/lib/keys'
import { supabase } from '@/lib/supabase'
import { newUuid } from '@/lib/uuid'
import type {
  Exercise,
  Program,
  ProgramDay,
  ProgramDayWithItems,
  ProgramItem,
  ProgramItemUpdate,
  ProgramItemWithExercise,
  ProgramWithDays,
} from '@/types/domain'

import {
  nextOrderIndex,
  removeAndReindex,
  reorderById,
  sortByOrder,
  type Direction,
  type Ordered,
} from './reorder'

// --- Значения по умолчанию для нового элемента программы --------------------

/** Силовое: 3 подхода 8–12 при запасе 2. Кардио-цели у него строго null. */
export const DEFAULT_TARGET_SETS = 3
export const DEFAULT_REP_MIN = 8
export const DEFAULT_REP_MAX = 12
export const DEFAULT_TARGET_RIR = 2

/** Кардио: один отрезок на 10 минут. Силовые цели у него строго null. */
export const DEFAULT_CARDIO_TARGET_SETS = 1
export const DEFAULT_CARDIO_DURATION_SEC = 600

/** Минимум из DDL: program_items.target_duration_sec between 10 and 36000. */
export const MIN_TARGET_DURATION_SEC = 10

export type ProgramListItem = Program & {
  dayCount: number
  /** Названия дней по порядку — короткая подпись в списке программ. */
  dayNames: string[]
}

/** Идентификатор новой строки. Генерится клиентом, чтобы оптимистичная строка была настоящей. */
export function newId(): string {
  return newUuid()
}

// --- Запросы ---------------------------------------------------------------

const PROGRAM_SELECT = `
  id, profile_id, name, is_active, created_at, updated_at,
  days:program_days (
    id, program_id, order_index, name, created_at,
    items:program_items (
      id, program_day_id, exercise_id, order_index, target_sets,
      rep_min, rep_max, target_rir, target_duration_sec, target_distance_m,
      last_weight_kg, last_reps, last_duration_sec, last_distance_m,
      created_at, updated_at,
      exercise:exercises (*)
    )
  )
`

type RawProgramDay = ProgramDay & { items: ProgramItemWithExercise[] | null }
type RawProgram = Program & { days: RawProgramDay[] | null }
type RawProgramListRow = Program & { days: Pick<ProgramDay, 'id' | 'name' | 'order_index'>[] | null }

/** Один и тот же порядок везде: дни и упражнения по order_index. */
function normalizeProgram(raw: RawProgram): ProgramWithDays {
  const days: ProgramDayWithItems[] = sortByOrder(raw.days ?? []).map((day) => ({
    ...day,
    items: sortByOrder(day.items ?? []),
  }))
  return { ...raw, days }
}

async function requireProfileId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser()
  if (error) throw error
  const id = data.user?.id
  // Текст ложится в маппер ошибок и превращается в «Сессия истекла — войди заново».
  if (!id) throw new Error('auth session missing')
  return id
}

export function useProgramsList() {
  return useQuery<ProgramListItem[]>({
    queryKey: qk.programs(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('programs')
        .select('id, profile_id, name, is_active, created_at, updated_at, days:program_days(id, name, order_index)')
        .order('is_active', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error

      const rows = (data ?? []) as unknown as RawProgramListRow[]
      return rows.map((row) => {
        const days = sortByOrder(row.days ?? [])
        return { ...row, dayCount: days.length, dayNames: days.map((day) => day.name) }
      })
    },
  })
}

export function useProgram(programId: string | undefined) {
  return useQuery<ProgramWithDays | null>({
    queryKey: qk.program(programId ?? 'none'),
    enabled: Boolean(programId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('programs')
        .select(PROGRAM_SELECT)
        .eq('id', programId as string)
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      return normalizeProgram(data as unknown as RawProgram)
    },
  })
}

// --- Общая механика оптимистичных мутаций ----------------------------------

type ProgramSnapshot = { previous: ProgramWithDays | null | undefined }

/**
 * Мутация, которая правит кэш конкретной программы.
 * `optimistic` получает текущую программу и возвращает новую — без мутаций на месте.
 */
function useProgramMutation<TVars, TData = void>(config: {
  programId: string
  mutationFn: (vars: TVars) => Promise<TData>
  optimistic?: (program: ProgramWithDays, vars: TVars) => ProgramWithDays
  /** true — задеть и список программ (в нём видно количество дней). */
  invalidateList?: boolean
}) {
  const queryClient = useQueryClient()
  const { show } = useToast()
  const { programId, mutationFn, optimistic, invalidateList = false } = config
  const key = qk.program(programId)

  return useMutation<TData, Error, TVars, ProgramSnapshot>({
    mutationFn,
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<ProgramWithDays | null>(key)
      if (optimistic && previous) {
        queryClient.setQueryData<ProgramWithDays | null>(key, optimistic(previous, vars))
      }
      return { previous }
    },
    onError: (error, _vars, context) => {
      if (context && context.previous !== undefined) {
        queryClient.setQueryData<ProgramWithDays | null>(key, context.previous)
      }
      show(toRussianMessage(error), 'error')
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: invalidateList ? qk.programs() : key })
    },
  })
}

function mapDays(
  program: ProgramWithDays,
  fn: (days: ProgramDayWithItems[]) => ProgramDayWithItems[],
): ProgramWithDays {
  return { ...program, days: fn(program.days) }
}

function mapDayItems(
  program: ProgramWithDays,
  dayId: string,
  fn: (items: ProgramItemWithExercise[]) => ProgramItemWithExercise[],
): ProgramWithDays {
  return mapDays(program, (days) =>
    days.map((day) => (day.id === dayId ? { ...day, items: fn(day.items) } : day)),
  )
}

/** Порядок пишем целиком: строк мало (дней до десятка, упражнений до пары десятков). */
async function persistOrder(
  table: 'program_days' | 'program_items',
  rows: readonly Ordered[],
): Promise<void> {
  const results = await Promise.all(
    rows.map((row) =>
      table === 'program_days'
        ? supabase.from('program_days').update({ order_index: row.order_index }).eq('id', row.id)
        : supabase.from('program_items').update({ order_index: row.order_index }).eq('id', row.id),
    ),
  )
  const failed = results.find((result) => result.error)
  if (failed?.error) throw failed.error
}

async function nextDayOrderIndex(programId: string): Promise<number> {
  const { data, error } = await supabase
    .from('program_days')
    .select('id, order_index')
    .eq('program_id', programId)
  if (error) throw error
  return nextOrderIndex(data ?? [])
}

async function nextItemOrderIndex(dayId: string): Promise<number> {
  const { data, error } = await supabase
    .from('program_items')
    .select('id, order_index')
    .eq('program_day_id', dayId)
  if (error) throw error
  return nextOrderIndex(data ?? [])
}

// --- Программы -------------------------------------------------------------

type ProgramsCache = ProgramListItem[] | undefined

/** Списочные мутации: тот же протокол отката, но кэш — список программ. */
function useProgramsListMutation<TVars, TData = void>(config: {
  mutationFn: (vars: TVars) => Promise<TData>
  optimistic?: (programs: ProgramListItem[], vars: TVars) => ProgramListItem[]
}) {
  const queryClient = useQueryClient()
  const { show } = useToast()
  const { mutationFn, optimistic } = config
  const key = qk.programs()

  return useMutation<TData, Error, TVars, { previous: ProgramsCache }>({
    mutationFn,
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<ProgramListItem[]>(key)
      if (optimistic && previous) {
        queryClient.setQueryData<ProgramListItem[]>(key, optimistic(previous, vars))
      }
      return { previous }
    },
    onError: (error, _vars, context) => {
      if (context && context.previous !== undefined) {
        queryClient.setQueryData<ProgramListItem[]>(key, context.previous)
      }
      show(toRussianMessage(error), 'error')
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key })
    },
  })
}

export type CreateProgramVars = { id: string; name: string; makeActive?: boolean }

export function useCreateProgram() {
  return useProgramsListMutation<CreateProgramVars, Program>({
    mutationFn: async ({ id, name, makeActive = false }) => {
      const profileId = await requireProfileId()
      // Активная программа одна: сначала снимаем флаг, только потом ставим новый.
      if (makeActive) await clearActiveProgram(profileId)
      const { data, error } = await supabase
        .from('programs')
        .insert({ id, profile_id: profileId, name: name.trim(), is_active: makeActive })
        .select('id, profile_id, name, is_active, created_at, updated_at')
        .single()
      if (error) throw error
      return data
    },
    optimistic: (programs, { id, name, makeActive = false }) => {
      const now = new Date().toISOString()
      const draft: ProgramListItem = {
        id,
        profile_id: programs[0]?.profile_id ?? '',
        name: name.trim(),
        is_active: makeActive,
        created_at: now,
        updated_at: now,
        dayCount: 0,
        dayNames: [],
      }
      const rest = makeActive
        ? programs.map((program) => ({ ...program, is_active: false }))
        : programs
      return [draft, ...rest]
    },
  })
}

export type UpdateProgramVars = { programId: string; name: string }

export function useUpdateProgram() {
  const queryClient = useQueryClient()
  return useProgramsListMutation<UpdateProgramVars>({
    mutationFn: async ({ programId, name }) => {
      const { error } = await supabase
        .from('programs')
        .update({ name: name.trim() })
        .eq('id', programId)
      if (error) throw error
      // Кэш открытого редактора держим в актуальном виде без лишнего запроса.
      queryClient.setQueryData<ProgramWithDays | null>(qk.program(programId), (prev) =>
        prev ? { ...prev, name: name.trim() } : prev,
      )
    },
    optimistic: (programs, { programId, name }) =>
      programs.map((program) =>
        program.id === programId ? { ...program, name: name.trim() } : program,
      ),
  })
}

export function useDeleteProgram() {
  const queryClient = useQueryClient()
  return useProgramsListMutation<{ programId: string }>({
    mutationFn: async ({ programId }) => {
      const { error } = await supabase.from('programs').delete().eq('id', programId)
      if (error) throw error
      queryClient.removeQueries({ queryKey: qk.program(programId) })
    },
    optimistic: (programs, { programId }) =>
      programs.filter((program) => program.id !== programId),
  })
}

async function clearActiveProgram(profileId: string): Promise<void> {
  const { error } = await supabase
    .from('programs')
    .update({ is_active: false })
    .eq('profile_id', profileId)
    .eq('is_active', true)
  if (error) throw error
}

/**
 * Переключение активной программы.
 *
 * В БД стоит частичный уникальный индекс programs_one_active_per_profile,
 * поэтому порядок обязателен: сначала снять флаг у прежней, потом поставить новой.
 * Транзакции с клиента нет, так что при падении второго шага возвращаем флаг
 * прежней программе, а UI откатывается стандартным onError.
 */
export function useSetActiveProgram() {
  return useProgramsListMutation<{ programId: string }>({
    mutationFn: async ({ programId }) => {
      const profileId = await requireProfileId()

      const { data: active, error: activeError } = await supabase
        .from('programs')
        .select('id')
        .eq('profile_id', profileId)
        .eq('is_active', true)
        .maybeSingle()
      if (activeError) throw activeError
      if (active?.id === programId) return

      if (active) await clearActiveProgram(profileId)

      const { error } = await supabase
        .from('programs')
        .update({ is_active: true })
        .eq('id', programId)

      if (error) {
        if (active) {
          // Вернуть прежнюю активную, чтобы профиль не остался вообще без неё.
          await supabase.from('programs').update({ is_active: true }).eq('id', active.id)
        }
        throw error
      }
    },
    optimistic: (programs, { programId }) =>
      programs.map((program) => ({ ...program, is_active: program.id === programId })),
  })
}

// --- Дни программы ---------------------------------------------------------

export type CreateDayVars = { id: string; name: string }

export function useCreateDay(programId: string) {
  return useProgramMutation<CreateDayVars>({
    programId,
    invalidateList: true,
    mutationFn: async ({ id, name }) => {
      const orderIndex = await nextDayOrderIndex(programId)
      const { error } = await supabase
        .from('program_days')
        .insert({ id, program_id: programId, order_index: orderIndex, name: name.trim() })
      if (error) throw error
    },
    optimistic: (program, { id, name }) =>
      mapDays(program, (days) => [
        ...days,
        {
          id,
          program_id: program.id,
          name: name.trim(),
          order_index: nextOrderIndex(days),
          created_at: new Date().toISOString(),
          items: [],
        },
      ]),
  })
}

export type RenameDayVars = { dayId: string; name: string }

export function useRenameDay(programId: string) {
  return useProgramMutation<RenameDayVars>({
    programId,
    mutationFn: async ({ dayId, name }) => {
      const { error } = await supabase
        .from('program_days')
        .update({ name: name.trim() })
        .eq('id', dayId)
      if (error) throw error
    },
    optimistic: (program, { dayId, name }) =>
      mapDays(program, (days) =>
        days.map((day) => (day.id === dayId ? { ...day, name: name.trim() } : day)),
      ),
  })
}

export function useDeleteDay(programId: string) {
  return useProgramMutation<{ dayId: string }>({
    programId,
    invalidateList: true,
    mutationFn: async ({ dayId }) => {
      const { error } = await supabase.from('program_days').delete().eq('id', dayId)
      if (error) throw error
    },
    optimistic: (program, { dayId }) =>
      mapDays(program, (days) => removeAndReindex(days, dayId)),
  })
}

export type ReorderVars = { dayId: string; direction: Direction }

export function useReorderDays(programId: string) {
  const queryClient = useQueryClient()
  return useProgramMutation<ReorderVars>({
    programId,
    mutationFn: async ({ dayId, direction }) => {
      // onMutate уже переставил дни в кэше — сохраняем именно этот порядок.
      const cached = queryClient.getQueryData<ProgramWithDays | null>(qk.program(programId))
      if (cached) {
        await persistOrder('program_days', cached.days)
        return
      }
      // Кэша нет (редкий случай) — считаем порядок по свежим данным.
      const { data, error } = await supabase
        .from('program_days')
        .select('id, order_index')
        .eq('program_id', programId)
      if (error) throw error
      await persistOrder('program_days', reorderById(data ?? [], dayId, direction))
    },
    optimistic: (program, { dayId, direction }) =>
      mapDays(program, (days) => reorderById(days, dayId, direction)),
  })
}

// --- Упражнения дня --------------------------------------------------------

export type AddItemVars = { id: string; dayId: string; exercise: Exercise }

/** Цели нового элемента: силовые и кардио-поля взаимно null (правило проекта). */
export function targetsForKind(exercise: Pick<Exercise, 'kind'>) {
  return exercise.kind === 'cardio'
    ? {
        target_sets: DEFAULT_CARDIO_TARGET_SETS,
        rep_min: null,
        rep_max: null,
        target_rir: null,
        target_duration_sec: DEFAULT_CARDIO_DURATION_SEC,
        target_distance_m: null,
      }
    : {
        target_sets: DEFAULT_TARGET_SETS,
        rep_min: DEFAULT_REP_MIN,
        rep_max: DEFAULT_REP_MAX,
        target_rir: DEFAULT_TARGET_RIR,
        target_duration_sec: null,
        target_distance_m: null,
      }
}

export function useAddItem(programId: string) {
  return useProgramMutation<AddItemVars>({
    programId,
    mutationFn: async ({ id, dayId, exercise }) => {
      const orderIndex = await nextItemOrderIndex(dayId)
      const { error } = await supabase.from('program_items').insert({
        id,
        program_day_id: dayId,
        exercise_id: exercise.id,
        order_index: orderIndex,
        ...targetsForKind(exercise),
      })
      if (error) throw error
    },
    optimistic: (program, { id, dayId, exercise }) =>
      mapDayItems(program, dayId, (items) => {
        const now = new Date().toISOString()
        const item: ProgramItemWithExercise = {
          id,
          program_day_id: dayId,
          exercise_id: exercise.id,
          order_index: nextOrderIndex(items),
          last_weight_kg: null,
          last_reps: null,
          last_duration_sec: null,
          last_distance_m: null,
          created_at: now,
          updated_at: now,
          ...targetsForKind(exercise),
          exercise,
        }
        return [...items, item]
      }),
  })
}

export type UpdateItemVars = { dayId: string; itemId: string; patch: ProgramItemUpdate }

export function useUpdateItem(programId: string) {
  return useProgramMutation<UpdateItemVars>({
    programId,
    mutationFn: async ({ itemId, patch }) => {
      const { error } = await supabase.from('program_items').update(patch).eq('id', itemId)
      if (error) throw error
    },
    optimistic: (program, { dayId, itemId, patch }) =>
      mapDayItems(program, dayId, (items) =>
        items.map((item) =>
          item.id === itemId ? ({ ...item, ...patch } as ProgramItemWithExercise) : item,
        ),
      ),
  })
}

export function useDeleteItem(programId: string) {
  return useProgramMutation<{ dayId: string; itemId: string }>({
    programId,
    mutationFn: async ({ itemId }) => {
      const { error } = await supabase.from('program_items').delete().eq('id', itemId)
      if (error) throw error
    },
    optimistic: (program, { dayId, itemId }) =>
      mapDayItems(program, dayId, (items) => removeAndReindex(items, itemId)),
  })
}

export type ReorderItemVars = { dayId: string; itemId: string; direction: Direction }

export function useReorderItems(programId: string) {
  const queryClient = useQueryClient()
  return useProgramMutation<ReorderItemVars>({
    programId,
    mutationFn: async ({ dayId, itemId, direction }) => {
      const cached = queryClient.getQueryData<ProgramWithDays | null>(qk.program(programId))
      const day = cached?.days.find((candidate) => candidate.id === dayId)
      if (day) {
        await persistOrder('program_items', day.items)
        return
      }
      const { data, error } = await supabase
        .from('program_items')
        .select('id, order_index')
        .eq('program_day_id', dayId)
      if (error) throw error
      await persistOrder('program_items', reorderById(data ?? [], itemId, direction))
    },
    optimistic: (program, { dayId, itemId, direction }) =>
      mapDayItems(program, dayId, (items) => reorderById(items, itemId, direction)),
  })
}

export type { ProgramItem, ProgramWithDays, ProgramDayWithItems, ProgramItemWithExercise }
