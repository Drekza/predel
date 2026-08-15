import { useEffect, useRef, useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { cn } from '@/lib/cn'
import { StepperButton } from './StepperButton'

type NumberStepperProps = {
  value: number | null
  onChange: (v: number | null) => void
  step?: number
  min?: number
  max?: number
  precision?: number
  unit?: string
  size?: 'md' | 'lg'
  'aria-label'?: string
}

/** Русский вид числа: запятая, без хвостовых нулей. 62.5 -> «62,5», 60 -> «60». */
function formatNumber(v: number, precision: number): string {
  const fixed = v.toFixed(Math.max(0, precision))
  const [int = '0', frac] = fixed.split('.')
  if (!frac) return int
  const trimmed = frac.replace(/0+$/, '')
  return trimmed ? `${int},${trimmed}` : int
}

function parseNumber(raw: string): number | null {
  const normalized = raw.replace(',', '.').replace(/[^\d.-]/g, '')
  if (!normalized || normalized === '-' || normalized === '.') return null
  const parsed = Number.parseFloat(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function roundTo(v: number, precision: number): number {
  const factor = 10 ** Math.max(0, precision)
  return Math.round(v * factor) / factor
}

export function NumberStepper({
  value,
  onChange,
  step = 2.5,
  min,
  max,
  precision = 1,
  unit,
  size = 'md',
  'aria-label': ariaLabel,
}: NumberStepperProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  const clamp = (v: number) => {
    let next = v
    if (min !== undefined) next = Math.max(min, next)
    if (max !== undefined) next = Math.min(max, next)
    return roundTo(next, precision)
  }

  const applyStep = (direction: 1 | -1) => {
    onChange(clamp((value ?? 0) + direction * step))
  }

  const openEditor = () => {
    setDraft(value === null ? '' : formatNumber(value, precision))
    setEditing(true)
  }

  const commit = () => {
    const parsed = parseNumber(draft)
    onChange(parsed === null ? null : clamp(parsed))
    setEditing(false)
  }

  const atMin = min !== undefined && value !== null && value <= min
  const atMax = max !== undefined && value !== null && value >= max
  const display = value === null ? '—' : formatNumber(value, precision)

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn('flex items-stretch', size === 'lg' ? 'gap-2' : 'gap-1.5')}
    >
      <StepperButton onStep={() => applyStep(-1)} label="Уменьшить" size={size} disabled={atMin}>
        <Minus size={size === 'lg' ? 24 : 19} strokeWidth={2.75} aria-hidden />
      </StepperButton>

      {editing ? (
        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          // size=1 вместо браузерных 20 знаков: иначе собственная ширина поля
          // (20 моноширинных знаков кегля readout) задирает min-content всей
          // строки, и в контейнере с интринсик-шириной она вылезает за карточку.
          size={1}
          autoFocus
          aria-label={ariaLabel ?? 'Значение'}
          value={draft}
          onChange={(e) => setDraft(e.target.value.replace(/[^\d.,-]/g, ''))}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commit()
            } else if (e.key === 'Escape') {
              e.preventDefault()
              setEditing(false)
            }
          }}
          className={cn(
            'plate num min-w-0 flex-1 rounded-sm text-center',
            'outline-2 outline-offset-2 outline-stamp',
            size === 'lg' ? 'h-14 text-readout' : 'h-11 text-[1.375rem] font-semibold',
          )}
        />
      ) : (
        <button
          type="button"
          onClick={openEditor}
          aria-label={ariaLabel ? `${ariaLabel}: ${display}` : `Значение: ${display}`}
          className={cn(
            // Пластина со шкалой: показание стоит на гравировке, как на приборе.
            'plate plate-etch tap grid min-w-0 flex-1 place-items-center rounded-sm px-2',
            'transition-[background-color] duration-100 ease-station hover:bg-plate-2',
            size === 'lg' ? 'h-14 pb-2' : 'h-11 pb-1.5',
          )}
        >
          <span className="flex items-baseline gap-1.5">
            <span
              className={cn(
                'num leading-none',
                value === null ? 'text-plate-muted' : 'text-plate-ink',
                size === 'lg' ? 'text-readout' : 'text-[1.375rem] font-semibold -tracking-[0.03em]',
              )}
            >
              {display}
            </span>
            {/* Единица — «кг», строчными: это обозначение из ГОСТ, а не метка. */}
            {unit ? (
              <span className="font-stencil text-sm font-medium text-plate-muted">{unit}</span>
            ) : null}
          </span>
        </button>
      )}

      <StepperButton onStep={() => applyStep(1)} label="Увеличить" size={size} disabled={atMax}>
        <Plus size={size === 'lg' ? 24 : 19} strokeWidth={2.75} aria-hidden />
      </StepperButton>
    </div>
  )
}
