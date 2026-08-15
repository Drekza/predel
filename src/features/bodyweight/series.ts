/**
 * Геометрия и арифметика графика веса. Чистые функции без React и без DOM:
 * компонент только рисует то, что здесь посчитано, а тесты проверяют цифры,
 * а не разметку.
 */

import { parseDateKey } from '@/lib/format'

/** Точка журнала в том виде, в каком её рисует график. */
export type WeightPoint = {
  /** Дата измерения, «2026-08-16». */
  date: string
  kg: number
}

// --- Период ----------------------------------------------------------------

export const PERIODS = [
  { value: '30', label: '30 дн', days: 30 },
  { value: '90', label: '3 мес', days: 90 },
  { value: '365', label: 'год', days: 365 },
  { value: 'all', label: 'всё', days: null },
] as const

export type PeriodValue = (typeof PERIODS)[number]['value']

export function periodDays(value: PeriodValue): number | null {
  return PERIODS.find((p) => p.value === value)?.days ?? null
}

const DAY_MS = 86_400_000

/**
 * Хвост журнала за последние `days` дней. `null` — весь журнал.
 * Границу считаем по локальным полуночам: «30 дней» — это тридцать дневных
 * клеток календаря, включая сегодняшнюю, а не 30×24 часа назад от «сейчас».
 */
export function filterByPeriod(
  points: readonly WeightPoint[],
  days: number | null,
  now: number = Date.now(),
): WeightPoint[] {
  if (days === null) return [...points]
  const today = new Date(now)
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const from = startOfToday - (days - 1) * DAY_MS
  return points.filter((point) => {
    const date = parseDateKey(point.date)
    return date !== null && date.getTime() >= from
  })
}

// --- Сводка ----------------------------------------------------------------

export type WeightSummary = {
  /** Последнее измерение периода. */
  current: number
  /** Первое измерение периода — от него считается изменение. */
  first: number
  /** Плюс — набрал, минус — сбросил. Ноль, если точка одна. */
  delta: number
  min: number
  max: number
  count: number
}

/** Точки должны быть отсортированы по дате. Пустой вход -> null. */
export function summarize(points: readonly WeightPoint[]): WeightSummary | null {
  if (points.length === 0) return null
  const first = points[0] as WeightPoint
  const last = points[points.length - 1] as WeightPoint
  let min = first.kg
  let max = first.kg
  for (const point of points) {
    if (point.kg < min) min = point.kg
    if (point.kg > max) max = point.kg
  }
  return {
    current: last.kg,
    first: first.kg,
    delta: round1(last.kg - first.kg),
    min,
    max,
    count: points.length,
  }
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

// --- Геометрия -------------------------------------------------------------

export type ChartPoint = WeightPoint & { x: number; y: number }

export type ChartGeometry = {
  width: number
  height: number
  points: ChartPoint[]
  /** Ломаная по точкам. */
  line: string
  /** Та же ломаная, замкнутая по нижней кромке — заливка под линией. */
  area: string
  /** Горизонтали сетки: низ, середина, верх шкалы. */
  gridY: number[]
  /** Границы шкалы веса — их и подписываем у оси. */
  min: number
  max: number
}

export type ChartOptions = {
  width?: number
  height?: number
  padTop?: number
  padBottom?: number
  padLeft?: number
  padRight?: number
}

const DEFAULTS = {
  width: 320,
  height: 120,
  padTop: 12,
  padBottom: 12,
  padLeft: 4,
  /** Справа остаётся поле под подписи шкалы: они печатаются на самом графике. */
  padRight: 40,
} as const

/**
 * Шкала веса: диапазон данных, расширенный до круглых половин килограмма.
 * Плоский журнал (все измерения равны) получает искусственный коридор ±1 кг,
 * иначе линия легла бы точно на кромку и читалась как обрезанная.
 */
export function weightBounds(points: readonly WeightPoint[]): { min: number; max: number } {
  if (points.length === 0) return { min: 0, max: 1 }
  let min = points[0]?.kg ?? 0
  let max = min
  for (const point of points) {
    if (point.kg < min) min = point.kg
    if (point.kg > max) max = point.kg
  }
  if (max - min < 0.5) {
    const mid = (min + max) / 2
    return { min: floorHalf(mid - 1), max: ceilHalf(mid + 1) }
  }
  const pad = (max - min) * 0.15
  return { min: floorHalf(min - pad), max: ceilHalf(max + pad) }
}

function floorHalf(value: number): number {
  return Math.floor(value * 2) / 2
}

function ceilHalf(value: number): number {
  return Math.ceil(value * 2) / 2
}

/**
 * Раскладка графика. Ось X — календарная: два измерения через месяц стоят
 * далеко друг от друга, два подряд — рядом. Индексная ось врала бы о темпе.
 * Точки должны быть отсортированы по дате; пустой вход -> null.
 */
export function buildChart(
  points: readonly WeightPoint[],
  options: ChartOptions = {},
): ChartGeometry | null {
  if (points.length === 0) return null

  const { width, height, padTop, padBottom, padLeft, padRight } = { ...DEFAULTS, ...options }
  const { min, max } = weightBounds(points)

  const plotLeft = padLeft
  const plotRight = width - padRight
  const plotTop = padTop
  const plotBottom = height - padBottom
  const plotWidth = Math.max(1, plotRight - plotLeft)
  const plotHeight = Math.max(1, plotBottom - plotTop)

  const times = points.map((point) => parseDateKey(point.date)?.getTime() ?? 0)
  const firstTime = times[0] as number
  const lastTime = times[times.length - 1] as number
  const span = lastTime - firstTime

  const toY = (kg: number) => plotBottom - ((kg - min) / (max - min)) * plotHeight
  const toX = (time: number, index: number) => {
    // Одна точка (или все за один день) — ставим её в правый край: свежее
    // измерение всегда там, где глаз ищет последнее значение.
    if (span <= 0) return points.length === 1 ? plotRight : plotLeft + (plotWidth * index) / Math.max(1, points.length - 1)
    return plotLeft + ((time - firstTime) / span) * plotWidth
  }

  const chartPoints: ChartPoint[] = points.map((point, index) => ({
    ...point,
    x: round2(toX(times[index] as number, index)),
    y: round2(toY(point.kg)),
  }))

  const line = chartPoints
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x} ${point.y}`)
    .join(' ')

  const firstPoint = chartPoints[0] as ChartPoint
  const lastPoint = chartPoints[chartPoints.length - 1] as ChartPoint
  const area = `${line} L${lastPoint.x} ${plotBottom} L${firstPoint.x} ${plotBottom} Z`

  return {
    width,
    height,
    points: chartPoints,
    line,
    area,
    gridY: [plotTop, round2(plotTop + plotHeight / 2), plotBottom],
    min,
    max,
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}
