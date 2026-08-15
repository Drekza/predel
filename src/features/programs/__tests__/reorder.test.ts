import { describe, expect, it } from 'vitest'

import {
  canMove,
  indexOfId,
  moveByIndex,
  moveById,
  nextOrderIndex,
  orderPatch,
  reindex,
  removeAndReindex,
  reorderById,
  sortByOrder,
  type Ordered,
} from '../reorder'

type Row = Ordered & { name: string }

function rows(...names: string[]): Row[] {
  return names.map((name, index) => ({ id: name, order_index: index, name }))
}

const ids = (items: readonly Ordered[]) => items.map((item) => item.id)
const indexes = (items: readonly Ordered[]) => items.map((item) => item.order_index)

describe('sortByOrder', () => {
  it('сортирует по order_index и не трогает исходный массив', () => {
    const source: Row[] = [
      { id: 'c', order_index: 2, name: 'c' },
      { id: 'a', order_index: 0, name: 'a' },
      { id: 'b', order_index: 1, name: 'b' },
    ]
    expect(ids(sortByOrder(source))).toEqual(['a', 'b', 'c'])
    expect(ids(source)).toEqual(['c', 'a', 'b'])
  })

  it('при равных индексах порядок детерминирован (по id)', () => {
    const source: Row[] = [
      { id: 'b', order_index: 1, name: 'b' },
      { id: 'a', order_index: 1, name: 'a' },
    ]
    expect(ids(sortByOrder(source))).toEqual(['a', 'b'])
  })
})

describe('nextOrderIndex', () => {
  it('пустой список -> 0', () => {
    expect(nextOrderIndex([])).toBe(0)
  })

  it('плотный список -> длина', () => {
    expect(nextOrderIndex(rows('a', 'b', 'c'))).toBe(3)
  })

  it('список с дырками -> максимум + 1, новый элемент уезжает в хвост', () => {
    const source: Ordered[] = [
      { id: 'a', order_index: 0 },
      { id: 'b', order_index: 7 },
    ]
    expect(nextOrderIndex(source)).toBe(8)
  })
})

describe('moveByIndex', () => {
  it('двигает вверх', () => {
    expect(ids(moveByIndex(rows('a', 'b', 'c'), 2, 1))).toEqual(['a', 'c', 'b'])
  })

  it('двигает вниз', () => {
    expect(ids(moveByIndex(rows('a', 'b', 'c'), 0, 1))).toEqual(['b', 'a', 'c'])
  })

  it('клампит целевую позицию в границы', () => {
    expect(ids(moveByIndex(rows('a', 'b', 'c'), 0, -5))).toEqual(['a', 'b', 'c'])
    expect(ids(moveByIndex(rows('a', 'b', 'c'), 0, 99))).toEqual(['b', 'c', 'a'])
  })

  it('некорректный from оставляет список как есть', () => {
    expect(ids(moveByIndex(rows('a', 'b'), 5, 0))).toEqual(['a', 'b'])
    expect(ids(moveByIndex(rows('a', 'b'), -1, 0))).toEqual(['a', 'b'])
  })

  it('не мутирует исходный массив', () => {
    const source = rows('a', 'b', 'c')
    moveByIndex(source, 0, 2)
    expect(ids(source)).toEqual(['a', 'b', 'c'])
  })
})

describe('canMove', () => {
  const items = rows('a', 'b', 'c')

  it('первый элемент нельзя поднять, последний — опустить', () => {
    expect(canMove(items, 'a', 'up')).toBe(false)
    expect(canMove(items, 'a', 'down')).toBe(true)
    expect(canMove(items, 'c', 'down')).toBe(false)
    expect(canMove(items, 'c', 'up')).toBe(true)
  })

  it('чужой id двигать нельзя', () => {
    expect(canMove(items, 'нет-такого', 'up')).toBe(false)
    expect(canMove([], 'a', 'down')).toBe(false)
  })
})

describe('moveById', () => {
  it('поднимает и опускает элемент на одну позицию', () => {
    expect(ids(moveById(rows('a', 'b', 'c'), 'b', 'up'))).toEqual(['b', 'a', 'c'])
    expect(ids(moveById(rows('a', 'b', 'c'), 'b', 'down'))).toEqual(['a', 'c', 'b'])
  })

  it('на границах порядок не меняется', () => {
    expect(ids(moveById(rows('a', 'b', 'c'), 'a', 'up'))).toEqual(['a', 'b', 'c'])
    expect(ids(moveById(rows('a', 'b', 'c'), 'c', 'down'))).toEqual(['a', 'b', 'c'])
  })

  it('неизвестный id ничего не ломает', () => {
    expect(ids(moveById(rows('a', 'b'), 'x', 'down'))).toEqual(['a', 'b'])
  })
})

describe('reindex', () => {
  it('убирает дырки и дубли: индексы становятся 0..n-1', () => {
    const source: Ordered[] = [
      { id: 'a', order_index: 4 },
      { id: 'b', order_index: 4 },
      { id: 'c', order_index: 9 },
    ]
    expect(indexes(reindex(source))).toEqual([0, 1, 2])
  })

  it('элементы с неизменившимся индексом возвращаются той же ссылкой', () => {
    const source = rows('a', 'b', 'c')
    const result = reindex(source)
    expect(result[0]).toBe(source[0])
  })
})

describe('reorderById', () => {
  it('перестановка вверх даёт плотную нумерацию', () => {
    const result = reorderById(rows('a', 'b', 'c'), 'c', 'up')
    expect(ids(result)).toEqual(['a', 'c', 'b'])
    expect(indexes(result)).toEqual([0, 1, 2])
  })

  it('перестановка вниз даёт плотную нумерацию', () => {
    const result = reorderById(rows('a', 'b', 'c', 'd'), 'a', 'down')
    expect(ids(result)).toEqual(['b', 'a', 'c', 'd'])
    expect(indexes(result)).toEqual([0, 1, 2, 3])
  })

  it('чинит дырки в order_index, даже когда двигать некуда', () => {
    const source: Ordered[] = [
      { id: 'a', order_index: 3 },
      { id: 'b', order_index: 10 },
    ]
    const result = reorderById(source, 'a', 'up')
    expect(ids(result)).toEqual(['a', 'b'])
    expect(indexes(result)).toEqual([0, 1])
  })

  it('работает со списком из одного элемента', () => {
    const result = reorderById(rows('a'), 'a', 'down')
    expect(ids(result)).toEqual(['a'])
    expect(indexes(result)).toEqual([0])
  })

  it('сортирует по order_index до сдвига, а не по порядку в массиве', () => {
    const source: Ordered[] = [
      { id: 'c', order_index: 2 },
      { id: 'a', order_index: 0 },
      { id: 'b', order_index: 1 },
    ]
    expect(ids(reorderById(source, 'a', 'down'))).toEqual(['b', 'a', 'c'])
  })

  it('после серии перестановок дырок не появляется', () => {
    let items: Ordered[] = rows('a', 'b', 'c', 'd', 'e')
    items = reorderById(items, 'e', 'up')
    items = reorderById(items, 'e', 'up')
    items = reorderById(items, 'a', 'down')
    items = reorderById(items, 'c', 'up')
    expect(indexes(items)).toEqual([0, 1, 2, 3, 4])
    expect(new Set(ids(items)).size).toBe(5)
  })
})

describe('removeAndReindex', () => {
  it('удаляет элемент и закрывает дырку', () => {
    const result = removeAndReindex(rows('a', 'b', 'c'), 'b')
    expect(ids(result)).toEqual(['a', 'c'])
    expect(indexes(result)).toEqual([0, 1])
  })

  it('удаление отсутствующего id ничего не меняет', () => {
    const result = removeAndReindex(rows('a', 'b'), 'x')
    expect(ids(result)).toEqual(['a', 'b'])
    expect(indexes(result)).toEqual([0, 1])
  })
})

describe('orderPatch', () => {
  it('отдаёт только реально изменившиеся строки', () => {
    const before = rows('a', 'b', 'c')
    const after = reorderById(before, 'c', 'up')
    expect(orderPatch(before, after)).toEqual([
      { id: 'c', order_index: 1 },
      { id: 'b', order_index: 2 },
    ])
  })

  it('без изменений патч пустой', () => {
    const items = rows('a', 'b', 'c')
    expect(orderPatch(items, reindex(sortByOrder(items)))).toEqual([])
  })

  it('новые строки попадают в патч целиком', () => {
    expect(orderPatch([], rows('a', 'b'))).toEqual([
      { id: 'a', order_index: 0 },
      { id: 'b', order_index: 1 },
    ])
  })
})

describe('indexOfId', () => {
  it('возвращает позицию и -1 для чужого id', () => {
    const items = rows('a', 'b')
    expect(indexOfId(items, 'b')).toBe(1)
    expect(indexOfId(items, 'x')).toBe(-1)
  })
})
