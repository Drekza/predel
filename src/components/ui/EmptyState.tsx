import type { ReactNode } from 'react'

type EmptyStateProps = {
  icon?: ReactNode
  title: string
  hint?: string
  action?: ReactNode
}

/** Пустой экран — это приглашение к действию, а не извинение. */
export function EmptyState({ icon, title, hint, action }: EmptyStateProps) {
  return (
    <div className="recess flex flex-col items-center gap-3 rounded-lg px-6 py-10 text-center">
      {icon ? <span className="text-ink-muted">{icon}</span> : null}
      <h3 className="mark text-ink">{title}</h3>
      {hint ? <p className="max-w-[32ch] text-sm leading-relaxed text-ink-muted">{hint}</p> : null}
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  )
}
