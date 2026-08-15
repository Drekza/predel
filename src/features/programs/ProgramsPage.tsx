import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Check, ChevronRight, Layers, Plus, Trash2 } from 'lucide-react'

import {
  Button,
  Card,
  CardBody,
  CardFooter,
  EmptyState,
  Field,
  Input,
  Skeleton,
} from '@/components/ui'
import { pluralRu } from '@/lib/format'

import {
  newId,
  useCreateProgram,
  useDeleteProgram,
  useProgramsList,
  useSetActiveProgram,
  type ProgramListItem,
} from './api'

const PROGRAM_NAME_MAX = 64

export function ProgramsPage() {
  const { data: programs, isPending, isError } = useProgramsList()
  const createProgram = useCreateProgram()
  const setActiveProgram = useSetActiveProgram()
  const deleteProgram = useDeleteProgram()
  const navigate = useNavigate()

  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  const list = programs ?? []

  const openCreate = () => {
    setNewName('')
    setCreating(true)
  }

  const submitCreate = () => {
    const name = newName.trim()
    if (!name) return
    setCreating(false)
    setNewName('')
    createProgram.mutate(
      { id: newId(), name, makeActive: list.length === 0 },
      { onSuccess: (program) => navigate(`/programs/${program.id}`) },
    )
  }

  return (
    <div className="flex flex-col gap-4 px-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+5rem)]">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-mono text-hud uppercase text-text">Программы</h1>
        {list.length > 0 && !creating ? (
          <Button size="sm" variant="outline" onClick={openCreate}>
            <Plus size={16} aria-hidden />
            Новая
          </Button>
        ) : null}
      </div>

      {creating ? (
        <Card>
          <CardBody className="flex flex-col gap-3">
            <Field label="Название программы" hint="Например: «Верх-низ, 4 дня»">
              <Input
                autoFocus
                value={newName}
                maxLength={PROGRAM_NAME_MAX}
                placeholder="Название"
                aria-label="название новой программы"
                onChange={(event) => setNewName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    submitCreate()
                  } else if (event.key === 'Escape') {
                    event.preventDefault()
                    setCreating(false)
                  }
                }}
              />
            </Field>
            <div className="flex gap-2">
              <Button
                fullWidth
                onClick={submitCreate}
                disabled={newName.trim().length === 0}
                loading={createProgram.isPending}
              >
                Создать
              </Button>
              <Button variant="ghost" onClick={() => setCreating(false)}>
                Отмена
              </Button>
            </div>
          </CardBody>
        </Card>
      ) : null}

      {isPending ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : isError ? (
        <EmptyState
          title="Не удалось загрузить программы"
          hint="Проверь связь и потяни экран, чтобы обновить."
        />
      ) : list.length === 0 && !creating ? (
        <EmptyState
          icon={<Layers size={28} aria-hidden />}
          title="Программ пока нет"
          hint="Программа — это дни тренировок с упражнениями и целями. С неё начинается всё остальное."
          action={
            <Button onClick={openCreate}>
              <Plus size={16} aria-hidden />
              Создать программу
            </Button>
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {list.map((program) => (
            <li key={program.id}>
              <ProgramCard
                program={program}
                confirming={confirmingId === program.id}
                busy={setActiveProgram.isPending || deleteProgram.isPending}
                onToggleConfirm={() =>
                  setConfirmingId((prev) => (prev === program.id ? null : program.id))
                }
                onDelete={() => {
                  setConfirmingId(null)
                  deleteProgram.mutate({ programId: program.id })
                }}
                onActivate={() => setActiveProgram.mutate({ programId: program.id })}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

type ProgramCardProps = {
  program: ProgramListItem
  confirming: boolean
  busy: boolean
  onToggleConfirm: () => void
  onDelete: () => void
  onActivate: () => void
}

function ProgramCard({
  program,
  confirming,
  busy,
  onToggleConfirm,
  onDelete,
  onActivate,
}: ProgramCardProps) {
  const daysLabel =
    program.dayCount === 0
      ? 'дней нет'
      : `${program.dayCount} ${pluralRu(program.dayCount, 'день', 'дня', 'дней')}`

  return (
    <Card>
      <CardBody className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <Link
            to={`/programs/${program.id}`}
            className="group flex min-w-0 flex-1 items-center gap-2"
          >
            <span className="min-w-0 flex-1 truncate text-base text-text group-hover:text-accent">
              {program.name}
            </span>
            <ChevronRight
              size={18}
              aria-hidden
              className="shrink-0 text-muted group-hover:text-accent"
            />
          </Link>
        </div>

        <div className="flex items-center gap-2 font-mono text-hud uppercase">
          {program.is_active ? (
            <span className="inline-flex items-center gap-1 text-accent">
              <Check size={12} aria-hidden />
              активная
            </span>
          ) : null}
          <span className="text-muted">{daysLabel}</span>
        </div>

        {program.dayNames.length > 0 ? (
          <p className="truncate text-xs text-muted">{program.dayNames.join(' · ')}</p>
        ) : null}
      </CardBody>

      {confirming ? (
        <CardFooter className="bg-danger/5">
          <span className="flex-1 text-xs text-muted">
            Удалить программу вместе с днями и упражнениями?
          </span>
          <Button size="sm" variant="danger" onClick={onDelete}>
            Удалить
          </Button>
          <Button size="sm" variant="ghost" onClick={onToggleConfirm}>
            Отмена
          </Button>
        </CardFooter>
      ) : (
        <CardFooter>
          {program.is_active ? (
            <Link to={`/programs/${program.id}`} className="flex-1">
              <Button variant="outline" size="sm" fullWidth>
                Открыть
              </Button>
            </Link>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              disabled={busy}
              onClick={onActivate}
            >
              Сделать активной
            </Button>
          )}
          <button
            type="button"
            aria-label="удалить программу"
            onClick={onToggleConfirm}
            className="tap grid h-11 w-11 shrink-0 place-items-center rounded-md text-muted transition-colors duration-100 ease-hud hover:bg-surface-2 hover:text-danger"
          >
            <Trash2 size={16} aria-hidden />
          </button>
        </CardFooter>
      )}
    </Card>
  )
}
