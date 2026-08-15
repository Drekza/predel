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
        className="flex-1 bg-bg/70 backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-label={title}
        className="animate-sheet-in rounded-t-xl border-t border-line bg-surface shadow-[0_-18px_40px_-24px_#000]"
      >
        <div className="grid place-items-center pt-2 pb-1">
          <span aria-hidden className="h-1 w-10 rounded-full bg-line" />
        </div>
        <div className="flex items-center justify-between gap-3 border-b border-line/70 px-4 pb-2.5">
          <h2 className="font-mono text-hud uppercase text-accent">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="tap -mr-2 grid h-11 w-11 place-items-center rounded-md text-muted transition-colors duration-100 ease-hud hover:bg-surface-2 hover:text-text"
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
