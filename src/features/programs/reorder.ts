/**
 * Перестановка элементов списка и пересчёт order_index.
 *
 * Чистые функции без React и без Supabase: на них держатся и порядок дней
 * программы, и порядок упражнений внутри дня. Drag-and-drop сознательно нет —
 * в зале пальцем это неудобно, поэтому перестановка идёт кнопками вверх/вниз.
 *
 * Инвариант после reindex: order_index = позиция в массиве, значит 0,1,2,...
 * без дырок и без дублей.
 */

export type Ordered = { id: string; order_index: number }
export type Direction = 'up' | 'down'
export type OrderPatch = { id: string; order_index: number }

/** Сортировка по order_index; при равных индексах порядок задаёт id — результат детерминирован. */
export function sortByOrder<T extends Ordered>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.order_index - b.order_index || a.id.localeCompare(b.id))
}

export function indexOfId(items: readonly Ordered[], id: string): number {
  return items.findIndex((item) => item.id === id)
}

/**
 * Индекс для нового элемента в конце списка.
 * Берём максимум из длины и (макс. индекс + 1): даже если сервер отдал строки
 * с дырками, новый элемент гарантированно уедет в хвост.
 */
export function nextOrderIndex(items: readonly Ordered[]): number {
  if (items.length === 0) return 0
  let max = -1
  for (const item of items) if (item.order_index > max) max = item.order_index
  return Math.max(items.length, max + 1)
}

/**
 * Перестановка по позициям. Индекс `to` клампится в границы массива,
 * некорректный `from` оставляет список без изменений.
 */
export function moveByIndex<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items]
  if (!Number.isInteger(from) || from < 0 || from >= next.length) return next

  const target = Math.min(Math.max(Math.trunc(to), 0), next.length - 1)
  if (target === from) return next

  const removed = next.splice(from, 1)
  const moved = removed[0]
  if (moved === undefined) return [...items]
  next.splice(target, 0, moved)
  return next
}

/** Можно ли сдвинуть элемент: на границе списка кнопка гасится. */
export function canMove(items: readonly Ordered[], id: string, direction: Direction): boolean {
  const index = indexOfId(items, id)
  if (index < 0) return false
  return direction === 'up' ? index > 0 : index < items.length - 1
}

/** Сдвиг элемента на одну позицию. На границе и для чужого id список не меняется. */
export function moveById<T extends Ordered>(
  items: readonly T[],
  id: string,
  direction: Direction,
): T[] {
  const index = indexOfId(items, id)
  if (index < 0) return [...items]
  return moveByIndex(items, index, direction === 'up' ? index - 1 : index + 1)
}

/**
 * Плотный пересчёт order_index. Элементы, у которых индекс не изменился,
 * возвращаются той же ссылкой — так React не перерисовывает лишние строки.
 */
export function reindex<T extends Ordered>(items: readonly T[]): T[] {
  return items.map((item, index) =>
    item.order_index === index ? item : { ...item, order_index: index },
  )
}

/**
 * Полный цикл перестановки: отсортировать по текущему индексу, сдвинуть, перенумеровать.
 * Именно этот результат кладётся в кэш оптимистично и он же уезжает в БД.
 */
export function reorderById<T extends Ordered>(
  items: readonly T[],
  id: string,
  direction: Direction,
): T[] {
  return reindex(moveById(sortByOrder(items), id, direction))
}

/** Список без удалённого элемента, с плотной нумерацией. */
export function removeAndReindex<T extends Ordered>(items: readonly T[], id: string): T[] {
  return reindex(sortByOrder(items).filter((item) => item.id !== id))
}

/** Минимальный патч для БД: только строки, у которых order_index реально изменился. */
export function orderPatch(prev: readonly Ordered[], next: readonly Ordered[]): OrderPatch[] {
  const before = new Map(prev.map((item) => [item.id, item.order_index]))
  const patch: OrderPatch[] = []
  for (const item of next) {
    if (before.get(item.id) !== item.order_index) {
      patch.push({ id: item.id, order_index: item.order_index })
    }
  }
  return patch
}
