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
        <span className="w-full truncate text-sm text-text">{exercise.name_ru}</span>
        {meta ? (
          <span className="w-full truncate font-mono text-[0.6875rem] leading-tight text-muted">
            {meta}
          </span>
        ) : null}
      </span>

      <span className="flex shrink-0 items-center gap-1.5">
        {exercise.is_custom ? (
          <span className="rounded-xs border border-accent-2/50 px-1.5 py-0.5 font-mono text-[0.625rem] uppercase tracking-label text-accent-2">
            своё
          </span>
        ) : null}
        {isCardio ? (
          <span className="flex items-center gap-1 rounded-xs border border-ok/50 px-1.5 py-0.5 font-mono text-[0.625rem] uppercase tracking-label text-ok">
            <Timer size={12} aria-hidden />
            кардио
          </span>
        ) : null}
        {trailing}
      </span>
    </>
  )

  const shell = cn(
    'flex w-full items-center gap-3 rounded-md border px-3 py-2.5',
    'min-h-[3.25rem] text-left',
    selected ? 'border-accent/60 bg-surface-2' : 'border-line bg-surface',
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
        'tap transition-colors duration-100 ease-hud',
        'hover:border-accent/50 hover:bg-surface-2 active:bg-surface-2/70',
        'disabled:cursor-not-allowed disabled:opacity-50',
      )}
    >
      {body}
    </button>
  )
}
