import { describe, expect, it } from 'vitest'

import type { Exercise } from '@/types/domain'
import {
  EQUIPMENT_FILTERS,
  MUSCLE_GROUPS,
  STAT_FILTERS,
  filterExercises,
  musclesLabel,
  musclesOfStat,
  normalizeSearch,
  splitByKind,
} from '../muscleFilters'

function makeExercise(patch: Partial<Exercise> & Pick<Exercise, 'id' | 'name_ru'>): Exercise {
  return {
    slug: patch.id,
    name_en: null,
    kind: 'strength',
    equipment: 'barbell',
    category: null,
    mechanic: null,
    force: null,
    level: null,
    primary_muscles: [],
    secondary_muscles: [],
    weight_step_kg: 2.5,
    is_custom: false,
    owner_id: null,
    created_at: '2026-08-15T10:00:00Z',
    ...patch,
  }
}

const bench = makeExercise({
  id: 'bench',
  name_ru: 'Жим лёжа',
  name_en: 'Barbell Bench Press',
  primary_muscles: ['chest'],
  secondary_muscles: ['triceps', 'shoulders'],
})

const row = makeExercise({
  id: 'row',
  name_ru: 'Тяга штанги в наклоне',
  name_en: 'Bent Over Barbell Row',
  primary_muscles: ['middle back'],
  secondary_muscles: ['biceps', 'lats'],
})

const pushdown = makeExercise({
  id: 'pushdown',
  name_ru: 'Разгибания на блоке',
  name_en: 'Triceps Pushdown',
  equipment: 'cable',
  primary_muscles: ['triceps'],
})

const plank = makeExercise({
  id: 'plank',
  name_ru: 'Планка',
  equipment: 'body only',
  primary_muscles: ['abdominals'],
  is_custom: true,
  owner_id: 'profile-1',
})

const treadmill = makeExercise({
  id: 'treadmill',
  name_ru: 'Бег на дорожке',
  name_en: 'Treadmill Running',
  kind: 'cardio',
  equipment: 'machine',
  category: 'cardio',
  primary_muscles: ['quadriceps'],
})

const catalog = [bench, row, pushdown, plank, treadmill]

describe('группировка мышц', () => {
  it('раскладывает ровно 17 мышц по 7 статам', () => {
    expect(STAT_FILTERS).toHaveLength(7)
    expect(MUSCLE_GROUPS).toHaveLength(7)
    const total = MUSCLE_GROUPS.reduce((sum, group) => sum + group.muscles.length, 0)
    expect(total).toBe(17)
  })

  it('кладёт широчайшие в спину, а икры — в квадрицепс', () => {
    expect(musclesOfStat('back')).toContain('lats')
    expect(musclesOfStat('quads')).toContain('calves')
    expect(musclesOfStat('core')).toEqual(['abdominals'])
  })

  it('даёт 12 снарядов с русскими подписями', () => {
    expect(EQUIPMENT_FILTERS).toHaveLength(12)
    expect(EQUIPMENT_FILTERS.map((item) => item.label)).toContain('штанга')
  })
})

describe('normalizeSearch', () => {
  it('сводит регистр, «ё» и разделители к одному виду', () => {
    expect(normalizeSearch('Жим Лёжа')).toBe('жим лежа')
    expect(normalizeSearch('  ТЯГА---ШТАНГИ ')).toBe('тяга штанги')
    expect(normalizeSearch(null)).toBe('')
  })
})

describe('filterExercises', () => {
  it('ищет по подстроке без учёта регистра и «е/ё»', () => {
    expect(filterExercises(catalog, { search: 'лежа' }).map((e) => e.id)).toEqual(['bench'])
    expect(filterExercises(catalog, { search: 'ЛЁЖА' }).map((e) => e.id)).toEqual(['bench'])
  })

  it('ищет и по английскому названию', () => {
    expect(filterExercises(catalog, { search: 'pushdown' }).map((e) => e.id)).toEqual(['pushdown'])
  })

  it('фильтрует по стату, включая вторичные мышцы, и ставит основные выше', () => {
    const ids = filterExercises(catalog, { stat: 'arms' }).map((e) => e.id)
    // трицепс основной у разгибаний, вторичный у жима и тяги
    expect(ids[0]).toBe('pushdown')
    expect(ids).toContain('bench')
    expect(ids).toContain('row')
    expect(ids).not.toContain('plank')
  })

  it('фильтрует по конкретной мышце и по снаряду', () => {
    expect(filterExercises(catalog, { muscle: 'lats' }).map((e) => e.id)).toEqual(['row'])
    expect(filterExercises(catalog, { equipment: 'cable' }).map((e) => e.id)).toEqual(['pushdown'])
  })

  it('исключает уже добавленные упражнения', () => {
    const ids = filterExercises(catalog, { excludeIds: ['bench', 'row'] }).map((e) => e.id)
    expect(ids).not.toContain('bench')
    expect(ids).not.toContain('row')
  })

  it('отбирает только кардио по kind', () => {
    expect(filterExercises(catalog, { kind: 'cardio' }).map((e) => e.id)).toEqual(['treadmill'])
  })

  it('поднимает свои упражнения выше глобальных', () => {
    const ids = filterExercises(catalog, {}).map((e) => e.id)
    expect(ids[0]).toBe('plank')
  })
})

describe('splitByKind', () => {
  it('разводит силовые и кардио', () => {
    const { strength, cardio } = splitByKind(catalog)
    expect(cardio.map((e) => e.id)).toEqual(['treadmill'])
    expect(strength).toHaveLength(4)
  })
})

describe('musclesLabel', () => {
  it('показывает основные мышцы по-русски', () => {
    expect(musclesLabel(bench)).toBe('грудь')
    expect(musclesLabel(row, 1)).toBe('середина спины')
  })
})
