import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { ArrowLeft, CalendarDays, Plus } from 'lucide-react'

import { Button, EmptyState, Input, Skeleton } from '@/components/ui'

import { newId, useCreateDay, useProgram, useUpdateProgram } from './api'
import { ProgramDayEditor } from './ProgramDayEditor'

const PROGRAM_NAME_MAX = 64

export function ProgramEditorPage() {
  const params = useParams<{ programId: string }>()
  const programId = params.programId ?? ''

  const { data: program, isPending, isError } = useProgram(programId)
  const updateProgram = useUpdateProgram()
  const createDay = useCreateDay(programId)

  // Пока правки нет — показываем серверное значение, без синхронизации через эффект.
  const [nameDraft, setNameDraft] = useState<string | null>(null)
  const name = nameDraft ?? program?.name ?? ''

  const commitName = () => {
    if (!program) return
    const trimmed = name.trim()
    if (!trimmed || trimmed === program.name) {
      setNameDraft(null)
      return
    }
    // Черновик держим до ответа: иначе поле на миг мигнёт старым именем.
    updateProgram.mutate(
      { programId, name: trimmed },
      { onSettled: () => setNameDraft(null) },
    )
  }

  const addDay = () => {
    const count = program?.days.length ?? 0
    createDay.mutate({ id: newId(), name: `День ${count + 1}` })
  }

  return (
    <div className="flex flex-col gap-4 px-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+5rem)]">
      <Link
        to="/programs"
        className="mark inline-flex items-center gap-1.5 text-ink-muted transition-colors duration-100 ease-station hover:text-ink"
      >
        <ArrowLeft size={14} aria-hidden />
        Программы
      </Link>

      {isPending && programId ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : isError || !program ? (
        <EmptyState
          title="Программа не найдена"
          hint="Возможно, её удалили с другого устройства."
          action={
            <Link to="/programs">
              <Button variant="outline">К списку программ</Button>
            </Link>
          }
        />
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="mark text-ink-muted">Название программы</span>
              {program.is_active ? (
                <span className="stamped mark rounded-xs px-1.5 py-0.5">активная</span>
              ) : null}
            </div>
            <Input
              value={name}
              maxLength={PROGRAM_NAME_MAX}
              aria-label="название программы"
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
            />
          </div>

          {program.days.length === 0 ? (
            <EmptyState
              icon={<CalendarDays size={28} aria-hidden />}
              title="В программе нет дней"
              hint="День — это одна тренировка: «Верх А», «Ноги», «Тяга»."
              action={
                <Button onClick={addDay} loading={createDay.isPending}>
                  <Plus size={16} aria-hidden />
                  Добавить день
                </Button>
              }
            />
          ) : (
            <div className="flex flex-col gap-4">
              {program.days.map((day, index) => (
                <ProgramDayEditor
                  key={day.id}
                  programId={programId}
                  day={day}
                  index={index}
                  canMoveUp={index > 0}
                  canMoveDown={index < program.days.length - 1}
                />
              ))}

              <Button
                variant="outline"
                fullWidth
                onClick={addDay}
                loading={createDay.isPending}
              >
                <Plus size={16} aria-hidden />
                Добавить день
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
