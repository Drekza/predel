import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

const SHARED = cn(
  'hud-well w-full rounded-md border border-line px-3 text-text',
  'placeholder:text-muted/70',
  'transition-[border-color,box-shadow] duration-100 ease-hud',
  'focus:border-accent/70 focus:shadow-glow focus:outline-none',
  'disabled:cursor-not-allowed disabled:text-muted',
)

const INVALID = 'border-danger/80 focus:border-danger focus:shadow-none'

type InputProps = InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }

export function Input({ invalid, className, type = 'text', inputMode, ...rest }: InputProps) {
  // Правило проекта: все числа моноширинные. Здесь это включается само.
  const numeric = type === 'number' || inputMode === 'numeric' || inputMode === 'decimal'
  return (
    <input
      type={type}
      inputMode={inputMode}
      aria-invalid={invalid || undefined}
      className={cn(
        SHARED,
        'h-12',
        numeric && 'font-mono tabular-nums',
        invalid && INVALID,
        className,
      )}
      {...rest}
    />
  )
}

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }

export function Textarea({ invalid, className, rows = 3, ...rest }: TextareaProps) {
  return (
    <textarea
      rows={rows}
      aria-invalid={invalid || undefined}
      className={cn(SHARED, 'resize-none py-2.5 leading-relaxed', invalid && INVALID, className)}
      {...rest}
    />
  )
}
