import { describe, expect, it } from 'vitest'

import { toDateKey } from '@/lib/format'

import {
  buildChart,
  filterByPeriod,
  periodDays,
  summarize,
  weightBounds,
  type WeightPoint,
} from '../series'

const POINTS: WeightPoint[] = [
  { date: '2026-06-01', kg: 84 },
  { date: '2026-07-01', kg: 82.5 },
  { date: '2026-08-16', kg: 81 },
]

/** 16 августа 2026, полдень по местному времени. */
const NOW = new Date(2026, 7, 16, 12, 0, 0).getTime()

describe('filterByPeriod', () => {
  it('режет журнал по дневным клеткам календаря, включая сегодняшнюю', () => {
    // 30 дней от 16 августа — это 18 июля и позже: июньская и июльская точки уходят.
    expect(filterByPeriod(POINTS, 30, NOW)).toEqual([{ date: '2026-08-16', kg: 81 }])
    expect(filterByPeriod(POINTS, 90, NOW)).toHaveLength(3)
  })

  it('null — весь журнал', () => {
    expect(filterByPeriod(POINTS, null, NOW)).toHaveLength(3)
    expect(periodDays('all')).toBeNull()
    expect(periodDays('30')).toBe(30)
  })

  it('запись за сегодня попадает в любой период', () => {
    const today = [{ date: toDateKey(NOW), kg: 80 }]
    expect(filterByPeriod(today, 1, NOW)).toHaveLength(1)
  })
})

describe('summarize', () => {
  it('считает изменение от первой точки к последней', () => {
    const summary = summarize(POINTS)
    expect(summary).toMatchObject({ current: 81, first: 84, delta: -3, min: 81, max: 84, count: 3 })
  })

  it('одна точка — изменения нет', () => {
    expect(summarize([{ date: '2026-08-16', kg: 81 }])?.delta).toBe(0)
  })

  it('пустой журнал — null, а не нули', () => {
    expect(summarize([])).toBeNull()
  })
})

describe('weightBounds', () => {
  it('раздвигает шкалу до половин килограмма', () => {
    const { min, max } = weightBounds(POINTS)
    expect(min).toBeLessThanOrEqual(81)
    expect(max).toBeGreaterThanOrEqual(84)
    expect(min * 2).toBe(Math.round(min * 2))
    expect(max * 2).toBe(Math.round(max * 2))
  })

  it('плоскому журналу даёт коридор, а не нулевой диапазон', () => {
    const { min, max } = weightBounds([
      { date: '2026-08-01', kg: 80 },
      { date: '2026-08-02', kg: 80 },
    ])
    expect(max - min).toBeGreaterThanOrEqual(2)
  })
})

describe('buildChart', () => {
  it('пустой журнал не рисуется', () => {
    expect(buildChart([])).toBeNull()
  })

  it('ось X календарная: точка через месяц стоит дальше, чем соседняя', () => {
    const chart = buildChart(POINTS)
    expect(chart).not.toBeNull()
    const [first, middle, last] = chart!.points
    // 1 июня -> 1 июля -> 16 августа: второй промежуток длиннее первого,
    // индексная ось дала бы одинаковые.
    expect(middle!.x - first!.x).toBeLessThan(last!.x - middle!.x)
  })

  it('лёгкий вес внизу, тяжёлый вверху', () => {
    const chart = buildChart(POINTS)!
    const [heaviest, , lightest] = chart.points
    expect(lightest!.y).toBeGreaterThan(heaviest!.y)
  })

  it('единственная точка встаёт у правого края', () => {
    const chart = buildChart([{ date: '2026-08-16', kg: 81 }])!
    expect(chart.points).toHaveLength(1)
    expect(chart.points[0]!.x).toBe(chart.width - 40)
    expect(chart.line).toMatch(/^M/)
  })

  it('заливка замкнута по нижней кромке', () => {
    const chart = buildChart(POINTS)!
    expect(chart.area.endsWith('Z')).toBe(true)
    expect(chart.area.startsWith(chart.line)).toBe(true)
  })
})
