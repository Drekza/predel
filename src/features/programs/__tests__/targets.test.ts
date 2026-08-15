import { describe, expect, it } from 'vitest'

import {
  DEFAULT_CARDIO_DURATION_SEC,
  DEFAULT_CARDIO_TARGET_SETS,
  DEFAULT_REP_MAX,
  DEFAULT_REP_MIN,
  DEFAULT_TARGET_RIR,
  DEFAULT_TARGET_SETS,
  targetsForKind,
} from '../api'

/**
 * Ключевое правило проекта: у силового элемента кардио-цели строго null,
 * у кардио-элемента — силовые. Смешать их нельзя ни при каком вводе.
 */
describe('targetsForKind', () => {
  it('силовое: 3×8–12 при запасе 2, кардио-цели пустые', () => {
    expect(targetsForKind({ kind: 'strength' })).toEqual({
      target_sets: DEFAULT_TARGET_SETS,
      rep_min: DEFAULT_REP_MIN,
      rep_max: DEFAULT_REP_MAX,
      target_rir: DEFAULT_TARGET_RIR,
      target_duration_sec: null,
      target_distance_m: null,
    })
  })

  it('кардио: один отрезок на 10 минут, силовые цели пустые', () => {
    expect(targetsForKind({ kind: 'cardio' })).toEqual({
      target_sets: DEFAULT_CARDIO_TARGET_SETS,
      rep_min: null,
      rep_max: null,
      target_rir: null,
      target_duration_sec: DEFAULT_CARDIO_DURATION_SEC,
      target_distance_m: null,
    })
  })

  it('у кардио нет ни повторов, ни RIR', () => {
    const cardio = targetsForKind({ kind: 'cardio' })
    expect(cardio.rep_min).toBeNull()
    expect(cardio.rep_max).toBeNull()
    expect(cardio.target_rir).toBeNull()
  })

  it('целевые подходы всегда в границах DDL (1..12)', () => {
    for (const kind of ['strength', 'cardio'] as const) {
      const targets = targetsForKind({ kind })
      expect(targets.target_sets).toBeGreaterThanOrEqual(1)
      expect(targets.target_sets).toBeLessThanOrEqual(12)
    }
  })

  it('диапазон повторов не перевёрнут', () => {
    const strength = targetsForKind({ kind: 'strength' })
    expect(strength.rep_max).toBeGreaterThanOrEqual(strength.rep_min as number)
  })

  it('целевое время кардио попадает в диапазон DDL (10..36000)', () => {
    const cardio = targetsForKind({ kind: 'cardio' })
    expect(cardio.target_duration_sec).toBeGreaterThanOrEqual(10)
    expect(cardio.target_duration_sec).toBeLessThanOrEqual(36_000)
  })
})
