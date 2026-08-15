import { useEffect, useMemo, useState } from 'react'
import { Timer } from 'lucide-react'

import { cn } from '@/lib/cn'
import { formatClock } from '@/lib/format'

import { secondsSince } from './prefill'

type RestTimerProps = {
  /** Метка времени последнего подхода в миллисекундах. null — таймер скрыт. */
  since: number | null
}

/**
 * Время с прошлого подхода. Без звуков, без модалок, без обратного отсчёта:
 * это показание прибора, а не будильник. Живёт на шильде сессии, а не плавает
 * над экраном: плавающая плашка ложилась поверх степперов, в которые бьёт палец.
 *
 * Счёт идёт от метки времени, а не от накопленного тика — приложение сворачивают
 * посреди отдыха, и таймер, считающий свои собственные секунды, соврал бы.
 */
export function RestTimer({ since }: RestTimerProps) {
  // Сброс по нажатию: пользователь отмеряет отдых от «сейчас».
  const [resetAt, setResetAt] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const anchor = useMemo(() => {
    if (since === null) return resetAt
    if (resetAt === null) return since
    return Math.max(since, resetAt)
  }, [since, resetAt])

  useEffect(() => {
    if (anchor === null) return

    const sync = () => setNow(Date.now())
    sync()

    const id = window.setInterval(sync, 1000)
    // Возврат из фона: пересчитываем сразу, не дожидаясь следующего тика.
    document.addEventListener('visibilitychange', sync)
    window.addEventListener('focus', sync)

    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', sync)
      window.removeEventListener('focus', sync)
    }
  }, [anchor])

  if (anchor === null) return null

  const seconds = secondsSince(anchor, now)
  // Дольше трёх минут отдыха — цифра гаснет, чтобы не выглядеть упрёком.
  const cold = seconds >= 180

  return (
    <button
      type="button"
      onClick={() => setResetAt(Date.now())}
      aria-label={`Отдых ${formatClock(seconds)}. Сбросить`}
      className={cn(
        'tap inline-flex shrink-0 items-center gap-1.5 rounded-xs px-1.5 py-1',
        'transition-colors duration-100 ease-station hover:bg-panel',
        cold ? 'text-ink-muted' : 'text-ink',
      )}
    >
      <Timer size={13} strokeWidth={2} aria-hidden className={cold ? '' : 'text-stamp'} />
      <span className="mark text-ink-muted">отдых</span>
      <span className="num text-sm font-semibold">{formatClock(seconds)}</span>
    </button>
  )
}
