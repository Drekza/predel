import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import type { Exercise, ProgramItemWithExercise } from '@/types/domain'

import { ProgramItemRow } from '../ProgramItemRow'

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

function item(over: Partial<ProgramItemWithExercise> = {}): ProgramItemWithExercise {
  return {
    id: 'PI1',
    program_day_id: 'D1',
    exercise_id: 'E1',
    order_index: 0,
    target_sets: 3,
    rep_min: 8,
    rep_max: 12,
    target_rir: 2,
    target_duration_sec: null,
    target_distance_m: null,
    last_weight_kg: null,
    last_reps: null,
    last_duration_sec: null,
    last_distance_m: null,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    exercise: exercise(),
    ...over,
  }
}

function renderRow(over: Partial<ProgramItemWithExercise> = {}) {
  const onPatch = vi.fn()
  const utils = render(
    <ul>
      <ProgramItemRow
        item={item(over)}
        index={0}
        canMoveUp={false}
        canMoveDown={false}
        onMove={vi.fn()}
        onDelete={vi.fn()}
        onPatch={onPatch}
      />
    </ul>,
  )
  return { onPatch, ...utils }
}

const setsGroup = () => screen.getByRole('group', { name: 'целевые подходы' })

describe('ProgramItemRow', () => {
  it('правка уходит на сервер только по кнопке', async () => {
    const user = userEvent.setup()
    const { onPatch } = renderRow()

    await user.click(stepKey(setsGroup(), 'Уменьшить'))
    expect(onPatch).not.toHaveBeenCalled()
    expect(setsGroup()).toHaveTextContent('2')

    await user.click(screen.getByRole('button', { name: /Сохранить/ }))
    expect(onPatch).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ target_sets: 2, rep_min: 8, rep_max: 12, target_rir: 2 }),
    )
  })

  it('отмена возвращает серверные цели и убирает полосу', async () => {
    const user = userEvent.setup()
    const { onPatch } = renderRow()

    await user.click(stepKey(setsGroup(), 'Увеличить'))
    expect(setsGroup()).toHaveTextContent('4')

    await user.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(setsGroup()).toHaveTextContent('3')
    expect(screen.queryByRole('button', { name: /Сохранить/ })).not.toBeInTheDocument()
    expect(onPatch).not.toHaveBeenCalled()
  })

  it('пока правок нет, полосы сохранения нет', () => {
    renderRow()
    expect(screen.queryByRole('button', { name: /Сохранить/ })).not.toBeInTheDocument()
  })
})

/** Клавиша ± внутри конкретной группы: их на строке несколько с одинаковой меткой. */
function stepKey(group: HTMLElement, label: string): HTMLElement {
  const button = Array.from(group.querySelectorAll('button')).find(
    (candidate) => candidate.getAttribute('aria-label') === label,
  )
  if (!button) throw new Error(`клавиша «${label}» не найдена`)
  return button
}
