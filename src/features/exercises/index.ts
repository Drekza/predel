/** Публичный контракт фичи «Упражнения». Остальные фичи импортируют только отсюда. */

export { ExercisePicker } from './ExercisePicker'
export { ExerciseCard } from './ExerciseCard'
export { CustomExerciseForm } from './CustomExerciseForm'

export {
  useExercises,
  useExercise,
  useExerciseCatalog,
  useCreateCustomExercise,
  validateCustomExercise,
  exerciseErrorMessage,
  EXERCISES_STALE_TIME_MS,
  EXERCISES_MAX_ROWS,
} from './api'
export type {
  CustomExerciseInput,
  CustomExerciseErrors,
  UseExercisesResult,
} from './api'

export {
  MUSCLE_GROUPS,
  STAT_FILTERS,
  EQUIPMENT_FILTERS,
  PICKER_RESULT_LIMIT,
  filterExercises,
  normalizeSearch,
  musclesLabel,
  musclesOfStat,
  exerciseStats,
  primaryStats,
  splitByKind,
} from './muscleFilters'
export type { ExerciseFilter, FilterOption, MuscleGroup } from './muscleFilters'
