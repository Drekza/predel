import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/cn'
import { StepperButton } from './StepperButton'

type DurationStepperProps = {
  valueSec: number | null
  onChange: (v: number | null) => void
  stepSec?: number
  size?: 'md' | 'lg'
  'aria-label'?: string
}

/** Потолок из DDL: sets.duration_sec <= 36000 (10 часов). */
const MAX_SEC = 36000
const MIN_SEC = 0

function pluralSeconds(n: number): string {
  const tens = n % 100
  const ones = n % 10
  if (tens >= 11 && tens <= 14) return 'секунд'
  if (ones === 1) return 'секунда'
  if (ones >= 2 && ones <= 4) return 'секунды'
  return 'секунд'
}

export function formatDuration(totalSec: number): string {
  const safe = Math.max(0, Math.round(totalSec))
  const minutes = Math.floor(safe / 60)
  const seconds = safe % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

/**
 * Разбор ручного ввода длительности:
 *   «10:30» -> 630 (мм:сс)
 *   «630»   -> 630 (целое число секунд)
 *   «10.5»  -> 630 (дробные минуты)
 */
export function parseDuration(raw: string): number | null {
  const text = raw.trim().replace(',', '.')
  if (!text) return null

  if (text.includes(':')) {
    const [minPart = '', secPart = ''] = text.split(':')
    const minutes = Number.parseFloat(minPart || '0')
    const seconds = secPart === '' ? 0 : Number.parseFloat(secPart)
    if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return null
    return Math.round(minutes * 60 + seconds)
  }

  const parsed = Number.parseFloat(text)
  if (!Number.isFinite(parsed)) return null
  // Точка означает минуты, целое число — секунды.
  return Math.round(text.includes('.') ? parsed * 60 : parsed)
}

export function DurationStepper({
  valueSec,
  onChange,
  stepSec = 30,
  size = 'md',
  'aria-label': ariaLabel,
}: DurationStepperProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  const clamp = (v: number) => Math.min(MAX_SEC, Math.max(MIN_SEC, Math.round(v)))

  const applyStep = (direction: 1 | -1) => {
    onChange(clamp((valueSec ?? 0) + direction * stepSec))
  }

  const commit = () => {
    const parsed = parseDuration(draft)
    onChange(parsed === null ? null : clamp(parsed))
    setEditing(false)
  }

  const display = valueSec === null ? '—:—' : formatDuration(valueSec)
  const atMin = valueSec !== null && valueSec <= MIN_SEC
  const atMax = valueSec !== null && valueSec >= MAX_SEC
  const stepWord = pluralSeconds(stepSec)

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn('flex items-stretch', size === 'lg' ? 'gap-2' : 'gap-1.5')}
    >
      <StepperButton
        onStep={() => applyStep(-1)}
        label={`Минус ${stepSec} ${stepWord}`}
        size={size}
        disabled={atMin}
      >
        <StepFace sign="−" step={stepSec} />
      </StepperButton>

      {editing ? (
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          autoFocus
          aria-label={ariaLabel ?? 'Длительность'}
          placeholder="мм:сс"
          value={draft}
          onChange={(e) => setDraft(e.target.value.replace(/[^\d.,:]/g, ''))}
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
            'font-mono tabular-nums text-text placeholder:text-muted/60',
            size === 'lg' ? 'h-14 text-readout' : 'h-11 text-xl font-semibold',
          )}
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            setDraft(valueSec === null ? '' : formatDuration(valueSec))
            setEditing(true)
          }}
          aria-label={ariaLabel ? `${ariaLabel}: ${display}` : `Длительность: ${display}`}
          className={cn(
            'hud-well hud-scale tap min-w-0 flex-1 rounded-md border border-line',
            'grid place-items-center transition-colors duration-100 ease-hud hover:border-accent/40',
            size === 'lg' ? 'h-14 px-2' : 'h-11 px-2',
          )}
        >
          <span
            className={cn(
              'font-mono tabular-nums',
              valueSec === null ? 'text-muted' : 'text-text',
              size === 'lg' ? 'text-readout' : 'text-xl font-semibold',
            )}
          >
            {display}
          </span>
        </button>
      )}

      <StepperButton
        onStep={() => applyStep(1)}
        label={`Плюс ${stepSec} ${stepWord}`}
        size={size}
        disabled={atMax}
      >
        <StepFace sign="+" step={stepSec} />
      </StepperButton>
    </div>
  )
}

function StepFace({ sign, step }: { sign: string; step: number }) {
  return (
    <span aria-hidden className="flex flex-col items-center gap-0.5">
      <span className="font-mono text-sm leading-none font-semibold tabular-nums">
        {sign}
        {step}
      </span>
      <span className="font-mono text-[0.5rem] leading-none tracking-hud text-muted uppercase">
        сек
      </span>
    </span>
  )
}
