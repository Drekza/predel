import { cn } from '@/lib/cn'

type SegmentedProps<T extends string> = {
  options: readonly { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
  size?: 'md' | 'lg'
  'aria-label': string
  className?: string
}

/** Переключатель — те же гнёзда корпуса: выбранное поднимается пластиной. */
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
      className={cn('recess flex gap-1 rounded-sm p-1', className)}
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
              'tap mark flex-1 rounded-xs px-3',
              'transition-[background-color,color] duration-100 ease-station',
              size === 'lg' ? 'h-12' : 'h-11',
              selected ? 'plate text-plate-ink' : 'text-ink-muted hover:bg-panel hover:text-ink',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
