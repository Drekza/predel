import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'

type SheetProps = {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

/**
 * Нижняя шторка. Намеренно НЕ модальная: скролл страницы не блокируется,
 * фокус не запирается — во время тренировки ничто не должно перехватывать экран.
 */
export function Sheet({ open, onClose, title, children }: SheetProps) {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end">
      <button
        type="button"
        aria-label="Закрыть"
        tabIndex={-1}
        onClick={onClose}
        className="flex-1 bg-body/75"
      />
      <div
        role="dialog"
        aria-label={title}
        className="animate-sheet-in border-t border-edge bg-panel shadow-[0_-16px_36px_-22px_rgb(0_0_0/0.9)]"
      >
        <div className="grid place-items-center pt-2 pb-1">
          <span aria-hidden className="h-1 w-10 rounded-xs bg-edge" />
        </div>
        <div className="flex items-center justify-between gap-3 border-b border-edge/70 px-4 pb-2.5">
          <h2 className="mark text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="tap -mr-2 grid h-11 w-11 place-items-center rounded-sm text-ink-muted transition-colors duration-100 ease-station hover:bg-panel-2 hover:text-ink"
          >
            <X size={20} aria-hidden />
          </button>
        </div>
        <div className="max-h-[70dvh] overflow-y-auto px-4 pt-3.5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
          {children}
        </div>
      </div>
    </div>
  )
}
