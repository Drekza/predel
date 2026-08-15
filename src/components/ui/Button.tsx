import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'
import { Spinner } from './Spinner'

type ButtonProps = {
  variant?: 'primary' | 'ghost' | 'outline' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  fullWidth?: boolean
} & ButtonHTMLAttributes<HTMLButtonElement>

const VARIANTS = {
  primary: cn(
    'bg-accent text-bg shadow-hud',
    'hover:bg-accent/90 active:bg-accent/80',
    'disabled:bg-accent/25 disabled:text-bg/60',
  ),
  danger: cn(
    'bg-danger text-bg shadow-hud',
    'hover:bg-danger/90 active:bg-danger/80',
    'disabled:bg-danger/25 disabled:text-bg/60',
  ),
  outline: cn(
    'border border-line bg-surface text-text',
    'hover:border-accent/60 hover:text-accent active:bg-surface-2',
    'disabled:border-line/60 disabled:text-muted',
  ),
  ghost: cn(
    'bg-transparent text-muted',
    'hover:bg-surface-2 hover:text-text active:bg-surface-2/70',
    'disabled:text-muted/50',
  ),
} as const

const SIZES = {
  sm: 'h-11 px-3 text-[0.6875rem] tracking-label gap-1.5',
  md: 'h-12 px-4 text-xs tracking-label gap-2',
  lg: 'h-14 px-5 text-sm tracking-hud gap-2.5',
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
        'tap relative inline-flex items-center justify-center rounded-md',
        'font-mono font-semibold uppercase',
        'transition-[background-color,border-color,color,transform] duration-100 ease-hud',
        'active:scale-[0.985] disabled:cursor-not-allowed disabled:active:scale-100',
        SIZES[size],
        VARIANTS[variant],
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
