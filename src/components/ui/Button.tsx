import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'
import { Spinner } from './Spinner'

type ButtonProps = {
  variant?: 'primary' | 'ghost' | 'outline' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  fullWidth?: boolean
} & ButtonHTMLAttributes<HTMLButtonElement>

/**
 * Главное действие — это пластина: светлый сток, чёрная печать. В плохом свете
 * зала она читается раньше всего остального и не требует искать акцент.
 */
const VARIANTS = {
  primary: cn('plate', 'hover:bg-plate-2 active:translate-y-px'),
  danger: cn('bg-stamp text-stamp-ink shadow-lift', 'hover:bg-stamp/90 active:translate-y-px'),
  outline: cn('bezel bg-panel text-ink', 'hover:bg-panel-2 active:translate-y-px'),
  ghost: cn('bg-transparent text-ink-muted', 'hover:bg-panel hover:text-ink active:translate-y-px'),
} as const

/**
 * Недоступная кнопка — погасшая клавиша, одна на все варианты: выцветшая
 * пластина читается хуже, чем тёмное гнездо, и путается с активной.
 */
const DISABLED = cn(
  'disabled:cursor-not-allowed disabled:active:translate-y-0',
  'disabled:bg-panel-2 disabled:text-ink-muted/45 disabled:shadow-none',
)

const SIZES = {
  sm: 'h-11 px-3 text-[0.8125rem] gap-1.5',
  md: 'h-12 px-4 text-sm gap-2',
  lg: 'h-14 px-5 text-base gap-2.5',
} as const

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  className,
  disabled,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'tap relative inline-flex items-center justify-center rounded-sm',
        'font-stencil font-medium tracking-mark uppercase',
        'transition-[background-color,color,box-shadow,transform] duration-100 ease-station',
        SIZES[size],
        VARIANTS[variant],
        DISABLED,
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      <span className={cn('inline-flex items-center gap-2', loading && 'invisible')}>
        {children}
      </span>
      {loading ? (
        <span className="absolute inset-0 grid place-items-center">
          <Spinner size={size === 'lg' ? 20 : 16} />
        </span>
      ) : null}
    </button>
  )
}
