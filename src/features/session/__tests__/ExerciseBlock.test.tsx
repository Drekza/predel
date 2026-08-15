import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import type { Exercise, SessionExerciseView, WorkoutSet } from '@/types/domain'

import { ExerciseBlock } from '../ExerciseBlock'
import { SetRow } from '../SetRow'
import { isSubmittable, normalize, targetLine } from '../prefill'

function exercise(over: Partial<Exercise> = {}): Exercise {
  return {
    id: 'E1',
    slug: 'bench-press',
    name_ru: 'Жим лёжа',
    name_en: null,
    kind: 'strength',
    equipment: 'barbell',
    category: null,
    mechanic: null,
    force: null,
    level: null,
    primary_muscles: ['chest'],
    secondary_muscles: [],
    weight_step_kg: 2.5,
    is_custom: false,
    owner_id: null,
    created_at: '2026-08-01T00:00:00.000Z',
    ...over,
  }
}

function view(over: Partial<SessionExerciseView> = {}): SessionExerciseView {
  return {
    programItemId: 'PI1',
    exercise: exercise(),
    kind: 'strength',
    orderIndex: 0,
    targetSets: 3,
    repMin: 8,
    repMax: 12,
    targetRir: 2,
    targetDurationSec: null,
    targetDistanceM: null,
    lastWeightKg: null,
    lastReps: null,
    lastDurationSec: null,
    lastDistanceM: null,
    sets: [],
    ...over,
  }
}

function row(over: Partial<WorkoutSet> = {}): WorkoutSet {
  return {
    id: 'srv-1',
    session_id: 'S1',
    exercise_id: 'E1',
    program_item_id: 'PI1',
    order_index: 0,
    kind: 'strength',
    weight_kg: 82.5,
    reps: 10,
    rir: 2,
    duration_sec: null,
    distance_m: null,
    e1rm: null,
    e1rm_ref: null,
    ri: null,
    score: null,
    client_id: 'c1',
    logged_at: '2026-08-15T10:00:00.000Z',
    ...over,
  }
}

const noop = () => {}

describe('ExerciseBlock — силовое упражнение', () => {
  it('показывает цель подхода', () => {
    expect(targetLine(view())).toBe('3 × 8–12, RIR 2')
  })

  it('предзаполняет вес и повторы памятью программы', () => {
    render(
      <ExerciseBlock
        view={view({ lastWeightKg: 82.5, lastReps: 10 })}
        onLog={noop}
        onUpdateSet={noop}
        onDeleteSet={noop}
      />,
    )

    expect(screen.getByLabelText('Вес в килограммах: 82,5')).toBeInTheDocument()
    expect(screen.getByLabelText('Повторы: 10')).toBeInTheDocument()
  })

  it('отдаёт предзаполненный подход по нажатию «Записать подход»', async () => {
    const user = userEvent.setup()
    const onLog = vi.fn()

    render(
      <ExerciseBlock
        view={view({ lastWeightKg: 60, lastReps: 9, targetRir: 1 })}
        onLog={onLog}
        onUpdateSet={noop}
        onDeleteSet={noop}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Записать подход' }))

    expect(onLog).toHaveBeenCalledTimes(1)
    expect(onLog.mock.calls[0]?.[1]).toEqual({
      kind: 'strength',
      weightKg: 60,
      reps: 9,
      rir: 1,
    })
  })

  it('шаг веса берётся из упражнения', async () => {
    const user = userEvent.setup()
    const onLog = vi.fn()

    render(
      <ExerciseBlock
        view={view({
          lastWeightKg: 60,
          lastReps: 8,
          exercise: exercise({ weight_step_kg: 1.25 }),
        })}
        onLog={onLog}
        onUpdateSet={noop}
        onDeleteSet={noop}
      />,
    )

    await user.click(screen.getAllByRole('button', { name: 'Увеличить' })[0] as HTMLElement)
    await user.click(screen.getByRole('button', { name: 'Записать подход' }))

    expect(onLog.mock.calls[0]?.[1]).toMatchObject({ weightKg: 61.25 })
  })

  it('показывает уже записанные подходы и прогресс', () => {
    render(
      <ExerciseBlock
        view={view({ sets: [row(), row({ client_id: 'c2' })] })}
        onLog={noop}
        onUpdateSet={noop}
        onDeleteSet={noop}
      />,
    )

    expect(screen.getAllByText('82,5 кг × 10 · RIR 2')).toHaveLength(2)
    // Счётчик блока: сделано из запланированного.
    expect(screen.getByText('/3')).toBeInTheDocument()
  })

  it('следующий подход предзаполняется предыдущим подходом сессии', async () => {
    const user = userEvent.setup()
    const onLog = vi.fn()

    render(
      <ExerciseBlock
        view={view({
          lastWeightKg: 50,
          lastReps: 5,
          sets: [row({ weight_kg: 70, reps: 6 })],
        })}
        onLog={onLog}
        onUpdateSet={noop}
        onDeleteSet={noop}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Записать подход' }))
    expect(onLog.mock.calls[0]?.[1]).toMatchObject({ weightKg: 70, reps: 6 })
  })
})

describe('ExerciseBlock — кардио', () => {
  const cardioView = view({
    kind: 'cardio',
    exercise: exercise({ id: 'E2', name_ru: 'Бег', kind: 'cardio' }),
    repMin: null,
    repMax: null,
    targetRir: null,
    targetDurationSec: 600,
  })

  it('просит время и дистанцию, а не вес и повторы', () => {
    render(
      <ExerciseBlock view={cardioView} onLog={noop} onUpdateSet={noop} onDeleteSet={noop} />,
    )

    expect(screen.getByLabelText('Время отрезка: 10:00')).toBeInTheDocument()
    expect(screen.getByLabelText('Дистанция в километрах: —')).toBeInTheDocument()
    expect(screen.queryByLabelText(/Вес в килограммах/)).not.toBeInTheDocument()
    expect(screen.queryByRole('radiogroup', { name: 'Запас повторов' })).not.toBeInTheDocument()
  })

  it('кнопка называется «Записать отрезок»', () => {
    render(
      <ExerciseBlock view={cardioView} onLog={noop} onUpdateSet={noop} onDeleteSet={noop} />,
    )
    expect(screen.getByRole('button', { name: 'Записать отрезок' })).toBeInTheDocument()
  })

  it('помечен как разминка', () => {
    render(
      <ExerciseBlock view={cardioView} onLog={noop} onUpdateSet={noop} onDeleteSet={noop} />,
    )
    expect(screen.getByText('разминка')).toBeInTheDocument()
  })

  it('отдаёт отрезок временем без дистанции', async () => {
    const user = userEvent.setup()
    const onLog = vi.fn()

    render(
      <ExerciseBlock view={cardioView} onLog={onLog} onUpdateSet={noop} onDeleteSet={noop} />,
    )

    await user.click(screen.getByRole('button', { name: 'Записать отрезок' }))
    expect(onLog.mock.calls[0]?.[1]).toEqual({
      kind: 'cardio',
      durationSec: 600,
      distanceM: null,
    })
  })
})

describe('Проверка черновика перед записью', () => {
  it('силовой подход требует вес, повторы и запас', () => {
    expect(isSubmittable({ kind: 'strength', weightKg: 60, reps: 8, rir: 2 })).toBe(true)
    expect(isSubmittable({ kind: 'strength', weightKg: null, reps: 8, rir: 2 })).toBe(false)
    expect(isSubmittable({ kind: 'strength', weightKg: 60, reps: null, rir: 2 })).toBe(false)
    expect(isSubmittable({ kind: 'strength', weightKg: 60, reps: 8, rir: null })).toBe(false)
  })

  it('вес 0 кг — допустимый подход', () => {
    expect(isSubmittable({ kind: 'strength', weightKg: 0, reps: 12, rir: 2 })).toBe(true)
  })

  it('кардио требует хотя бы время или дистанцию', () => {
    expect(isSubmittable({ kind: 'cardio', durationSec: 600, distanceM: null })).toBe(true)
    expect(isSubmittable({ kind: 'cardio', durationSec: null, distanceM: 1800 })).toBe(true)
    expect(isSubmittable({ kind: 'cardio', durationSec: null, distanceM: null })).toBe(false)
    expect(isSubmittable({ kind: 'cardio', durationSec: 0, distanceM: 0 })).toBe(false)
  })

  it('нули кардио превращаются в null — этого требует sets_shape_ck', () => {
    expect(normalize({ kind: 'cardio', durationSec: 600, distanceM: 0 })).toEqual({
      kind: 'cardio',
      durationSec: 600,
      distanceM: null,
    })
  })

  it('незаполненный черновик не нормализуется', () => {
    expect(normalize({ kind: 'cardio', durationSec: null, distanceM: null })).toBeNull()
  })
})

describe('SetRow', () => {
  it('силовой подход читается как «82,5 кг × 10 · RIR 2»', () => {
    render(
      <SetRow set={row()} index={1} weightStepKg={2.5} onSave={noop} onDelete={noop} />,
    )
    expect(screen.getByText('82,5 кг × 10 · RIR 2')).toBeInTheDocument()
  })

  it('кардио читается как «10:00 · 1,8 км»', () => {
    render(
      <SetRow
        set={row({
          kind: 'cardio',
          weight_kg: null,
          reps: null,
          rir: null,
          duration_sec: 600,
          distance_m: 1800,
        })}
        index={1}
        weightStepKg={2.5}
        onSave={noop}
        onDelete={noop}
      />,
    )
    expect(screen.getByText('10:00 · 1,8 км')).toBeInTheDocument()
  })

  it('неотправленный подход помечен точкой, а не ошибкой', () => {
    render(
      <SetRow
        set={{ ...row(), pending: true }}
        index={1}
        weightStepKg={2.5}
        onSave={noop}
        onDelete={noop}
      />,
    )
    expect(screen.getByLabelText('Ещё не отправлено')).toBeInTheDocument()
  })

  it('удаление подтверждается на месте, без модального окна', async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn()

    render(
      <SetRow set={row()} index={1} weightStepKg={2.5} onSave={noop} onDelete={onDelete} />,
    )

    await user.click(screen.getByRole('button', { name: 'Удалить подход 1' }))
    expect(screen.getByText('Удалить подход 1?')).toBeInTheDocument()
    expect(onDelete).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Удалить' }))
    expect(onDelete).toHaveBeenCalledTimes(1)
  })

  it('правка идёт инлайн и отдаёт только изменённые поля', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()

    render(
      <SetRow set={row()} index={1} weightStepKg={2.5} onSave={onSave} onDelete={noop} />,
    )

    await user.click(screen.getByRole('button', { name: /Подход 1/ }))
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(onSave).toHaveBeenCalledWith({ weightKg: 82.5, reps: 10, rir: 2 })
  })
})
