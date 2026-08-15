import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { cn } from '@/lib/cn'

type ToastKind = 'info' | 'ok' | 'error'
type ToastItem = { id: number; msg: string; kind: ToastKind }
type ToastApi = { show: (msg: string, kind?: ToastKind) => void }

const ToastContext = createContext<ToastApi | null>(null)

const LIFETIME_MS = 3200

/** Вид сообщения читается по квадратной марке слева, а не по цветной полосе. */
const MARK: Record<ToastKind, string> = {
  info: 'bg-ink-muted',
  ok: 'bg-ok',
  error: 'bg-stamp',
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const nextId = useRef(0)
  const timers = useRef<number[]>([])

  useEffect(() => {
    const pending = timers.current
    return () => pending.forEach((t) => window.clearTimeout(t))
  }, [])

  const show = useCallback((msg: string, kind: ToastKind = 'info') => {
    const id = nextId.current++
    setItems((prev) => [...prev.slice(-2), { id, msg, kind }])
    const timer = window.setTimeout(() => {
      setItems((prev) => prev.filter((item) => item.id !== id))
    }, LIFETIME_MS)
    timers.current.push(timer)
  }, [])

  const api = useMemo<ToastApi>(() => ({ show }), [show])

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* Тосты живут над нижней навигацией: большой палец их не закрывает. */}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+5rem)] z-50 flex flex-col items-center gap-2 px-4"
      >
        {items.map((item) => (
          <div
            key={item.id}
            className="animate-toast-in bezel flex w-full max-w-[26rem] items-center gap-2.5 rounded-sm bg-panel px-3.5 py-2.5 text-sm text-ink"
          >
            <span aria-hidden className={cn('size-2 shrink-0 rounded-xs', MARK[item.kind])} />
            {item.msg}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast должен вызываться внутри <ToastProvider>')
  return ctx
}
