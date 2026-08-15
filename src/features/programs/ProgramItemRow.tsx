import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronUp, Timer, Trash2 } from 'lucide-react'

import { Button, DurationStepper, NumberStepper, RirStepper } from '@/components/ui'
import { cn } from '@/lib/cn'
import { equipmentLabelRu } from '@/lib/constants'
import { formatCardio, formatStrengthSet } from '@/lib/format'
import type { ProgramItemUpdate, ProgramItemWithExercise } from '@/types/domain'

import { MIN_TARGET_DURATION_SEC } from './api'
import type { Direction } from './reorder'

/** Пауза перед отправкой правки: удержание «+» на степпере не должно родить два десятка запросов. */
const SAVE_DEBOUNCE_MS = 450

const REPS_MIN = 1
const REPS_MAX = 100
const SETS_MIN = 1
const SETS_MAX = 12
const MAX_DURATION_SEC = 36_000
const MAX_DISTANCE_M = 100_000

type ProgramItemRowProps = {
  item: ProgramItemWithExercise
  index: number
  canMoveUp: boolean
  canMoveDown: boolean
  onMove: (direction: Direction) => void
  onDelete: () => void
  onPatch: (patch: ProgramItemUpdate) => void
}

type Draft = {
  targetSets: number | null
  repMin: number | null
  repMax: number | null
  targetRir: number | null
  durationSec: number | null
  distanceM: number | null
}

function toDraft(item: ProgramItemWithExercise): Draft {
  return {
    targetSets: item.target_sets,
    repMin: item.rep_min,
    repMax: item.rep_max,
    targetRir: item.target_rir,
    durationSec: item.target_duration_sec,
    distanceM: item.target_distance_m,
  }
}

function sameDraft(a: Draft, b: Draft): boolean {
  return (
    a.targetSets === b.targetSets &&
    a.repMin === b.repMin &&
    a.repMax === b.repMax &&
    a.targetRir === b.targetRir &&
    a.durationSec === b.durationSec &&
    a.distanceM === b.distanceM
  )
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Цели силового и кардио не смешиваются: чужие поля всегда уходят как null. */
function toUpdate(draft: Draft, kind: string): ProgramItemUpdate {
  if (kind === 'cardio') {
    const duration =
      draft.durationSec === null || draft.durationSec <= 0
        ? null
        : clamp(Math.round(draft.durationSec), MIN_TARGET_DURATION_SEC, MAX_DURATION_SEC)
    const distance =
      draft.distanceM === null || draft.distanceM <= 0
        ? null
        : clamp(Math.round(draft.distanceM * 10) / 10, 0.1, MAX_DISTANCE_M)
    return {
      target_sets: clamp(draft.targetSets ?? 1, SETS_MIN, SETS_MAX),
      rep_min: null,
      rep_max: null,
      target_rir: null,
      target_duration_sec: duration,
      target_distance_m: distance,
    }
  }

  const repMin = draft.repMin === null ? null : clamp(Math.round(draft.repMin), REPS_MIN, REPS_MAX)
  const repMax = draft.repMax === null ? null : clamp(Math.round(draft.repMax), REPS_MIN, REPS_MAX)
  return {
    target_sets: clamp(draft.targetSets ?? 3, SETS_MIN, SETS_MAX),
    // Диапазон не может быть перевёрнут — этого не даст и констрейнт в БД.
    rep_min: repMin !== null && repMax !== null ? Math.min(repMin, repMax) : repMin,
    rep_max: repMin !== null && repMax !== null ? Math.max(repMin, repMax) : repMax,
    target_rir: draft.targetRir,
    target_duration_sec: null,
    target_distance_m: null,
  }
}

export function ProgramItemRow({
  item,
  index,
  canMoveUp,
  canMoveDown,
  onMove,
  onDelete,
  onPatch,
}: ProgramItemRowProps) {
  const isCardio = item.exercise.kind === 'cardio'
  const [draft, setDraft] = useState<Draft>(() => toDraft(item))
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  // Последний показанный черновик, незаписанная правка и таймер отправки.
  const draftRef = useRef(draft)
  const dirty = useRef(false)
  const timer = useRef<number | null>(null)
  const flush = useRef<(() => void) | null>(null)

  // Свежие серверные значения принимаем, только если своих несохранённых правок нет.
  useEffect(() => {
    if (dirty.current) return
    const next = toDraft(item)
    if (sameDraft(draftRef.current, next)) return
    draftRef.current = next
    setDraft(next)
  }, [item])

  const send = (next: Draft) => {
    dirty.current = false
    flush.current = null
    onPatch(toUpdate(next, item.exercise.kind))
  }

  const schedule = (patch: Partial<Draft>) => {
    const next = { ...draft, ...patch }
    draftRef.current = next
    setDraft(next)
    dirty.current = true
    flush.current = () => send(next)
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      timer.current = null
      send(next)
    }, SAVE_DEBOUNCE_MS)
  }

  // Уход со страницы не должен съедать последнюю правку.
  useEffect(() => {
    return () => {
      if (timer.current === null) return
      window.clearTimeout(timer.current)
      timer.current = null
      flush.current?.()
    }
  }, [])

  const setRepMin = (value: number | null) => {
    const repMax = draft.repMax
    schedule({
      repMin: value,
      repMax: value !== null && repMax !== null && value > repMax ? value : repMax,
    })
  }

  const setRepMax = (value: number | null) => {
    const repMin = draft.repMin
    schedule({
      repMax: value,
      repMin: value !== null && repMin !== null && value < repMin ? value : repMin,
    })
  }

  const memory = isCardio
    ? item.last_duration_sec === null && item.last_distance_m === null
      ? null
      : formatCardio(item.last_duration_sec, item.last_distance_m)
    : item.last_weight_kg === null && item.last_reps === null
      ? null
      : formatStrengthSet(item.last_weight_kg, item.last_reps)

  return (
    <li className="rounded-md border border-line bg-surface-2/60">
      <div className="flex items-start gap-2 px-3 pt-3">
        <span className="mt-1 font-mono text-hud tabular-nums text-muted">
          {String(index + 1).padStart(2, '0')}
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-text">{item.exercise.name_ru}</p>
          <p className="mt-0.5 flex items-center gap-1.5 font-mono text-hud uppercase text-muted">
            {isCardio ? <Timer size={12} aria-hidden /> : null}
            <span className="truncate">
              {isCardio ? 'кардио' : equipmentLabelRu(item.exercise.equipment)}
            </span>
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <IconButton
            label="переместить выше"
            disabled={!canMoveUp}
            onClick={() => onMove('up')}
          >
            <ChevronUp size={18} aria-hidden />
          </IconButton>
          <IconButton
            label="переместить ниже"
            disabled={!canMoveDown}
            onClick={() => onMove('down')}
          >
            <ChevronDown size={18} aria-hidden />
          </IconButton>
          <IconButton
            label="убрать упражнение"
            danger
            onClick={() => setConfirmingDelete((prev) => !prev)}
          >
            <Trash2 size={16} aria-hidden />
          </IconButton>
        </div>
      </div>

      {confirmingDelete ? (
        // Подтверждение инлайновое: модалок в приложении нет.
        <div className="mt-2.5 flex items-center gap-2 border-t border-line/70 bg-danger/5 px-3 py-2.5">
          <span className="flex-1 text-xs text-muted">Убрать упражнение из дня?</span>
          <Button size="sm" variant="danger" onClick={onDelete}>
            Убрать
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirmingDelete(false)}>
            Отмена
          </Button>
        </div>
      ) : null}

      <div className="grid gap-3 px-3 pt-3 pb-3">
        <Control label="Подходы">
          <NumberStepper
            value={draft.targetSets}
            onChange={(value) => schedule({ targetSets: value })}
            step={1}
            min={SETS_MIN}
            max={SETS_MAX}
            precision={0}
            aria-label="целевые подходы"
          />
        </Control>

        {isCardio ? (
          <>
            <Control label="Время">
              <DurationStepper
                valueSec={draft.durationSec}
                onChange={(value) => schedule({ durationSec: value })}
                stepSec={30}
                aria-label="целевое время"
              />
            </Control>
            <Control label="Дистанция, км" hint="необязательно">
              <NumberStepper
                value={draft.distanceM === null ? null : draft.distanceM / 1000}
                onChange={(value) =>
                  schedule({ distanceM: value === null ? null : Math.round(value * 1000) })
                }
                step={0.1}
                min={0}
                max={MAX_DISTANCE_M / 1000}
                precision={1}
                unit="км"
                aria-label="целевая дистанция"
              />
            </Control>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Control label="Повторов от">
                <NumberStepper
                  value={draft.repMin}
                  onChange={setRepMin}
                  step={1}
                  min={REPS_MIN}
                  max={REPS_MAX}
                  precision={0}
                  aria-label="повторов от"
                />
              </Control>
              <Control label="До">
                <NumberStepper
                  value={draft.repMax}
                  onChange={setRepMax}
                  step={1}
                  min={REPS_MIN}
                  max={REPS_MAX}
                  precision={0}
                  aria-label="повторов до"
                />
              </Control>
            </div>
            <Control label="Целевой запас">
              <RirStepper
                value={draft.targetRir}
                onChange={(value) => schedule({ targetRir: value })}
              />
            </Control>
          </>
        )}

        <p className="font-mono text-hud text-muted">
          {memory ? `в прошлый раз: ${memory}` : 'ещё не выполнялось'}
        </p>
      </div>
    </li>
  )
}

function Control({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-mono text-hud uppercase text-muted">
        {label}
        {hint ? <span className="normal-case text-muted/70"> · {hint}</span> : null}
      </span>
      {children}
    </div>
  )
}

function IconButton({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'tap grid h-11 w-11 place-items-center rounded-md border border-line',
        'transition-colors duration-100 ease-hud',
        disabled
          ? 'text-muted/40'
          : danger
            ? 'text-muted hover:border-danger/60 hover:text-danger'
            : 'text-muted hover:border-accent/50 hover:text-accent',
      )}
    >
      {children}
    </button>
  )
}
