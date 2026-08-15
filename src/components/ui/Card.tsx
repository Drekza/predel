import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

type SlotProps = { className?: string; children?: ReactNode }

/** Секция корпуса: фаска со светом по верхней кромке и тенью по нижней. */
export function Card({ className, children }: SlotProps) {
  return <div className={cn('bezel rounded-lg bg-panel', className)}>{children}</div>
}

/** Шапка карточки — метка на шильде: узкий капс с разрядкой. */
export function CardHeader({ className, children }: SlotProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 border-b border-edge/70 px-4 pt-3 pb-2.5',
        'mark text-ink-muted',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function CardBody({ className, children }: SlotProps) {
  return <div className={cn('px-4 py-3.5', className)}>{children}</div>
}

export function CardFooter({ className, children }: SlotProps) {
  return (
    <div className={cn('flex items-center gap-2 border-t border-edge/70 px-4 py-3', className)}>
      {children}
    </div>
  )
}
