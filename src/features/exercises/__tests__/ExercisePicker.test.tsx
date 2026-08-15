import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import type { Exercise } from '@/types/domain'
import { ExercisePicker } from '../ExercisePicker'

// Каталог и мок хука поднимаем через vi.hoisted: vi.mock исполняется раньше модуля.
const fixtures = vi.hoisted(() => {
  function make(patch: Partial<Exercise> & { id: string; name_ru: string }): Exercise {
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
    } as Exercise
  }

  const filler: Exercise[] = Array.from({ length: 70 }, (_, index) =>
    make({
      id: `filler-${index}`,
      name_ru: `Тренажёр ${String(index + 1).padStart(2, '0')}`,
      name_en: `Machine ${index + 1}`,
      equipment: 'machine',
      primary_muscles: ['quadriceps'],
    }),
  )

  const catalog: Exercise[] = [
    ...filler,
    make({
      id: 'bench',
      name_ru: 'Жим лёжа',
      name_en: 'Barbell Bench Press',
      primary_muscles: ['chest'],
      secondary_muscles: ['triceps'],
    }),
    make({
      id: 'plank',
      name_ru: 'Планка',
      equipment: 'body only',
      primary_muscles: ['abdominals'],
      is_custom: true,
      owner_id: 'profile-1',
    }),
    make({
      id: 'treadmill',
      name_ru: 'Бег на дорожке',
      name_en: 'Treadmill Running',
      kind: 'cardio',
      equipment: 'machine',
      category: 'cardio',
      primary_muscles: ['quadriceps'],
    }),
  ]

  return { catalog }
})

vi.mock('../api', async () => {
  const { filterExercises } = await import('../muscleFilters')
  return {
    useExercises: (filters: Parameters<typeof filterExercises>[1]) => ({
      exercises: filterExercises(fixtures.catalog, filters),
      all: fixtures.catalog,
      total: fixtures.catalog.length,
      isLoading: false,
      isFetching: false,
      isError: false,
      errorMessage: null,
      refetch: vi.fn(),
    }),
    useCreateCustomExercise: () => ({ mutateAsync: vi.fn(), isPending: false }),
    validateCustomExercise: () => ({}),
    exerciseErrorMessage: () => 'Не удалось сохранить упражнение',
  }
})

function renderPicker(props: Partial<Parameters<typeof ExercisePicker>[0]> = {}) {
  const onPick = vi.fn()
  const onClose = vi.fn()
  render(<ExercisePicker open onClose={onClose} onPick={onPick} {...props} />)
  return { onPick, onClose }
}

describe('ExercisePicker', () => {
  it('ограничивает список 60 строками и показывает счётчик «ещё N»', () => {
    renderPicker()

    // 72 силовых упражнения: 60 в списке, остальные счётчиком
    const items = screen.getAllByRole('listitem')
    expect(items.length).toBe(60 + 1) // 60 силовых + одна карточка кардио в своей секции
    expect(screen.getByText(/ещё 12 упражнений/)).toBeInTheDocument()
  })

  it('не мешает кардио с силовыми: оно живёт отдельной секцией', () => {
    renderPicker()

    const cardioSection = screen.getByRole('heading', { name: 'Кардио' }).closest('section')
    expect(cardioSection).not.toBeNull()
    expect(within(cardioSection as HTMLElement).getByText('Бег на дорожке')).toBeInTheDocument()
  })

  it('фильтр «Кардио» оставляет только кардио', async () => {
    const user = userEvent.setup()
    renderPicker()

    await user.click(screen.getByRole('button', { name: 'Кардио' }))

    expect(screen.getByText('Бег на дорожке')).toBeInTheDocument()
    expect(screen.queryByText('Жим лёжа')).not.toBeInTheDocument()
  })

  it('ищет с дебаунсом, не различая регистр и «е/ё»', async () => {
    const user = userEvent.setup()
    renderPicker()

    await user.type(screen.getByLabelText('Поиск упражнения'), 'ЖИМ ЛЕЖА')

    // Список пересобирается не мгновенно — после дебаунса
    await waitFor(() => {
      expect(screen.queryByText('Планка')).not.toBeInTheDocument()
    })
    expect(screen.getByText('Жим лёжа')).toBeInTheDocument()
  })

  it('помечает свои упражнения и кардио', () => {
    renderPicker()
    expect(screen.getByText('своё')).toBeInTheDocument()
    expect(screen.getByText('кардио')).toBeInTheDocument()
  })

  it('отдаёт выбранное упражнение и закрывает шторку', async () => {
    const user = userEvent.setup()
    const { onPick, onClose } = renderPicker()

    await user.click(screen.getByRole('button', { name: /Планка/ }))

    expect(onPick).toHaveBeenCalledTimes(1)
    expect(onPick.mock.calls[0]?.[0]).toMatchObject({ id: 'plank' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('не показывает уже добавленные упражнения', () => {
    renderPicker({ excludeIds: ['plank'] })
    expect(screen.queryByText('Планка')).not.toBeInTheDocument()
  })

  it('фокусирует поиск на десктопе', async () => {
    renderPicker()
    await waitFor(() => {
      expect(screen.getByLabelText('Поиск упражнения')).toHaveFocus()
    })
  })

  it('не фокусирует поиск на тач-устройстве, чтобы не выпрыгнула клавиатура', () => {
    const matchMedia = vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          matches: query.includes('coarse'),
          media: query,
          onchange: null,
          addListener: () => {},
          removeListener: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => false,
        }) as unknown as MediaQueryList,
    )

    renderPicker()
    expect(screen.getByLabelText('Поиск упражнения')).not.toHaveFocus()
    matchMedia.mockRestore()
  })

  it('открывает форму своего упражнения без вложенного модала', async () => {
    const user = userEvent.setup()
    renderPicker()

    await user.click(screen.getByRole('button', { name: /Создать своё упражнение/ }))

    expect(screen.getByLabelText('Название упражнения')).toBeInTheDocument()
    expect(screen.queryByLabelText('Поиск упражнения')).not.toBeInTheDocument()
  })
})
