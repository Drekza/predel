import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

type SlotProps = { className?: string; children?: ReactNode }

export function Card({ className, children }: SlotProps) {
  return (
    <div
      className={cn(
        'hud-brackets rounded-lg border border-line bg-surface shadow-hud',
        className,
      )}
    >
      {children}
    </div>
  )
}

/** Шапка карточки уже говорит голосом HUD: моно, капс, разрядка. */
export function CardHeader({ className, children }: SlotProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 border-b border-line/70 px-4 pt-3.5 pb-2.5',
        'font-mono text-hud uppercase text-muted',
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
    <div
      className={cn('flex items-center gap-2 border-t border-line/70 px-4 py-3', className)}
    >
      {children}
    </div>
  )
}
