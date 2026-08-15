import { useRef, type ReactNode } from 'react'
import { Plus } from 'lucide-react'

import { cn } from '@/lib/cn'
import {
  CARDIO_DISTANCE_MAX_M,
  CARDIO_DURATION_STEP_SEC,
  REPS_MAX,
  REPS_MIN,
  WEIGHT_MAX_KG,
  WEIGHT_MIN_KG,
} from '@/lib/constants'
import type { CardioSetDraft, SetDraft, SetDraftFilled, StrengthSetDraft } from '@/types/domain'
import { Button, DurationStepper, NumberStepper, RirStepper } from '@/components/ui'

import { isSubmittable, normalize } from './prefill'

type SetInputBarProps = {
  draft: SetDraft
  onChange: (draft: SetDraft) => void
  onSubmit: (draft: SetDraftFilled) => void
  /** Шаг веса упражнения (exercises.weight_step_kg). */
  weightStepKg: number
  targetRir?: number | null
  disabled?: boolean
}

/** Дистанция вводится в километрах, в базу уходит в метрах. */
const KM = 1000

/**
 * Строка ввода следующего подхода — то, ради чего написано приложение.
 *
 * Форма зависит от вида упражнения: силовое просит вес, повторы и запас,
 * кардио — время и необязательную дистанцию. RIR у кардио нет и быть не должно:
 * он ломает формулу относительной интенсивности.
 */
export function SetInputBar({
  draft,
  onChange,
  onSubmit,
  weightStepKg,
  targetRir,
  disabled = false,
}: SetInputBarProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  // Клавиатура телефона перекрывает нижнюю часть экрана: при фокусе
  // подтягиваем строку ввода к центру видимой области.
  const handleFocus = () => {
    const node = containerRef.current
    if (!node || typeof node.scrollIntoView !== 'function') return
    window.setTimeout(() => {
      node.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }, 120)
  }

  const valid = isSubmittable(draft)

  const submit = () => {
    const normalized = normalize(draft)
    if (!normalized) return
    onSubmit(normalized)
  }

  return (
    <div
      ref={containerRef}
      onFocusCapture={handleFocus}
      className={cn(
        // Липнет над нижней навигацией: у длинного блока с пятью подходами
        // кнопка записи остаётся под большим пальцем. Отступ считан по факту:
        // клавиша навигации 64px + отбивка 8px + кромка — иначе низ пластины
        // «записать подход» уходит под навигацию.
        'sticky bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] z-10',
        'bezel flex scroll-mt-24 flex-col gap-2.5 rounded-sm bg-panel-2 px-3 py-3',
      )}
    >
      {draft.kind === 'cardio' ? (
        <CardioFields draft={draft} onChange={onChange} disabled={disabled} />
      ) : (
        <StrengthFields
          draft={draft}
          onChange={onChange}
          weightStepKg={weightStepKg}
          targetRir={targetRir}
          disabled={disabled}
        />
      )}

      <Button size="lg" fullWidth disabled={disabled || !valid} onClick={submit}>
        <Plus size={17} strokeWidth={2.5} aria-hidden />
        {draft.kind === 'cardio' ? 'Записать отрезок' : 'Записать подход'}
      </Button>
    </div>
  )
}

// --- Силовое ---------------------------------------------------------------

function StrengthFields({
  draft,
  onChange,
  weightStepKg,
  targetRir,
  disabled,
}: {
  draft: StrengthSetDraft
  onChange: (draft: SetDraft) => void
  weightStepKg: number
  targetRir?: number | null
  disabled: boolean
}) {
  const patch = (next: Partial<StrengthSetDraft>) => onChange({ ...draft, ...next })

  return (
    // min-w-0 гасит браузерный min-inline-size: min-content у fieldset —
    // без него поле в фокусе распирает набор за края карточки.
    <fieldset disabled={disabled} className="flex min-w-0 flex-col gap-2.5">
      <Labelled label="вес, кг">
        <NumberStepper
          value={draft.weightKg}
          onChange={(weightKg) => patch({ weightKg })}
          step={weightStepKg}
          min={WEIGHT_MIN_KG}
          max={WEIGHT_MAX_KG}
          precision={2}
          unit="кг"
          size="lg"
          aria-label="Вес в килограммах"
        />
      </Labelled>

      <Labelled label="повторы">
        <NumberStepper
          value={draft.reps}
          onChange={(reps) => patch({ reps })}
          step={1}
          min={REPS_MIN}
          max={REPS_MAX}
          precision={0}
          size="lg"
          aria-label="Повторы"
        />
      </Labelled>

      <RirStepper
        value={draft.rir}
        onChange={(rir) => patch({ rir })}
        targetRir={targetRir ?? undefined}
      />
    </fieldset>
  )
}

// --- Кардио ----------------------------------------------------------------

function CardioFields({
  draft,
  onChange,
  disabled,
}: {
  draft: CardioSetDraft
  onChange: (draft: SetDraft) => void
  disabled: boolean
}) {
  const patch = (next: Partial<CardioSetDraft>) => onChange({ ...draft, ...next })

  return (
    // min-w-0 — см. StrengthFields.
    <fieldset disabled={disabled} className="flex min-w-0 flex-col gap-2.5">
      <Labelled label="время">
        <DurationStepper
          valueSec={draft.durationSec}
          onChange={(durationSec) => patch({ durationSec })}
          stepSec={CARDIO_DURATION_STEP_SEC}
          size="lg"
          aria-label="Время отрезка"
        />
      </Labelled>

      <Labelled label="дистанция, км" hint="можно не заполнять">
        <NumberStepper
          value={draft.distanceM === null ? null : draft.distanceM / KM}
          onChange={(km) => patch({ distanceM: km === null ? null : Math.round(km * KM) })}
          step={0.1}
          min={0}
          // Без потолка ручной ввод «10000» переполняет numeric(8,1) в БД,
          // и подход отваливается на сервере уже после оптимистичной записи.
          max={CARDIO_DISTANCE_MAX_M / KM}
          precision={2}
          unit="км"
          // В зале только lg: время и дистанция стоят рядом и должны быть одной высоты.
          size="lg"
          aria-label="Дистанция в километрах"
        />
      </Labelled>
    </fieldset>
  )
}

function Labelled({
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
      <span className="mark text-ink-muted">
        {label}
        {hint ? <span className="ml-1.5 normal-case">({hint})</span> : null}
      </span>
      {children}
    </div>
  )
}
