import type { ReactNode } from 'react'
import { Timer } from 'lucide-react'

import { cn } from '@/lib/cn'
import { equipmentLabelRu } from '@/lib/constants'
import type { Exercise } from '@/types/domain'
import { musclesLabel } from './muscleFilters'

type ExerciseCardProps = {
  exercise: Exercise
  /** Если передан — строка становится кнопкой выбора. */
  onSelect?: (exercise: Exercise) => void
  disabled?: boolean
  selected?: boolean
  /** Правый слот: счётчик подходов, кнопка удаления и т.п. */
  trailing?: ReactNode
  className?: string
}

/** Метка на строке: тот же узкий капс, что на корпусе, только мельче. */
const TAG = 'font-stencil text-[0.625rem] font-medium tracking-mark uppercase'

/**
 * Строка упражнения: русское название крупно, снаряд и целевые мышцы мелко,
 * справа метки «своё» и «кардио». Высота строки — тач-цель не меньше 44 px.
 */
export function ExerciseCard({
  exercise,
  onSelect,
  disabled = false,
  selected = false,
  trailing,
  className,
}: ExerciseCardProps) {
  const isCardio = exercise.kind === 'cardio'
  const muscles = musclesLabel(exercise)
  const meta = [equipmentLabelRu(exercise.equipment), muscles].filter(Boolean).join(' · ')

  const body = (
    <>
      <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left">
        <span className="w-full truncate text-sm text-ink">{exercise.name_ru}</span>
        {meta ? (
          <span className="w-full truncate font-stencil text-[0.6875rem] leading-tight text-ink-muted">
            {meta}
          </span>
        ) : null}
      </span>

      <span className="flex shrink-0 items-center gap-1.5">
        {exercise.is_custom ? (
          <span className={cn(TAG, 'rounded-xs border border-edge px-1.5 py-0.5 text-ink-muted')}>
            своё
          </span>
        ) : null}
        {isCardio ? (
          <span
            className={cn(
              TAG,
              'flex items-center gap-1 rounded-xs border border-ok/50 px-1.5 py-0.5 text-ok',
            )}
          >
            <Timer size={12} aria-hidden />
            кардио
          </span>
        ) : null}
        {trailing}
      </span>
    </>
  )

  const shell = cn(
    'flex w-full items-center gap-3 rounded-sm border px-3 py-2.5',
    'min-h-[3.25rem] text-left',
    selected ? 'border-ink-muted/45 bg-panel-2' : 'border-edge bg-panel',
    className,
  )

  if (!onSelect) {
    return <div className={shell}>{body}</div>
  }

  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={selected || undefined}
      onClick={() => onSelect(exercise)}
      className={cn(
        shell,
        'tap transition-colors duration-100 ease-station',
        'hover:border-ink-muted/40 hover:bg-panel-2 active:bg-panel-2/70',
        'disabled:cursor-not-allowed disabled:opacity-50',
      )}
    >
      {body}
    </button>
  )
}
