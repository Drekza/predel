import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

/**
 * Ввод происходит на пластине. Чёрным по светлому читается под любым углом
 * и при любом свете — это единственная причина, по которой поле не тёмное.
 */
const SHARED = cn(
  'plate w-full rounded-sm px-3',
  'placeholder:text-plate-muted/75',
  'transition-[box-shadow,outline-color] duration-100 ease-station',
  'focus:outline-2 focus:outline-offset-2 focus:outline-stamp',
  'disabled:cursor-not-allowed disabled:bg-plate/30 disabled:text-plate-muted',
)

const INVALID = 'outline-2 outline-offset-0 outline-stamp'

type InputProps = InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }

export function Input({ invalid, className, type = 'text', inputMode, ...rest }: InputProps) {
  // Правило проекта: все числа моноширинные. Здесь это включается само.
  const numeric = type === 'number' || inputMode === 'numeric' || inputMode === 'decimal'
  return (
    <input
      type={type}
      inputMode={inputMode}
      aria-invalid={invalid || undefined}
      className={cn(SHARED, 'h-12', numeric && 'num', invalid && INVALID, className)}
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
