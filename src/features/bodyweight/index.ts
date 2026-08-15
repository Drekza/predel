/**
 * Публичная поверхность фичи «Вес тела».
 * Роутер подключает экран отсюда и больше ничего о фиче не знает.
 */

export { BodyweightPage } from './BodyweightPage'
export { WeightChart } from './WeightChart'

export {
  useBodyweightEntries,
  useSaveBodyweight,
  useDeleteBodyweightEntry,
  bodyweightErrorMessage,
} from './api'
export type { BodyweightDraft } from './api'

export {
  PERIODS,
  periodDays,
  filterByPeriod,
  summarize,
  weightBounds,
  buildChart,
} from './series'
export type { PeriodValue, WeightPoint, WeightSummary, ChartGeometry, ChartPoint } from './series'
