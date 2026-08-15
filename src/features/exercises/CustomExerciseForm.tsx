import { useState, type FormEvent } from 'react'

import { Button, Field, Input, NumberStepper, Segmented } from '@/components/ui'
import { cn } from '@/lib/cn'
import { DEFAULT_WEIGHT_STEP_KG } from '@/lib/constants'
import type { Exercise, ExerciseKind } from '@/types/domain'
import {
  exerciseErrorMessage,
  useCreateCustomExercise,
  validateCustomExercise,
  type CustomExerciseErrors,
  type CustomExerciseInput,
} from './api'
import { EQUIPMENT_FILTERS, MUSCLE_GROUPS } from './muscleFilters'

type CustomExerciseFormProps = {
  /** Чем заполнить название — обычно текущий запрос из поиска. */
  initialName?: string
  onCreated: (exercise: Exercise) => void
  onCancel?: () => void
  className?: string
}

const KIND_OPTIONS: readonly { value: ExerciseKind; label: string }[] = [
  { value: 'strength', label: 'силовое' },
  { value: 'cardio', label: 'кардио' },
]

const chipBase = cn(
  'tap inline-flex h-11 items-center rounded-md border px-3',
  'font-mono text-[0.6875rem] uppercase tracking-label',
  'transition-colors duration-100 ease-hud',
)

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value]
}

/**
 * Создание своего упражнения.
 * У кардио нет ни шага веса, ни обязательных мышц: очков оно не даёт и в статы не идёт.
 */
export function CustomExerciseForm({
  initialName = '',
  onCreated,
  onCancel,
  className,
}: CustomExerciseFormProps) {
  const [nameRu, setNameRu] = useState(initialName)
  const [kind, setKind] = useState<ExerciseKind>('strength')
  const [equipment, setEquipment] = useState<string | null>(null)
  const [primaryMuscles, setPrimaryMuscles] = useState<string[]>([])
  const [secondaryMuscles, setSecondaryMuscles] = useState<string[]>([])
  const [weightStepKg, setWeightStepKg] = useState<number | null>(DEFAULT_WEIGHT_STEP_KG)
  const [showSecondary, setShowSecondary] = useState(false)
  const [errors, setErrors] = useState<CustomExerciseErrors>({})
  const [submitError, setSubmitError] = useState<string | null>(null)

  const create = useCreateCustomExercise()
  const isCardio = kind === 'cardio'

  const buildInput = (): CustomExerciseInput => ({
    nameRu,
    kind,
    equipment,
    primaryMuscles,
    secondaryMuscles,
    weightStepKg,
  })

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const input = buildInput()
    const nextErrors = validateCustomExercise(input)
    setErrors(nextErrors)
    setSubmitError(null)
    if (Object.keys(nextErrors).length > 0) return

    try {
      const created = await create.mutateAsync(input)
      onCreated(created)
    } catch (error) {
      setSubmitError(exerciseErrorMessage(error))
    }
  }

  const renderMuscleChips = (role: 'primary' | 'secondary') => {
    const selected = role === 'primary' ? primaryMuscles : secondaryMuscles
    const setSelected = role === 'primary' ? setPrimaryMuscles : setSecondaryMuscles
    const roleLabel = role === 'primary' ? 'основная' : 'дополнительная'

    return (
      <div className="flex flex-col gap-2.5">
        {MUSCLE_GROUPS.map((group) => (
          <div key={group.stat} className="flex flex-col gap-1.5">
            <span className="font-mono text-[0.625rem] uppercase tracking-label text-muted/80">
              {group.label}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {group.muscles.map((muscle) => {
                const checked = selected.includes(muscle.value)
                return (
                  <label
                    key={muscle.value}
                    className={cn(
                      chipBase,
                      'cursor-pointer',
                      checked
                        ? 'border-accent/70 bg-surface-2 text-accent'
                        : 'border-line bg-surface text-muted hover:text-text',
                    )}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      aria-label={`${muscle.label} — ${roleLabel}`}
                      checked={checked}
                      onChange={() => setSelected((prev) => toggle(prev, muscle.value))}
                    />
                    {muscle.label}
                  </label>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className={cn('flex flex-col gap-4', className)} noValidate>
      <Field label="Название" error={errors.nameRu}>
        <Input
          value={nameRu}
          onChange={(event) => setNameRu(event.target.value)}
          placeholder="Например, тяга нижнего блока"
          invalid={Boolean(errors.nameRu)}
          aria-label="Название упражнения"
          autoComplete="off"
        />
      </Field>

      <Field label="Тип" hint={isCardio ? 'Кардио логируется временем и дистанцией' : undefined}>
        <Segmented
          options={KIND_OPTIONS}
          value={kind}
          onChange={setKind}
          aria-label="Тип упражнения"
        />
      </Field>

      <Field label="Снаряд">
        <div role="radiogroup" aria-label="Снаряд" className="flex flex-wrap gap-1.5">
          {EQUIPMENT_FILTERS.map((option) => {
            const checked = equipment === option.value
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={checked}
                onClick={() => setEquipment(checked ? null : option.value)}
                className={cn(
                  chipBase,
                  checked
                    ? 'border-accent/70 bg-surface-2 text-accent'
                    : 'border-line bg-surface text-muted hover:text-text',
                )}
              >
                {option.label}
              </button>
            )
          })}
        </div>
      </Field>

      {isCardio ? null : (
        <Field
          label="Шаг веса"
          hint="2,5 кг — база низа, 1,25 кг — верх и изоляция, 2 кг — стек тренажёра"
          error={errors.weightStepKg}
        >
          <NumberStepper
            value={weightStepKg}
            onChange={setWeightStepKg}
            step={1.25}
            min={0.25}
            max={25}
            precision={2}
            unit="кг"
            aria-label="Шаг веса"
          />
        </Field>
      )}

      <Field
        label={isCardio ? 'Мышцы (необязательно)' : 'Основные мышцы'}
        error={errors.primaryMuscles}
      >
        {renderMuscleChips('primary')}
      </Field>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setShowSecondary((prev) => !prev)}
          aria-expanded={showSecondary}
          className="tap self-start font-mono text-hud uppercase text-accent"
        >
          {showSecondary ? 'Скрыть дополнительные мышцы' : 'Дополнительные мышцы'}
        </button>
        {showSecondary ? renderMuscleChips('secondary') : null}
      </div>

      {submitError ? <p className="text-sm text-danger">{submitError}</p> : null}

      <div className="flex gap-2 pt-1">
        {onCancel ? (
          <Button variant="outline" onClick={onCancel}>
            Отмена
          </Button>
        ) : null}
        <Button type="submit" loading={create.isPending} fullWidth>
          Создать
        </Button>
      </div>
    </form>
  )
}
