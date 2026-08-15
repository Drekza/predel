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
 * Запас повторов (RIR) на подход. Целевое значение помечено штрихом сверху —
 * пользователь видит цель, не читая подсказку.
 */
export function RirStepper({ value, onChange, targetRir }: RirStepperProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <div
        role="radiogroup"
        aria-label="Запас повторов"
        className="grid grid-cols-6 gap-1 rounded-md border border-line bg-surface-2 p-1"
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
                'tap relative grid h-11 place-items-center rounded-xs',
                'font-mono text-base font-semibold tabular-nums',
                'transition-[background-color,color] duration-100 ease-hud',
                selected
                  ? 'bg-accent text-bg'
                  : isTarget
                    ? 'text-accent hover:bg-accent/10'
                    : 'text-muted hover:bg-surface hover:text-text',
              )}
            >
              {isTarget && !selected ? (
                <span
                  aria-hidden
                  className="absolute inset-x-2.5 top-0.5 h-px bg-accent/70"
                />
              ) : null}
              {rir}
            </button>
          )
        })}
      </div>
      {targetRir !== undefined ? (
        <span className="font-mono text-hud uppercase text-muted">
          цель — запас {targetRir}
        </span>
      ) : null}
    </div>
  )
}
