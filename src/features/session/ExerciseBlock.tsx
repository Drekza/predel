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
  if (
    state.signature !== signature ||
    (!state.dirty && state.historyMark !== historyMark)
  ) {
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
        'flex flex-col gap-2.5 rounded-lg border bg-surface px-3 pt-3 pb-3 shadow-hud',
        // Кардио — разминка, а не основная работа: рамка тише, заголовок глуше.
        isCardio ? 'border-line/50' : 'hud-brackets border-line',
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2
            className={cn(
              'truncate text-[0.9375rem] leading-tight font-semibold',
              isCardio ? 'text-muted' : 'text-text',
            )}
          >
            {view.exercise.name_ru}
          </h2>
          <p className="mt-1 font-mono text-hud tracking-normal uppercase text-muted">
            {targetLine(view)}
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          {isCardio ? (
            <span className="rounded-xs border border-line px-1.5 py-0.5 font-mono text-[0.5625rem] tracking-label uppercase text-muted">
              разминка
            </span>
          ) : null}
          <span className="font-mono text-sm font-semibold text-text tabular-nums">
            {doneSets}
            <span className="text-muted">/{view.targetSets}</span>
          </span>
          {!isCardio && volumeKg > 0 ? (
            <span className="font-mono text-hud text-muted tabular-nums">
              {formatVolume(volumeKg)}
            </span>
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

