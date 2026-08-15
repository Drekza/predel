/**
 * Данные экрана тренировки.
 *
 * Два правила, которым подчинён весь файл:
 *  1. Компоненты не трогают supabase напрямую — только эти хуки.
 *  2. Запись подхода НИКОГДА не идёт в сеть напрямую. Она кладётся в
 *     офлайн-очередь (localStorage) и оттуда уходит на сервер. Список на
 *     экране — это серверные строки плюс наложенная очередь, поэтому
 *     обновление с сервера физически не может стереть неотправленный подход,
 *     а перезагрузка страницы посреди тренировки его не теряет.
 *
 * Запросы намеренно плоские (без вложенных select'ов PostgREST): схема
 * описана типом вручную, и разбор вложенных строк запроса опирался бы на
 * вывод типов, который легко разъезжается. Несколько маленьких запросов
 * надёжнее одного умного.
 *
 * Фильтрации по profile_id здесь нет — её делает RLS (спека 10.2), поэтому
 * фича не зависит от того, как устроен модуль авторизации.
 */

import { useCallback, useMemo } from 'react'
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query'

import { qk } from '@/lib/keys'
import { supabase } from '@/lib/supabase'
import { newUuid } from '@/lib/uuid'
import { enqueue, getQueuedOps, useOfflineQueue } from '@/lib/offline/queue'
import { registerOfflineExecutors } from '@/lib/offline/executors'
import type { SetPatch } from '@/lib/offline/types'
import type {
  Exercise,
  ExerciseKind,
  PendingWorkoutSet,
  Program,
  ProgramDay,
  ProgramItem,
  Session,
  SessionExerciseView,
  SessionState,
  SessionTotals,
  SetDraftFilled,
  WorkoutSet,
} from '@/types/domain'

import {
  computeSessionTotals,
  hasQueuedFinish,
  mergeQueuedSets,
  type SetLike,
} from './prefill'

// --- Общее -----------------------------------------------------------------

const HISTORY_PAGE_SIZE = 10
/** Сколько прошлых подходов тянуть, чтобы найти последний по каждому упражнению. */
const HISTORY_SET_LOOKUP_LIMIT = 300

function unwrap<T>(result: { data: T | null; error: unknown }): T {
  if (result.error) throw result.error
  return (result.data ?? null) as T
}

/** rpc может вернуть строку или массив из одной строки — принимаем оба вида. */
function firstRow<T>(data: unknown): T | null {
  if (Array.isArray(data)) return (data[0] ?? null) as T | null
  return (data ?? null) as T | null
}

function nowIso(): string {
  return new Date().toISOString()
}

// --- Исполнители очереди ---------------------------------------------------

// Реальная отправка операций живёт в src/lib/offline/executors.ts —
// одно место на всё приложение. Регистрация идемпотентна.
registerOfflineExecutors()

// --- Активная программа (главный экран) ------------------------------------

export type ProgramDayCard = {
  day: ProgramDay
  exerciseCount: number
  strengthSetCount: number
  /** Когда этот день выполнялся последний раз. */
  lastSessionAt: string | null
}

export type ActiveProgramView = {
  program: Program
  days: ProgramDayCard[]
}

/**
 * Ключ производный от qk.programs(): инвалидация программ подхватит и его,
 * но форма данных своя, поэтому кэш не конфликтует со списком программ.
 */
const activeProgramKey = () => [...qk.programs(), 'active-with-days'] as const

export function useActiveProgram() {
  return useQuery({
    queryKey: activeProgramKey(),
    queryFn: async (): Promise<ActiveProgramView | null> => {
      const programs = unwrap(
        await supabase.from('programs').select('*').eq('is_active', true).limit(1),
      ) as Program[] | null
      const program = programs?.[0]
      if (!program) return null

      const days = (unwrap(
        await supabase
          .from('program_days')
          .select('*')
          .eq('program_id', program.id)
          .order('order_index', { ascending: true }),
      ) ?? []) as ProgramDay[]

      if (days.length === 0) return { program, days: [] }

      const dayIds = days.map((day) => day.id)

      const items = (unwrap(
        await supabase
          .from('program_items')
          .select('id, program_day_id, target_sets, exercise_id')
          .in('program_day_id', dayIds),
      ) ?? []) as Array<Pick<ProgramItem, 'id' | 'program_day_id' | 'target_sets' | 'exercise_id'>>

      // Вид упражнения нужен, чтобы кардио не попало в счётчик подходов:
      // оно не даёт ни очков, ни тоннажа и не считается в прогрессе тренировки.
      const itemExerciseIds = [...new Set(items.map((item) => item.exercise_id))]
      const kinds =
        itemExerciseIds.length > 0
          ? ((unwrap(
              await supabase.from('exercises').select('id, kind').in('id', itemExerciseIds),
            ) ?? []) as Array<Pick<Exercise, 'id' | 'kind'>>)
          : []
      const kindById = new Map(kinds.map((exercise) => [exercise.id, exercise.kind]))

      // Когда каждый день выполнялся последний раз.
      const past = (unwrap(
        await supabase
          .from('sessions')
          .select('program_day_id, started_at')
          .eq('state', 'finished')
          .in('program_day_id', dayIds)
          .order('started_at', { ascending: false })
          .limit(120),
      ) ?? []) as Array<Pick<Session, 'program_day_id' | 'started_at'>>

      const lastByDay = new Map<string, string>()
      for (const row of past) {
        if (!row.program_day_id) continue
        if (!lastByDay.has(row.program_day_id)) lastByDay.set(row.program_day_id, row.started_at)
      }

      const cards: ProgramDayCard[] = days.map((day) => {
        const dayItems = items.filter((item) => item.program_day_id === day.id)
        return {
          day,
          exerciseCount: dayItems.length,
          strengthSetCount: dayItems.reduce(
            (sum, item) =>
              kindById.get(item.exercise_id) === 'cardio' ? sum : sum + (item.target_sets ?? 0),
            0,
          ),
          lastSessionAt: lastByDay.get(day.id) ?? null,
        }
      })

      return { program, days: cards }
    },
  })
}

// --- Активная сессия -------------------------------------------------------

/**
 * Незавершённая сессия пользователя. Если её закрытие уже лежит в очереди,
 * считаем сессию закрытой: иначе экран будет звать «продолжить» тренировку,
 * которую пользователь только что завершил в офлайне.
 */
export function useActiveSession() {
  const query = useQuery({
    queryKey: qk.activeSession(),
    queryFn: async (): Promise<Session | null> => {
      const rows = (unwrap(
        await supabase
          .from('sessions')
          .select('*')
          .eq('state', 'active')
          .order('started_at', { ascending: false })
          .limit(1),
      ) ?? []) as Session[]
      return rows[0] ?? null
    },
    staleTime: 10_000,
  })

  // Подписка на очередь: компонент перерисуется, когда операция добавится или уйдёт.
  useOfflineQueue()
  const ops = getQueuedOps()

  const session = query.data ?? null
  const finishing = session ? hasQueuedFinish(ops, session.id) : false

  return { ...query, data: finishing ? null : session, finishing }
}

export function useStartSession(): UseMutationResult<Session, unknown, string | null> {
  const client = useQueryClient()

  return useMutation({
    mutationFn: async (programDayId: string | null): Promise<Session> => {
      const { data, error } = await supabase.rpc('start_session', {
        p_program_day_id: programDayId,
      })
      if (error) throw error
      const session = firstRow<Session>(data)
      if (!session) throw new Error('Сервер не вернул тренировку')
      return session
    },
    onSuccess: (session) => {
      client.setQueryData(qk.activeSession(), session)
      void client.invalidateQueries({ queryKey: qk.sessions() })
    },
  })
}

// --- Одна сессия -----------------------------------------------------------

export type SessionPlan = {
  session: Session
  day: ProgramDay | null
  items: Array<ProgramItem & { exercise: Exercise }>
}

/** Сессия вместе с планом дня: пункты программы и их упражнения. */
export function useSession(sessionId: string | undefined) {
  return useQuery({
    queryKey: qk.session(sessionId ?? 'none'),
    enabled: Boolean(sessionId),
    queryFn: async (): Promise<SessionPlan | null> => {
      if (!sessionId) return null

      const sessions = (unwrap(
        await supabase.from('sessions').select('*').eq('id', sessionId).limit(1),
      ) ?? []) as Session[]
      const session = sessions[0]
      if (!session) return null

      if (!session.program_day_id) return { session, day: null, items: [] }

      const days = (unwrap(
        await supabase
          .from('program_days')
          .select('*')
          .eq('id', session.program_day_id)
          .limit(1),
      ) ?? []) as ProgramDay[]

      const items = (unwrap(
        await supabase
          .from('program_items')
          .select('*')
          .eq('program_day_id', session.program_day_id)
          .order('order_index', { ascending: true }),
      ) ?? []) as ProgramItem[]

      if (items.length === 0) return { session, day: days[0] ?? null, items: [] }

      const exercises = (unwrap(
        await supabase
          .from('exercises')
          .select('*')
          .in(
            'id',
            items.map((item) => item.exercise_id),
          ),
      ) ?? []) as Exercise[]

      const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]))
      const withExercise = items.flatMap((item) => {
        const exercise = byId.get(item.exercise_id)
        // Упражнение могло исчезнуть — пункт без него показать нечем.
        return exercise ? [{ ...item, exercise }] : []
      })

      return { session, day: days[0] ?? null, items: withExercise }
    },
  })
}

/** Подтверждённые сервером подходы сессии. */
export function useSessionSets(sessionId: string | undefined) {
  return useQuery({
    queryKey: qk.sessionSets(sessionId ?? 'none'),
    enabled: Boolean(sessionId),
    queryFn: async (): Promise<WorkoutSet[]> => {
      if (!sessionId) return []
      return (unwrap(
        await supabase
          .from('sets')
          .select('*')
          .eq('session_id', sessionId)
          .order('logged_at', { ascending: true }),
      ) ?? []) as WorkoutSet[]
    },
    staleTime: 5_000,
  })
}

/**
 * Последний силовой подход по каждому упражнению за пределами текущей сессии.
 * Нужен только как третий эшелон предзаполнения, когда у пункта программы
 * ещё нет памяти (спека 9.2, пункт 2).
 */
export function useExerciseHistory(exerciseIds: string[], excludeSessionId?: string) {
  const ids = useMemo(() => [...new Set(exerciseIds)].sort(), [exerciseIds])

  return useQuery({
    queryKey: [...qk.exercises(), 'last-sets', ids],
    enabled: ids.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Record<string, SetLike>> => {
      let request = supabase
        .from('sets')
        .select('exercise_id, kind, weight_kg, reps, rir, duration_sec, distance_m, logged_at')
        .in('exercise_id', ids)
        .eq('kind', 'strength')
        .order('logged_at', { ascending: false })
        .limit(HISTORY_SET_LOOKUP_LIMIT)

      if (excludeSessionId) request = request.neq('session_id', excludeSessionId)

      const rows = (unwrap(await request) ?? []) as Array<SetLike & { exercise_id: string }>

      const latest: Record<string, SetLike> = {}
      for (const row of rows) {
        // Строки отсортированы по убыванию времени — первая встреча и есть последняя.
        if (!(row.exercise_id in latest)) latest[row.exercise_id] = row
      }
      return latest
    },
  })
}

// --- Сводная доска сессии --------------------------------------------------

export type SessionBoard = {
  session: Session | null
  day: ProgramDay | null
  views: SessionExerciseView[]
  /** Все подходы сессии с наложенной очередью, в порядке логирования. */
  sets: PendingWorkoutSet[]
  totals: SessionTotals
  history: Record<string, SetLike>
  loading: boolean
  error: unknown
  /** Есть ли неотправленные операции по этой сессии. */
  pending: number
}

/**
 * Всё, что нужно экрану логирования, одним объектом.
 * Здесь сходятся план дня, серверные подходы и офлайн-очередь.
 */
export function useSessionBoard(sessionId: string | undefined): SessionBoard {
  const planQuery = useSession(sessionId)
  const setsQuery = useSessionSets(sessionId)

  const plan = planQuery.data ?? null
  const exerciseIds = useMemo(
    () => (plan?.items ?? []).map((item) => item.exercise_id),
    [plan],
  )
  const historyQuery = useExerciseHistory(exerciseIds, sessionId)

  // Подписка на очередь: любое изменение перерисует экран.
  useOfflineQueue()
  const ops = getQueuedOps()

  const serverSets = setsQuery.data
  const sets = useMemo(
    () => (sessionId ? mergeQueuedSets(serverSets ?? [], ops, sessionId) : []),
    [serverSets, ops, sessionId],
  )

  const views = useMemo<SessionExerciseView[]>(() => {
    if (!plan) return []
    const byExercise = new Map<string, PendingWorkoutSet[]>()
    for (const set of sets) {
      const list = byExercise.get(set.exercise_id)
      if (list) list.push(set)
      else byExercise.set(set.exercise_id, [set])
    }

    const planned = plan.items.map<SessionExerciseView>((item) => ({
      programItemId: item.id,
      exercise: item.exercise,
      kind: item.exercise.kind,
      orderIndex: item.order_index,
      targetSets: item.target_sets,
      repMin: item.rep_min,
      repMax: item.rep_max,
      targetRir: item.target_rir,
      targetDurationSec: item.target_duration_sec,
      targetDistanceM: item.target_distance_m,
      lastWeightKg: item.last_weight_kg,
      lastReps: item.last_reps,
      lastDurationSec: item.last_duration_sec,
      lastDistanceM: item.last_distance_m,
      sets: byExercise.get(item.exercise_id) ?? [],
    }))

    return planned
  }, [plan, sets])

  const totals = useMemo(
    () =>
      computeSessionTotals(sets, {
        startedAt: plan?.session.started_at ?? null,
        finishedAt: plan?.session.finished_at ?? null,
      }),
    [sets, plan],
  )

  const pending = useMemo(
    () =>
      sessionId
        ? ops.filter((op) => op.payload.sessionId === sessionId && op.status !== 'failed').length
        : 0,
    [ops, sessionId],
  )

  return {
    session: plan?.session ?? null,
    day: plan?.day ?? null,
    views,
    sets,
    totals,
    history: historyQuery.data ?? {},
    loading: planQuery.isPending || setsQuery.isPending,
    error: planQuery.error ?? setsQuery.error,
    pending,
  }
}

// --- Мутации подходов ------------------------------------------------------

export type LogSetVars = {
  sessionId: string
  exerciseId: string
  programItemId: string | null
  orderIndex: number
  draft: SetDraftFilled
}

function draftToFields(draft: SetDraftFilled): {
  kind: ExerciseKind
  weightKg: number | null
  reps: number | null
  rir: number | null
  durationSec: number | null
  distanceM: number | null
} {
  if (draft.kind === 'cardio') {
    return {
      kind: 'cardio',
      weightKg: null,
      reps: null,
      rir: null,
      durationSec: draft.durationSec,
      distanceM: draft.distanceM,
    }
  }
  return {
    kind: 'strength',
    weightKg: draft.weightKg,
    reps: draft.reps,
    rir: draft.rir,
    durationSec: null,
    distanceM: null,
  }
}

/**
 * Записать подход. Возвращает client_id мгновенно: строка появляется на экране
 * из очереди, не дожидаясь сети. Потерять подход нельзя (спека 10.4).
 */
export function useLogSet(): UseMutationResult<string, unknown, LogSetVars> {
  return useMutation({
    mutationFn: async (vars: LogSetVars): Promise<string> => {
      const clientId = newUuid()
      enqueue({
        kind: 'log_set',
        id: clientId,
        payload: {
          sessionId: vars.sessionId,
          clientId,
          exerciseId: vars.exerciseId,
          programItemId: vars.programItemId,
          orderIndex: vars.orderIndex,
          ...draftToFields(vars.draft),
          // Время нажатия кнопки, а не момента отправки: таймер отдыха врать не должен.
          loggedAt: nowIso(),
        },
      })
      return clientId
    },
  })
}

export type UpdateSetVars = {
  sessionId: string
  clientId: string
  setId: string | null
  patch: SetPatch
}

export function useUpdateSet(): UseMutationResult<void, unknown, UpdateSetVars> {
  return useMutation({
    mutationFn: async (vars: UpdateSetVars): Promise<void> => {
      enqueue({
        kind: 'update_set',
        payload: {
          sessionId: vars.sessionId,
          setId: vars.setId,
          clientId: vars.clientId,
          patch: vars.patch,
        },
      })
    },
  })
}

export type DeleteSetVars = {
  sessionId: string
  clientId: string
  setId: string | null
}

export function useDeleteSet(): UseMutationResult<void, unknown, DeleteSetVars> {
  return useMutation({
    mutationFn: async (vars: DeleteSetVars): Promise<void> => {
      enqueue({
        kind: 'delete_set',
        payload: { sessionId: vars.sessionId, setId: vars.setId, clientId: vars.clientId },
      })
    },
  })
}

// --- Завершение сессии -----------------------------------------------------

export type FinishSessionVars = {
  sessionId: string
  note?: string | null
}

/**
 * Закрытие сессии тоже идёт через очередь — и это принципиально:
 * FIFO гарантирует, что сервер посчитает итоги уже после того,
 * как доедут все подходы.
 */
function useCloseSession(state: Extract<SessionState, 'finished' | 'abandoned'>) {
  const client = useQueryClient()

  return useMutation({
    mutationFn: async (vars: FinishSessionVars): Promise<void> => {
      enqueue({
        kind: 'finish_session',
        payload: { sessionId: vars.sessionId, state, note: vars.note ?? null },
      })
    },
    onSuccess: (_data, vars) => {
      // Локально сессия закрыта сразу: экран не должен ждать сеть.
      client.setQueryData(qk.activeSession(), null)
      client.setQueryData<SessionPlan | null>(qk.session(vars.sessionId), (previous) =>
        previous
          ? {
              ...previous,
              session: { ...previous.session, state, finished_at: nowIso() },
            }
          : previous,
      )
    },
  })
}

export function useFinishSession() {
  return useCloseSession('finished')
}

export function useAbandonSession() {
  return useCloseSession('abandoned')
}

// --- История ---------------------------------------------------------------

export type HistoryRow = {
  session: Session
  dayName: string | null
  totals: SessionTotals
}

export type HistoryPage = {
  rows: HistoryRow[]
  nextOffset: number | null
}

/** Завершённые тренировки постранично: «Показать ещё» вместо бесконечной ленты. */
export function useSessionsHistory() {
  return useInfiniteQuery({
    queryKey: [...qk.sessions(), 'history'] as const,
    initialPageParam: 0,
    getNextPageParam: (lastPage: HistoryPage) => lastPage.nextOffset,
    queryFn: async ({ pageParam }): Promise<HistoryPage> => {
      const offset = pageParam
      const sessions = (unwrap(
        await supabase
          .from('sessions')
          .select('*')
          .in('state', ['finished', 'abandoned'])
          .order('started_at', { ascending: false })
          .range(offset, offset + HISTORY_PAGE_SIZE - 1),
      ) ?? []) as Session[]

      if (sessions.length === 0) return { rows: [], nextOffset: null }

      const sessionIds = sessions.map((session) => session.id)
      const sets = (unwrap(
        await supabase
          .from('sets')
          .select('session_id, exercise_id, kind, weight_kg, reps, duration_sec, distance_m')
          .in('session_id', sessionIds),
      ) ?? []) as Array<SetLike & { session_id: string; exercise_id: string }>

      const dayIds = [
        ...new Set(
          sessions.flatMap((session) => (session.program_day_id ? [session.program_day_id] : [])),
        ),
      ]
      const days =
        dayIds.length > 0
          ? (((unwrap(await supabase.from('program_days').select('id, name').in('id', dayIds)) ??
              []) as Array<Pick<ProgramDay, 'id' | 'name'>>))
          : []
      const dayNames = new Map(days.map((day) => [day.id, day.name]))

      const setsBySession = new Map<string, Array<SetLike & { exercise_id: string }>>()
      for (const set of sets) {
        const list = setsBySession.get(set.session_id)
        if (list) list.push(set)
        else setsBySession.set(set.session_id, [set])
      }

      const rows: HistoryRow[] = sessions.map((session) => ({
        session,
        dayName: session.program_day_id
          ? (dayNames.get(session.program_day_id) ?? null)
          : null,
        totals: computeSessionTotals(setsBySession.get(session.id) ?? [], {
          startedAt: session.started_at,
          finishedAt: session.finished_at,
        }),
      }))

      return {
        rows,
        nextOffset: sessions.length < HISTORY_PAGE_SIZE ? null : offset + HISTORY_PAGE_SIZE,
      }
    },
  })
}

/**
 * Перечитать подходы сессии. Экран зовёт это при возврате из фона:
 * пока приложение было свёрнуто, очередь могла дослать операции.
 */
export function useRefreshSession(sessionId: string | undefined) {
  const client = useQueryClient()
  return useCallback(() => {
    if (!sessionId) return
    void client.invalidateQueries({ queryKey: qk.sessionSets(sessionId) })
  }, [client, sessionId])
}
