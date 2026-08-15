import { useState, type ReactNode } from 'react'
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'

import { Button, Card, CardBody, CardFooter, CardHeader, Input } from '@/components/ui'
import { ExercisePicker } from '@/features/exercises'
import { cn } from '@/lib/cn'
import { formatSetsWord } from '@/lib/format'
import type { Exercise, ProgramDayWithItems, ProgramItemUpdate } from '@/types/domain'

import {
  newId,
  useAddItem,
  useDeleteDay,
  useDeleteItem,
  useRenameDay,
  useReorderDays,
  useReorderItems,
  useUpdateItem,
} from './api'
import { ProgramItemRow } from './ProgramItemRow'
import type { Direction } from './reorder'

const DAY_NAME_MAX = 48

type ProgramDayEditorProps = {
  programId: string
  day: ProgramDayWithItems
  index: number
  canMoveUp: boolean
  canMoveDown: boolean
}

export function ProgramDayEditor({
  programId,
  day,
  index,
  canMoveUp,
  canMoveDown,
}: ProgramDayEditorProps) {
  const renameDay = useRenameDay(programId)
  const deleteDay = useDeleteDay(programId)
  const reorderDays = useReorderDays(programId)
  const addItem = useAddItem(programId)
  const updateItem = useUpdateItem(programId)
  const deleteItem = useDeleteItem(programId)
  const reorderItems = useReorderItems(programId)

  // Правка живёт в nameDraft; пока её нет, поле показывает серверное имя дня.
  const [nameDraft, setNameDraft] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)

  const name = nameDraft ?? day.name

  const commitName = () => {
    const trimmed = name.trim()
    setNameDraft(null)
    if (trimmed && trimmed !== day.name) renameDay.mutate({ dayId: day.id, name: trimmed })
  }

  // Шторку закрывает сам ExercisePicker, здесь остаётся только добавление.
  const handlePickExercise = (exercise: Exercise) => {
    addItem.mutate({ id: newId(), dayId: day.id, exercise })
  }

  const handleItemPatch = (itemId: string, patch: ProgramItemUpdate) => {
    updateItem.mutate({ dayId: day.id, itemId, patch })
  }

  const handleItemMove = (itemId: string, direction: Direction) => {
    reorderItems.mutate({ dayId: day.id, itemId, direction })
  }

  const totalSets = day.items.reduce((sum, item) => sum + item.target_sets, 0)

  return (
    <Card>
      <CardHeader className="items-start">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="font-mono text-hud tabular-nums text-accent">
            Д{String(index + 1).padStart(2, '0')}
          </span>
          <Input
            value={name}
            maxLength={DAY_NAME_MAX}
            aria-label="название дня"
            onChange={(event) => setNameDraft(event.target.value)}
            onBlur={commitName}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                event.currentTarget.blur()
              } else if (event.key === 'Escape') {
                event.preventDefault()
                setNameDraft(null)
              }
            }}
            className="h-11 border-transparent bg-transparent px-2 text-sm normal-case tracking-normal text-text"
          />
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <HeaderButton
            label="переместить день выше"
            disabled={!canMoveUp}
            onClick={() => reorderDays.mutate({ dayId: day.id, direction: 'up' })}
          >
            <ChevronUp size={18} aria-hidden />
          </HeaderButton>
          <HeaderButton
            label="переместить день ниже"
            disabled={!canMoveDown}
            onClick={() => reorderDays.mutate({ dayId: day.id, direction: 'down' })}
          >
            <ChevronDown size={18} aria-hidden />
          </HeaderButton>
          <HeaderButton
            label="удалить день"
            danger
            onClick={() => setConfirmingDelete((prev) => !prev)}
          >
            <Trash2 size={16} aria-hidden />
          </HeaderButton>
        </div>
      </CardHeader>

      {confirmingDelete ? (
        <div className="flex items-center gap-2 border-b border-line/70 bg-danger/5 px-4 py-2.5">
          <span className="flex-1 text-xs text-muted">
            Удалить день вместе с упражнениями?
          </span>
          <Button
            size="sm"
            variant="danger"
            onClick={() => {
              setConfirmingDelete(false)
              deleteDay.mutate({ dayId: day.id })
            }}
          >
            Удалить
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirmingDelete(false)}>
            Отмена
          </Button>
        </div>
      ) : null}

      <CardBody className="pt-3">
        {day.items.length === 0 ? (
          <p className="rounded-md border border-dashed border-line px-3 py-6 text-center text-sm text-muted">
            В дне пока нет упражнений
          </p>
        ) : (
          <>
            <p className="mb-2.5 font-mono text-hud uppercase text-muted">
              {day.items.length} упр · {formatSetsWord(totalSets)}
            </p>
            <ul className="flex flex-col gap-2.5">
              {day.items.map((item, itemIndex) => (
                <ProgramItemRow
                  key={item.id}
                  item={item}
                  index={itemIndex}
                  canMoveUp={itemIndex > 0}
                  canMoveDown={itemIndex < day.items.length - 1}
                  onMove={(direction) => handleItemMove(item.id, direction)}
                  onDelete={() => deleteItem.mutate({ dayId: day.id, itemId: item.id })}
                  onPatch={(patch) => handleItemPatch(item.id, patch)}
                />
              ))}
            </ul>
          </>
        )}
      </CardBody>

      <CardFooter>
        <Button variant="outline" fullWidth onClick={() => setPickerOpen(true)}>
          <Plus size={16} aria-hidden />
          Добавить упражнение
        </Button>
      </CardFooter>

      <ExercisePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={handlePickExercise}
        excludeIds={day.items.map((item) => item.exercise_id)}
      />
    </Card>
  )
}

function HeaderButton({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'tap grid h-11 w-11 place-items-center rounded-md',
        'transition-colors duration-100 ease-hud',
        disabled
          ? 'text-muted/40'
          : danger
            ? 'text-muted hover:bg-surface-2 hover:text-danger'
            : 'text-muted hover:bg-surface-2 hover:text-accent',
      )}
    >
      {children}
    </button>
  )
}
