import { useCallback, useEffect, useRef, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

type StepperButtonProps = {
  onStep: () => void
  label: string
  size: 'md' | 'lg'
  disabled?: boolean
  children: ReactNode
  className?: string
}

// Ускорение удержания: первый повтор через 420 мс, дальше всё чаще.
const HOLD_DELAY_MS = 420
function repeatDelay(tick: number): number {
  if (tick < 5) return 140
  if (tick < 12) return 90
  return 55
}

/** Дальше этого сдвига палец уже листает страницу, а не жмёт клавишу. */
const MOVE_CANCEL_PX = 10

/**
 * Внутренний примитив: кнопка −/+ с повтором по удержанию.
 * Не экспортируется из index.ts — им пользуются только степперы.
 *
 * Одиночный шаг делает click, а не pointerdown: на телефоне pointerdown
 * прилетает и тогда, когда палец только начинает листать страницу с этой
 * клавиши, — и значение менялось само от прокрутки. Click браузер после
 * прокрутки не шлёт вовсе.
 */
export function StepperButton({
  onStep,
  label,
  size,
  disabled,
  children,
  className,
}: StepperButtonProps) {
  // Актуальный колбэк держим в ref: таймеры повтора не должны пересоздаваться.
  const stepRef = useRef(onStep)
  useEffect(() => {
    stepRef.current = onStep
  }, [onStep])

  const timerRef = useRef<number | null>(null)
  const tickRef = useRef(0)
  const originRef = useRef<{ x: number; y: number } | null>(null)
  // Удержание уже насчитало шаги — click по отпусканию был бы лишним.
  const repeated = useRef(false)

  const stop = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    tickRef.current = 0
    originRef.current = null
  }, [])

  useEffect(() => stop, [stop])

  const startRepeat = useCallback(() => {
    const tick = () => {
      tickRef.current += 1
      repeated.current = true
      stepRef.current()
      timerRef.current = window.setTimeout(tick, repeatDelay(tickRef.current))
    }
    timerRef.current = window.setTimeout(tick, HOLD_DELAY_MS)
  }, [])

  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      className={cn(
        // Не киноварью: клеймо принадлежит отметке сделанного и необратимому,
        // а шаг ±2,5 кг обратим и повторяется сорок раз за тренировку.
        'tap bezel grid shrink-0 place-items-center rounded-sm bg-panel-2 text-ink',
        'transition-[background-color,color,transform] duration-75 ease-station',
        'hover:bg-panel active:translate-y-px',
        'disabled:bg-panel disabled:text-ink-muted/35 disabled:shadow-none disabled:active:translate-y-0',
        size === 'lg' ? 'h-14 w-14' : 'h-11 w-11',
        className,
      )}
      onPointerDown={(event) => {
        if (disabled) return
        repeated.current = false
        originRef.current = { x: event.clientX, y: event.clientY }
        startRepeat()
      }}
      onPointerMove={(event) => {
        const origin = originRef.current
        if (!origin) return
        const moved =
          Math.abs(event.clientX - origin.x) > MOVE_CANCEL_PX ||
          Math.abs(event.clientY - origin.y) > MOVE_CANCEL_PX
        if (moved) stop()
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onBlur={stop}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => {
        if (repeated.current) {
          repeated.current = false
          return
        }
        if (!disabled) stepRef.current()
      }}
    >
      {children}
    </button>
  )
}
