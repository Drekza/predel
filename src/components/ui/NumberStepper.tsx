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
        <Minus size={size === 'lg' ? 22 : 18} strokeWidth={2.5} aria-hidden />
      </StepperButton>

      {editing ? (
        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
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
            'hud-well min-w-0 flex-1 rounded-md border border-accent/70 text-center shadow-glow outline-none',
            'font-mono tabular-nums text-text',
            size === 'lg' ? 'h-14 text-readout' : 'h-11 text-xl font-semibold',
          )}
        />
      ) : (
        <button
          type="button"
          onClick={openEditor}
          aria-label={ariaLabel ? `${ariaLabel}: ${display}` : `Значение: ${display}`}
          className={cn(
            'hud-well hud-scale tap min-w-0 flex-1 rounded-md border border-line',
            'flex items-baseline justify-center gap-1.5',
            'transition-colors duration-100 ease-hud hover:border-accent/40',
            size === 'lg' ? 'h-14 px-2' : 'h-11 px-2',
          )}
        >
          <span
            className={cn(
              'font-mono tabular-nums',
              value === null ? 'text-muted' : 'text-text',
              size === 'lg' ? 'text-readout' : 'text-xl font-semibold',
            )}
          >
            {display}
          </span>
          {unit ? (
            <span className="font-mono text-hud uppercase text-muted">{unit}</span>
          ) : null}
        </button>
      )}

      <StepperButton onStep={() => applyStep(1)} label="Увеличить" size={size} disabled={atMax}>
        <Plus size={size === 'lg' ? 22 : 18} strokeWidth={2.5} aria-hidden />
      </StepperButton>
    </div>
  )
}
