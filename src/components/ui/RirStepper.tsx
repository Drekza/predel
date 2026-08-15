import { cn } from '@/lib/cn'

type RirStepperProps = {
  value: number | null
  onChange: (v: number | null) => void
  targetRir?: number
}

const RIR_VALUES = [0, 1, 2, 3, 4, 5] as const

function pluralReps(n: number): string {
  const tens = n % 100
  const ones = n % 10
  if (tens >= 11 && tens <= 14) return 'повторов'
  if (ones === 1) return 'повтор'
  if (ones >= 2 && ones <= 4) return 'повтора'
  return 'повторов'
}

/**
 * Запас повторов (RIR) на подход. Шесть гнёзд в корпусе: выбранное поднимается
 * пластиной, цель помечена киноварной риской — пользователь видит её, не читая
 * подсказку.
 */
export function RirStepper({ value, onChange, targetRir }: RirStepperProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <div
        role="radiogroup"
        aria-label="Запас повторов"
        className="recess grid grid-cols-6 gap-1 rounded-sm p-1"
      >
        {RIR_VALUES.map((rir) => {
          const selected = value === rir
          const isTarget = targetRir === rir
          return (
            <button
              key={rir}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`запас ${rir} ${pluralReps(rir)}`}
              onClick={() => onChange(selected ? null : rir)}
              className={cn(
                'tap num relative grid h-11 place-items-center rounded-xs text-tally',
                'transition-[background-color,color] duration-100 ease-station',
                selected
                  ? 'plate text-plate-ink'
                  : isTarget
                    ? 'text-ink hover:bg-panel'
                    : 'text-ink-muted hover:bg-panel hover:text-ink',
              )}
            >
              {isTarget && !selected ? (
                <span aria-hidden className="absolute inset-x-3 top-1 h-0.5 bg-stamp" />
              ) : null}
              {rir}
            </button>
          )
        })}
      </div>
      {targetRir !== undefined ? (
        <span className="mark text-ink-muted">цель — запас {targetRir}</span>
      ) : null}
    </div>
  )
}
