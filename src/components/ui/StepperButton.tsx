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

/**
 * Внутренний примитив: кнопка −/+ с повтором по удержанию.
 * Не экспортируется из index.ts — им пользуются только степперы.
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
  // Тап уже обработан в pointerdown — последующий click гасим.
  const handledByPointer = useRef(false)

  const stop = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    tickRef.current = 0
  }, [])

  useEffect(() => stop, [stop])

  const startRepeat = useCallback(() => {
    const tick = () => {
      tickRef.current += 1
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
      onPointerDown={() => {
        if (disabled) return
        handledByPointer.current = true
        stepRef.current()
        startRepeat()
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onBlur={stop}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={() => {
        handledByPointer.current = false
      }}
      onClick={() => {
        if (handledByPointer.current) {
          handledByPointer.current = false
          return
        }
        if (!disabled) stepRef.current()
      }}
    >
      {children}
    </button>
  )
}
