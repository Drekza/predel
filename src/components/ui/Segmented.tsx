import { cn } from '@/lib/cn'

type SegmentedProps<T extends string> = {
  options: readonly { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
  size?: 'md' | 'lg'
  'aria-label': string
  className?: string
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  'aria-label': ariaLabel,
  className,
}: SegmentedProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn('flex gap-1 rounded-md border border-line bg-surface-2 p-1', className)}
    >
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'tap flex-1 rounded-xs px-3 font-mono text-hud uppercase',
              'transition-[background-color,color] duration-100 ease-hud',
              size === 'lg' ? 'h-12' : 'h-11',
              selected
                ? 'bg-accent text-bg'
                : 'text-muted hover:bg-surface hover:text-text',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
