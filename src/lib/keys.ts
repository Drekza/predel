/**
 * Ключи TanStack Query. ЕДИНСТВЕННОЕ место, где они объявлены:
 * руками массивы в компонентах не собираем, иначе инвалидация разъедется.
 *
 * Иерархия: ['gymrpg', <сущность>, ...] — инвалидация по префиксу работает
 * (`queryClient.invalidateQueries({ queryKey: qk.programs() })` снесёт и program(id)).
 */

export type ExerciseFilters = {
  /** Поисковая строка по name_ru / name_en. */
  search?: string
  /** Фильтр по мышце (значение из MUSCLE_KEYS). */
  muscle?: string
  /** Фильтр по оборудованию (значение из EQUIPMENT_KEYS). */
  equipment?: string
  /** 'strength' | 'cardio' */
  kind?: string
  /** Только свои упражнения. */
  customOnly?: boolean
}

const ROOT = 'gymrpg' as const

export const qk = {
  all: () => [ROOT] as const,

  profile: (id: string) => [ROOT, 'profile', id] as const,

  exercises: (filters?: ExerciseFilters) =>
    filters ? ([ROOT, 'exercises', filters] as const) : ([ROOT, 'exercises'] as const),
  exercise: (id: string) => [ROOT, 'exercises', 'detail', id] as const,

  programs: () => [ROOT, 'programs'] as const,
  program: (id: string) => [ROOT, 'programs', id] as const,

  activeSession: () => [ROOT, 'sessions', 'active'] as const,
  session: (id: string) => [ROOT, 'sessions', id] as const,
  sessionSets: (id: string) => [ROOT, 'sessions', id, 'sets'] as const,
  sessions: () => [ROOT, 'sessions'] as const,

  /** Справочник «мышца -> стат», грузится один раз. */
  muscleStatMap: () => [ROOT, 'muscle-stat-map'] as const,
  /** Константы под тюнинг из таблицы game_config (фаза 2+). */
  gameConfig: () => [ROOT, 'game-config'] as const,
} as const

export type QueryKeys = typeof qk
