import type { StatKey } from '@/types/domain'
import { cn } from '@/lib/cn'

type StatBadgeProps = {
  stat: StatKey
  label: string
  value?: number | null
  className?: string
}

/** Единственное место в системе, где допустим инлайн-стиль: цвет стата. */
const STAT_COLOR_VAR: Record<StatKey, string> = {
  chest: 'var(--color-stat-chest)',
  back: 'var(--color-stat-back)',
  shoulders: 'var(--color-stat-shoulders)',
  arms: 'var(--color-stat-arms)',
  quads: 'var(--color-stat-quads)',
  posterior: 'var(--color-stat-posterior)',
  core: 'var(--color-stat-core)',
}

export function StatBadge({ stat, label, value, className }: StatBadgeProps) {
  const color = STAT_COLOR_VAR[stat]
  return (
    <span
      className={cn(
        'bezel inline-flex items-center gap-1.5 rounded-xs bg-panel-2 py-1 pr-2 pl-1.5',
        className,
      )}
    >
      <span aria-hidden className="h-3.5 w-1" style={{ backgroundColor: color }} />
      <span className="mark text-ink-muted">{label}</span>
      {value !== undefined && value !== null ? (
        <span className="num text-xs font-semibold" style={{ color }}>
          {value}
        </span>
      ) : null}
    </span>
  )
}
