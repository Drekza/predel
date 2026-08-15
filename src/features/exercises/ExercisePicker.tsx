import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Search, Timer } from 'lucide-react'

import { Button, EmptyState, Input, Sheet, Spinner } from '@/components/ui'
import { cn } from '@/lib/cn'
import { pluralRu } from '@/lib/format'
import type { Exercise, StatKey } from '@/types/domain'
import { useExercises } from './api'
import { CustomExerciseForm } from './CustomExerciseForm'
import { ExerciseCard } from './ExerciseCard'
import {
  CARDIO_PREVIEW_LIMIT,
  EQUIPMENT_FILTERS,
  MUSCLE_GROUPS,
  PICKER_RESULT_LIMIT,
  STAT_FILTERS,
  splitByKind,
} from './muscleFilters'

type PickHandler = (exercise: Exercise) => void

type ExercisePickerProps = {
  open: boolean
  onClose: () => void
  /** Уже добавленные упражнения — в списке не показываем. */
  excludeIds?: string[]
} & (
  | { onPick: PickHandler; onSelect?: PickHandler }
  // onSelect — псевдоним onPick для конструктора программ; контрактное имя всё же onPick.
  | { onPick?: PickHandler; onSelect: PickHandler }
)

/** Первый ряд фильтров: 7 статов + отдельная кнопка кардио. */
type KindFilter = StatKey | 'cardio'

const SEARCH_DEBOUNCE_MS = 180

const chipBase = cn(
  'tap inline-flex h-11 shrink-0 items-center rounded-md border px-3',
  'font-mono text-[0.6875rem] uppercase tracking-label',
  'transition-colors duration-100 ease-hud',
)

function chipClass(active: boolean): string {
  return cn(
    chipBase,
    active
      ? 'border-accent/70 bg-surface-2 text-accent'
      : 'border-line bg-surface text-muted hover:text-text',
  )
}

/** На телефоне автофокус выбрасывает клавиатуру поверх списка — этого не делаем. */
function isCoarsePointer(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(pointer: coarse)').matches
}

/**
 * Шторка выбора упражнения.
 * Состояние (поиск, фильтры, режим создания) живёт во вложенном компоненте:
 * закрытие размонтирует его, и следующее открытие начинается с чистого листа.
 */
export function ExercisePicker(props: ExercisePickerProps) {
  if (!props.open) return null
  return <PickerContent {...props} />
}

function PickerContent({ open, onClose, onPick, onSelect, excludeIds }: ExercisePickerProps) {
  const [rawQuery, setRawQuery] = useState('')
  const [search, setSearch] = useState('')
  const [kindFilter, setKindFilter] = useState<KindFilter | null>(null)
  const [muscle, setMuscle] = useState<string | null>(null)
  const [equipment, setEquipment] = useState<string | null>(null)
  const [showEquipment, setShowEquipment] = useState(false)
  const [creating, setCreating] = useState(false)
  const searchBoxRef = useRef<HTMLDivElement>(null)

  // Дебаунс поиска: справочник фильтруется на каждый символ, лишние проходы ни к чему.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(rawQuery), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [rawQuery])

  useEffect(() => {
    if (creating) return
    if (isCoarsePointer()) return
    searchBoxRef.current?.querySelector('input')?.focus()
  }, [creating])

  const cardioOnly = kindFilter === 'cardio'
  const statFilter = kindFilter && kindFilter !== 'cardio' ? kindFilter : null

  const { exercises, isLoading, isError, errorMessage, refetch } = useExercises({
    search,
    stat: statFilter,
    muscle,
    equipment,
    kind: cardioOnly ? 'cardio' : null,
    excludeIds,
  })

  const { strength, cardio } = useMemo(() => splitByKind(exercises), [exercises])

  const list = cardioOnly ? exercises : strength
  const shown = list.slice(0, PICKER_RESULT_LIMIT)
  const rest = list.length - shown.length
  const cardioPreview = cardioOnly ? [] : cardio.slice(0, CARDIO_PREVIEW_LIMIT)
  const cardioRest = cardio.length - cardioPreview.length

  // Второй ряд фильтров: мышцы выбранного стата.
  const muscleOptions = useMemo(() => {
    if (!statFilter) return []
    return MUSCLE_GROUPS.find((group) => group.stat === statFilter)?.muscles ?? []
  }, [statFilter])

  const handlePick = (exercise: Exercise) => {
    const pick = onPick ?? onSelect
    pick?.(exercise)
    onClose()
  }

  const selectKind = (next: KindFilter) => {
    setKindFilter((prev) => (prev === next ? null : next))
    setMuscle(null)
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={creating ? 'Своё упражнение' : 'Выбрать упражнение'}
    >
      {creating ? (
        <CustomExerciseForm
          initialName={rawQuery}
          onCreated={handlePick}
          onCancel={() => setCreating(false)}
        />
      ) : (
        <div className="flex flex-col gap-3">
          <div ref={searchBoxRef} className="relative">
            <Search
              size={16}
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted"
            />
            <Input
              type="search"
              value={rawQuery}
              onChange={(event) => setRawQuery(event.target.value)}
              placeholder="Поиск по названию"
              aria-label="Поиск упражнения"
              autoComplete="off"
              className="pl-9"
            />
          </div>

          <div
            role="group"
            aria-label="Фильтр по группе мышц"
            className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1"
          >
            {STAT_FILTERS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={kindFilter === option.value}
                onClick={() => selectKind(option.value)}
                className={chipClass(kindFilter === option.value)}
              >
                {option.label}
              </button>
            ))}
            <button
              type="button"
              aria-pressed={cardioOnly}
              onClick={() => selectKind('cardio')}
              className={cn(chipClass(cardioOnly), 'gap-1.5')}
            >
              <Timer size={13} aria-hidden />
              Кардио
            </button>
          </div>

          {muscleOptions.length > 0 ? (
            <div
              role="group"
              aria-label="Фильтр по мышце"
              className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1"
            >
              {muscleOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={muscle === option.value}
                  onClick={() =>
                    setMuscle((prev) => (prev === option.value ? null : option.value))
                  }
                  className={chipClass(muscle === option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              aria-expanded={showEquipment}
              onClick={() => setShowEquipment((prev) => !prev)}
              className="tap font-mono text-hud uppercase text-accent"
            >
              Снаряд{equipment ? ': выбран' : ''}
            </button>
            {equipment ? (
              <button
                type="button"
                onClick={() => setEquipment(null)}
                className="tap font-mono text-hud uppercase text-muted hover:text-text"
              >
                Сбросить
              </button>
            ) : null}
          </div>

          {showEquipment ? (
            <div role="group" aria-label="Фильтр по снаряду" className="flex flex-wrap gap-1.5">
              {EQUIPMENT_FILTERS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={equipment === option.value}
                  onClick={() =>
                    setEquipment((prev) => (prev === option.value ? null : option.value))
                  }
                  className={chipClass(equipment === option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          ) : null}

          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-muted">
              <Spinner size={18} />
              <span className="font-mono text-hud uppercase">Загружаю справочник</span>
            </div>
          ) : isError ? (
            <div className="flex flex-col items-start gap-3 py-6">
              <p className="text-sm text-danger">{errorMessage}</p>
              <Button variant="outline" size="sm" onClick={refetch}>
                Повторить
              </Button>
            </div>
          ) : shown.length === 0 && cardioPreview.length === 0 ? (
            <EmptyState
              title="Ничего не нашлось"
              hint="Измени запрос или фильтры — либо создай своё упражнение"
              action={
                <Button variant="outline" size="sm" onClick={() => setCreating(true)}>
                  Создать своё
                </Button>
              }
            />
          ) : (
            <ul className="flex flex-col gap-1.5">
              {shown.map((exercise) => (
                <li key={exercise.id}>
                  <ExerciseCard exercise={exercise} onSelect={handlePick} />
                </li>
              ))}
            </ul>
          )}

          {rest > 0 ? (
            <p className="font-mono text-hud uppercase text-muted">
              ещё {rest} {pluralRu(rest, 'упражнение', 'упражнения', 'упражнений')} — уточни запрос
            </p>
          ) : null}

          {cardioPreview.length > 0 ? (
            <section className="flex flex-col gap-1.5 border-t border-line/70 pt-3">
              <h3 className="font-mono text-hud uppercase text-muted">Кардио</h3>
              <ul className="flex flex-col gap-1.5">
                {cardioPreview.map((exercise) => (
                  <li key={exercise.id}>
                    <ExerciseCard exercise={exercise} onSelect={handlePick} />
                  </li>
                ))}
              </ul>
              {cardioRest > 0 ? (
                <button
                  type="button"
                  onClick={() => selectKind('cardio')}
                  className="tap self-start font-mono text-hud uppercase text-accent"
                >
                  ещё {cardioRest}{' '}
                  {pluralRu(cardioRest, 'упражнение', 'упражнения', 'упражнений')}
                </button>
              ) : null}
            </section>
          ) : null}

          <Button variant="outline" fullWidth onClick={() => setCreating(true)}>
            <Plus size={16} aria-hidden />
            Создать своё упражнение
          </Button>
        </div>
      )}
    </Sheet>
  )
}
