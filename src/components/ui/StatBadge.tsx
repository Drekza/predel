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
        'inline-flex items-center gap-1.5 rounded-xs border border-line bg-surface-2 py-1 pr-2 pl-1.5',
        className,
      )}
    >
      <span aria-hidden className="h-3 w-0.5" style={{ backgroundColor: color }} />
      <span className="font-mono text-hud uppercase text-muted">{label}</span>
      {value !== undefined && value !== null ? (
        <span className="font-mono text-xs font-semibold tabular-nums" style={{ color }}>
          {value}
        </span>
      ) : null}
    </span>
  )
}
