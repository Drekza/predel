import { useState } from 'react'

import { cn } from '@/lib/cn'
import { formatVolume } from '@/lib/format'
import { DEFAULT_WEIGHT_STEP_KG } from '@/lib/constants'
import type { SetPatch } from '@/lib/offline/types'
import type { PendingWorkoutSet, SessionExerciseView, SetDraft, SetDraftFilled } from '@/types/domain'

import { SetInputBar } from './SetInputBar'
import { SetRow } from './SetRow'
import { draftForExercise, setVolumeKg, targetLine, type SetLike } from './prefill'

type ExerciseBlockProps = {
  view: SessionExerciseView
  /** Последний подход этого упражнения из истории — третий эшелон предзаполнения. */
  historySet?: SetLike | null
  onLog: (view: SessionExerciseView, draft: SetDraftFilled) => void
  onUpdateSet: (set: PendingWorkoutSet, patch: SetPatch) => void
  onDeleteSet: (set: PendingWorkoutSet) => void
  disabled?: boolean
}

/**
 * Блок одного упражнения дня: цель, уже записанные подходы, строка ввода.
 * Все блоки видны сразу — никакого пошагового визарда (спека 9.2, пункт 1).
 */
export function ExerciseBlock({
  view,
  historySet,
  onLog,
  onUpdateSet,
  onDeleteSet,
  disabled = false,
}: ExerciseBlockProps) {
  const isCardio = view.kind === 'cardio'

  // Черновик пересобирается, когда меняется число подходов: следующий подход
  // предзаполняется предыдущим. Пока пользователь крутит степперы — не трогаем:
  // запрос истории приходит позже готового экрана, и без флага «трогали»
  // он затирал бы уже набранные вес и повторы.
  const signature = `${view.sets.length}`
  const historyMark = historySet ? 'h' : '-'
  const [state, setState] = useState(() => ({
    signature,
    historyMark,
    dirty: false,
    draft: draftForExercise(view, historySet),
  }))
  if (state.signature !== signature || (!state.dirty && state.historyMark !== historyMark)) {
    setState({
      signature,
      historyMark,
      dirty: false,
      draft: draftForExercise(view, historySet),
    })
  }

  const setDraft = (draft: SetDraft) => setState((prev) => ({ ...prev, draft, dirty: true }))

  const doneSets = view.sets.length
  const volumeKg = view.sets.reduce((sum, set) => sum + setVolumeKg(set), 0)

  return (
    <section
      className={cn(
        'flex flex-col gap-2.5 rounded-lg px-3 pt-3 pb-3',
        // Кардио — разминка, а не основная работа: корпус тише, заголовок глуше.
        isCardio ? 'border border-edge/60 bg-panel/60' : 'bezel bg-panel',
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2
            className={cn(
              'truncate text-[0.9375rem] leading-tight font-semibold',
              isCardio ? 'text-ink-muted' : 'text-ink',
            )}
          >
            {view.exercise.name_ru}
          </h2>
          <p className="mark mt-1.5 text-ink-muted">{targetLine(view)}</p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {/* Счётчик поверенных подходов стоит на пластине — как отпечатанный. */}
          <span className="plate num rounded-xs px-2 py-0.5 text-sm leading-tight">
            {doneSets}
            <span className="text-plate-muted">/{view.targetSets}</span>
          </span>
          {isCardio ? <span className="mark text-ink-muted">разминка</span> : null}
          {!isCardio && volumeKg > 0 ? (
            <span className="num text-xs text-ink-muted">{formatVolume(volumeKg)}</span>
          ) : null}
        </div>
      </header>

      {view.sets.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {view.sets.map((set, index) => (
            <li key={set.client_id}>
              <SetRow
                set={set}
                index={index + 1}
                targetRir={view.targetRir}
                weightStepKg={view.exercise.weight_step_kg || DEFAULT_WEIGHT_STEP_KG}
                onSave={(patch) => onUpdateSet(set, patch)}
                onDelete={() => onDeleteSet(set)}
              />
            </li>
          ))}
        </ul>
      ) : null}

      <SetInputBar
        draft={state.draft}
        onChange={setDraft}
        onSubmit={(draft) => onLog(view, draft)}
        weightStepKg={view.exercise.weight_step_kg || DEFAULT_WEIGHT_STEP_KG}
        targetRir={view.targetRir}
        disabled={disabled}
      />
    </section>
  )
}
