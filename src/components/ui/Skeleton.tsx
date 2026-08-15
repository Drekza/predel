import { cn } from '@/lib/cn'

export function Skeleton({ className }: { className?: string }) {
  // Заготовка должна быть видна на корпусе: утопленное гнездо на тёмном фоне
  // читается как пустота, а не как «сейчас загрузится».
  return (
    <div
      aria-hidden
      className={cn('animate-pulse rounded-sm border border-edge/70 bg-panel-2', className)}
    />
  )
}
