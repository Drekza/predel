import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import type { Exercise } from '@/types/domain'
import { CustomExerciseForm } from '../CustomExerciseForm'
import { validateCustomExercise } from '../api'
import type * as ExercisesApi from '../api'

const created: Exercise = {
  id: 'new-1',
  slug: 'custom-tyaga-abc123',
  name_ru: 'Тяга нижнего блока',
  name_en: null,
  kind: 'strength',
  equipment: 'cable',
  category: null,
  mechanic: null,
  force: null,
  level: null,
  primary_muscles: ['lats'],
  secondary_muscles: [],
  weight_step_kg: 2.5,
  is_custom: true,
  owner_id: 'profile-1',
  created_at: '2026-08-15T10:00:00Z',
}

// Мутацию подменяем, валидацию оставляем настоящую — её и проверяем.
const mocks = vi.hoisted(() => ({ mutateAsync: vi.fn() }))

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof ExercisesApi>()
  return {
    ...actual,
    useCreateCustomExercise: () => ({ mutateAsync: mocks.mutateAsync, isPending: false }),
  }
})

beforeEach(() => {
  mocks.mutateAsync.mockReset()
  mocks.mutateAsync.mockResolvedValue(created)
})

describe('validateCustomExercise', () => {
  it('требует название и основную мышцу у силового', () => {
    const errors = validateCustomExercise({
      nameRu: ' ',
      kind: 'strength',
      equipment: null,
      primaryMuscles: [],
      secondaryMuscles: [],
      weightStepKg: 2.5,
    })
    expect(errors.nameRu).toBe('Введите название')
    expect(errors.primaryMuscles).toBe('Отметьте хотя бы одну основную мышцу')
  })

  it('у кардио не требует ни мышц, ни шага веса', () => {
    const errors = validateCustomExercise({
      nameRu: 'Бег',
      kind: 'cardio',
      equipment: null,
      primaryMuscles: [],
      secondaryMuscles: [],
      weightStepKg: null,
    })
    expect(errors).toEqual({})
  })
})

describe('CustomExerciseForm', () => {
  it('не отправляет форму с ошибками и показывает их по-русски', async () => {
    const user = userEvent.setup()
    render(<CustomExerciseForm onCreated={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Создать' }))

    expect(screen.getByText('Введите название')).toBeInTheDocument()
    expect(screen.getByText('Отметьте хотя бы одну основную мышцу')).toBeInTheDocument()
    expect(mocks.mutateAsync).not.toHaveBeenCalled()
  })

  it('у кардио прячет шаг веса', async () => {
    const user = userEvent.setup()
    render(<CustomExerciseForm onCreated={vi.fn()} />)

    expect(screen.getByRole('button', { name: /Шаг веса/ })).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: 'кардио' }))

    expect(screen.queryByRole('button', { name: /Шаг веса/ })).not.toBeInTheDocument()
  })

  it('создаёт своё упражнение с отмеченными мышцами и снарядом', async () => {
    const user = userEvent.setup()
    const onCreated = vi.fn()
    render(<CustomExerciseForm onCreated={onCreated} />)

    await user.type(screen.getByLabelText('Название упражнения'), 'Тяга нижнего блока')
    await user.click(screen.getByRole('checkbox', { name: 'широчайшие — основная' }))
    await user.click(screen.getByRole('radio', { name: 'блок' }))
    await user.click(screen.getByRole('button', { name: 'Создать' }))

    expect(mocks.mutateAsync).toHaveBeenCalledTimes(1)
    expect(mocks.mutateAsync.mock.calls[0]?.[0]).toEqual({
      nameRu: 'Тяга нижнего блока',
      kind: 'strength',
      equipment: 'cable',
      primaryMuscles: ['lats'],
      secondaryMuscles: [],
      weightStepKg: 2.5,
    })
    expect(onCreated).toHaveBeenCalledWith(created)
  })
})
