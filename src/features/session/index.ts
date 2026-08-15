/**
 * Публичная поверхность фичи «Сессия».
 * Роутер подключает страницы отсюда и больше ничего о фиче не знает.
 */

export { HomePage } from './HomePage'
export { SessionPage } from './SessionPage'
export { SessionSummaryPage } from './SessionSummaryPage'
export { HistoryPage } from './HistoryPage'

// Составные части экрана — на случай, если понадобятся соседним фичам.
export { ExerciseBlock } from './ExerciseBlock'
export { SetRow } from './SetRow'
export { SetInputBar } from './SetInputBar'
export { RestTimer } from './RestTimer'

export {
  useActiveProgram,
  useActiveSession,
  useStartSession,
  useSession,
  useSessionSets,
  useSessionBoard,
  useExerciseHistory,
  useLogSet,
  useUpdateSet,
  useDeleteSet,
  useFinishSession,
  useAbandonSession,
  useSessionsHistory,
} from './api'

export type {
  ActiveProgramView,
  ProgramDayCard,
  SessionBoard,
  SessionPlan,
  HistoryRow,
  HistoryPage as HistoryPageData,
  LogSetVars,
  UpdateSetVars,
  DeleteSetVars,
  FinishSessionVars,
} from './api'

export {
  nextStrengthDraft,
  nextCardioDraft,
  nextSetDraft,
  draftForExercise,
  isSubmittable,
  normalize,
  targetLine,
  mergeQueuedSets,
  computeSessionTotals,
  computeProgress,
  computeBreakdown,
  DEFAULT_REPS,
  DEFAULT_RIR,
  DEFAULT_CARDIO_SEC,
} from './prefill'

export type { PrefillInput, SessionProgress, ExerciseBreakdown, SetLike } from './prefill'
