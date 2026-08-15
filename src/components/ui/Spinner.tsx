import { cn } from '@/lib/cn'

export function Spinner({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg
      data-motion="spin"
      className={cn('animate-spin', className)}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      role="img"
      aria-label="Загрузка"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2.5" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="square"
      />
    </svg>
  )
}
