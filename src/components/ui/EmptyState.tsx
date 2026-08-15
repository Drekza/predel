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
    <div className="hud-brackets flex flex-col items-center gap-3 rounded-lg border border-dashed border-line px-6 py-10 text-center">
      {icon ? <span className="text-accent/70">{icon}</span> : null}
      <h3 className="font-mono text-hud uppercase text-text">{title}</h3>
      {hint ? <p className="max-w-[26ch] text-sm text-muted">{hint}</p> : null}
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  )
}
