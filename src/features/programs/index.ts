/** Публичный контракт фичи «Программы». Роутер и соседние фичи берут только отсюда. */

export { ProgramsPage } from './ProgramsPage'
export { ProgramEditorPage } from './ProgramEditorPage'
export { ProgramDayEditor } from './ProgramDayEditor'
export { ProgramItemRow } from './ProgramItemRow'

export {
  newId,
  useAddItem,
  useCreateDay,
  useCreateProgram,
  useDeleteDay,
  useDeleteItem,
  useDeleteProgram,
  useProgram,
  useProgramsList,
  useRenameDay,
  useReorderDays,
  useReorderItems,
  useSetActiveProgram,
  useUpdateItem,
  useUpdateProgram,
  DEFAULT_CARDIO_DURATION_SEC,
  DEFAULT_CARDIO_TARGET_SETS,
  DEFAULT_REP_MAX,
  DEFAULT_REP_MIN,
  DEFAULT_TARGET_RIR,
  DEFAULT_TARGET_SETS,
} from './api'

export type {
  AddItemVars,
  CreateDayVars,
  CreateProgramVars,
  ProgramListItem,
  RenameDayVars,
  ReorderItemVars,
  ReorderVars,
  UpdateItemVars,
  UpdateProgramVars,
} from './api'

export {
  canMove,
  indexOfId,
  moveById,
  moveByIndex,
  nextOrderIndex,
  orderPatch,
  reindex,
  removeAndReindex,
  reorderById,
  sortByOrder,
} from './reorder'

export type { Direction, OrderPatch, Ordered } from './reorder'
