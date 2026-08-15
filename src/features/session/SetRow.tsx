import { useRef, useState, type ReactNode } from 'react'
import { Check, Pencil, Trash2, X } from 'lucide-react'

import { cn } from '@/lib/cn'
import { formatCardio, formatStrengthSet } from '@/lib/format'
import {
  CARDIO_DISTANCE_MAX_M,
  CARDIO_DURATION_MAX_SEC,
  REPS_MAX,
  REPS_MIN,
  WEIGHT_MAX_KG,
  WEIGHT_MIN_KG,
} from '@/lib/constants'
import type { SetPatch } from '@/lib/offline/types'
import type { PendingWorkoutSet } from '@/types/domain'
import { Button, DurationStepper, NumberStepper, RirStepper } from '@/components/ui'

type SetRowProps = {
  set: PendingWorkoutSet
  /** Номер подхода внутри упражнения, с единицы. */
  index: number
  targetRir?: number | null
  weightStepKg: number
  onSave: (patch: SetPatch) => void
  onDelete: () => void
}

type Mode = 'view' | 'edit' | 'confirm-delete'

/** Порог свайпа влево, после которого показываем подтверждение удаления. */
const SWIPE_THRESHOLD_PX = 56
const SWIPE_MAX_PX = 84

/**
 * Одна записанная строка подхода.
 * Тап по значению — правка на месте, свайп влево или корзина — удаление
 * с инлайн-подтверждением. Модальных окон в тренировке нет.
 */
export function SetRow({ set, index, targetRir, weightStepKg, onSave, onDelete }: SetRowProps) {
  const [mode, setMode] = useState<Mode>('view')
  const [offset, setOffset] = useState(0)
  const swipeStart = useRef<number | null>(null)

  const isCardio = set.kind === 'cardio'

  if (mode === 'edit') {
    return (
      <SetEditor
        set={set}
        index={index}
        targetRir={targetRir}
        weightStepKg={weightStepKg}
        onCancel={() => setMode('view')}
        onSave={(patch) => {
          onSave(patch)
          setMode('view')
        }}
      />
    )
  }

  if (mode === 'confirm-delete') {
    return (
      <div className="bezel flex items-center gap-2 rounded-sm bg-panel-2 px-3 py-2">
        <span className="flex-1 text-sm text-ink">Удалить подход {index}?</span>
        <Button size="sm" variant="ghost" onClick={() => setMode('view')}>
          Отмена
        </Button>
        <Button size="sm" variant="danger" onClick={onDelete}>
          Удалить
        </Button>
      </div>
    )
  }

  const label = isCardio
    ? formatCardio(set.duration_sec, set.distance_m)
    : formatStrengthSet(set.weight_kg, set.reps, set.rir)

  return (
    <div
      className="relative overflow-hidden rounded-sm"
      onPointerDown={(event) => {
        // Мышью не свайпают — там есть корзина.
        if (event.pointerType === 'mouse') return
        swipeStart.current = event.clientX
      }}
      onPointerMove={(event) => {
        if (swipeStart.current === null) return
        const dx = event.clientX - swipeStart.current
        setOffset(Math.max(-SWIPE_MAX_PX, Math.min(0, dx)))
      }}
      onPointerUp={() => {
        if (offset <= -SWIPE_THRESHOLD_PX) setMode('confirm-delete')
        swipeStart.current = null
        setOffset(0)
      }}
      onPointerCancel={() => {
        swipeStart.current = null
        setOffset(0)
      }}
    >
      {/* Подложка проступает при свайпе — намёк, что жест ведёт к удалению. */}
      <span
        aria-hidden
        className="absolute inset-y-0 right-0 grid w-20 place-items-center text-stamp"
      >
        <Trash2 size={16} aria-hidden />
      </span>

      <div
        className="recess relative flex items-center gap-2.5 rounded-sm py-1 pr-1 pl-1.5"
        style={offset === 0 ? undefined : { transform: `translateX(${offset}px)` }}
      >
        {/* Клеймо подхода: оттиск ставится в момент записи и больше не двигается. */}
        <span
          aria-hidden
          className="stamped animate-stamp num grid size-7 shrink-0 place-items-center rounded-xs text-xs font-semibold"
        >
          {index}
        </span>

        <button
          type="button"
          onClick={() => setMode('edit')}
          aria-label={`Подход ${index}: ${label}. Изменить`}
          className="tap flex min-w-0 flex-1 items-center gap-2 py-2 text-left"
        >
          <span className={cn('num truncate text-sm', isCardio ? 'text-ink-muted' : 'text-ink')}>
            {label}
          </span>
          {set.failed ? (
            <span
              // Сервер отказал: подход виден, но за настоящий его выдавать нельзя.
              title="Сервер не принял"
              aria-label="Сервер не принял"
              className="size-1.5 shrink-0 bg-warn"
            />
          ) : set.pending ? (
            <span
              // Не ошибка, а состояние: подход записан, сеть догоняет.
              title="Ещё не отправлено"
              aria-label="Ещё не отправлено"
              className="size-1.5 shrink-0 bg-ink-muted"
            />
          ) : null}
          <Pencil size={13} aria-hidden className="ml-auto shrink-0 text-ink-muted/60" />
        </button>

        <button
          type="button"
          onClick={() => setMode('confirm-delete')}
          aria-label={`Удалить подход ${index}`}
          className="tap grid size-11 shrink-0 place-items-center rounded-sm text-ink-muted transition-colors duration-100 ease-station hover:text-stamp"
        >
          <Trash2 size={15} aria-hidden />
        </button>
      </div>
    </div>
  )
}

// --- Правка на месте -------------------------------------------------------

type SetEditorProps = {
  set: PendingWorkoutSet
  index: number
  targetRir?: number | null
  weightStepKg: number
  onCancel: () => void
  onSave: (patch: SetPatch) => void
}

function SetEditor({ set, index, targetRir, weightStepKg, onCancel, onSave }: SetEditorProps) {
  const isCardio = set.kind === 'cardio'

  const [weightKg, setWeightKg] = useState<number | null>(set.weight_kg)
  const [reps, setReps] = useState<number | null>(set.reps)
  const [rir, setRir] = useState<number | null>(set.rir)
  const [durationSec, setDurationSec] = useState<number | null>(set.duration_sec)
  const [distanceM, setDistanceM] = useState<number | null>(set.distance_m)

  const valid = isCardio
    ? (durationSec !== null && durationSec > 0) || (distanceM !== null && distanceM > 0)
    : weightKg !== null && reps !== null && reps >= REPS_MIN && rir !== null

  const submit = () => {
    if (!valid) return
    onSave(
      isCardio
        ? {
            // Потолки те же, что в DDL: иначе правка упадёт на сервере (22003).
            durationSec:
              durationSec !== null && durationSec > 0
                ? Math.min(durationSec, CARDIO_DURATION_MAX_SEC)
                : null,
            distanceM:
              distanceM !== null && distanceM > 0
                ? Math.min(distanceM, CARDIO_DISTANCE_MAX_M)
                : null,
          }
        : { weightKg, reps, rir },
    )
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-sm border border-stamp/60 bg-panel-2 px-3 py-3">
      <span className="mark text-stamp-lit">подход {index}</span>

      {isCardio ? (
        <>
          <Labelled label="время">
            <DurationStepper
              valueSec={durationSec}
              onChange={setDurationSec}
              stepSec={30}
              aria-label="Время отрезка"
            />
          </Labelled>
          <Labelled label="дистанция, км">
            <NumberStepper
              value={distanceM === null ? null : distanceM / 1000}
              onChange={(km) => setDistanceM(km === null ? null : Math.round(km * 1000))}
              step={0.1}
              min={0}
              max={CARDIO_DISTANCE_MAX_M / 1000}
              precision={2}
              unit="км"
              aria-label="Дистанция в километрах"
            />
          </Labelled>
        </>
      ) : (
        <>
          <Labelled label="вес, кг">
            <NumberStepper
              value={weightKg}
              onChange={setWeightKg}
              step={weightStepKg}
              min={WEIGHT_MIN_KG}
              max={WEIGHT_MAX_KG}
              precision={2}
              unit="кг"
              aria-label="Вес в килограммах"
            />
          </Labelled>
          <Labelled label="повторы">
            <NumberStepper
              value={reps}
              onChange={setReps}
              step={1}
              min={REPS_MIN}
              max={REPS_MAX}
              precision={0}
              aria-label="Повторы"
            />
          </Labelled>
          <RirStepper value={rir} onChange={setRir} targetRir={targetRir ?? undefined} />
        </>
      )}

      <div className="flex gap-2">
        <Button variant="outline" size="sm" fullWidth onClick={onCancel}>
          <X size={15} aria-hidden />
          Отмена
        </Button>
        <Button size="sm" fullWidth disabled={!valid} onClick={submit}>
          <Check size={15} aria-hidden />
          Сохранить
        </Button>
      </div>
    </div>
  )
}

/** Подпись над степпером. Не <label>: внутри группа кнопок, а не одно поле. */
function Labelled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="mark text-ink-muted">{label}</span>
      {children}
    </div>
  )
}
