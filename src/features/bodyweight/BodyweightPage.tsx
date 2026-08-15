import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { LineChart, Trash2 } from 'lucide-react'

import {
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Field,
  Input,
  NumberStepper,
  Segmented,
  Skeleton,
} from '@/components/ui'
import { EM_DASH, formatDate, formatNumber, parseDateKey, toDateKey } from '@/lib/format'
// Модуль, а не '@/features/auth': индекс фичи тянет за собой её экраны,
// а сюда нужен только контекст сессии.
import { useAuth } from '@/features/auth/AuthProvider'
import { BODYWEIGHT_MAX, BODYWEIGHT_MIN, BODYWEIGHT_STEP, validateBodyweight } from '@/features/auth/api'

import { WeightChart } from './WeightChart'
import {
  bodyweightErrorMessage,
  useBodyweightEntries,
  useDeleteBodyweightEntry,
  useSaveBodyweight,
} from './api'
import { PERIODS, filterByPeriod, periodDays, summarize, type PeriodValue, type WeightPoint } from './series'

/** Экран веса: журнал измерений и его график. */
export function BodyweightPage() {
  const { user, profile } = useAuth()
  const entriesQuery = useBodyweightEntries(user?.id)
  const saveEntry = useSaveBodyweight(user?.id)
  const deleteEntry = useDeleteBodyweightEntry(user?.id)

  const [period, setPeriod] = useState<PeriodValue>('90')
  const [measuredOn, setMeasuredOn] = useState(() => toDateKey())
  // undefined — поле ещё не трогали, показываем подставленное значение.
  const [weightDraft, setWeightDraft] = useState<number | null | undefined>(undefined)
  const [formError, setFormError] = useState<string | null>(null)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  const entries = useMemo(() => entriesQuery.data ?? [], [entriesQuery.data])

  const points: WeightPoint[] = useMemo(
    () => entries.map((entry) => ({ date: entry.measured_on, kg: Number(entry.weight_kg) })),
    [entries],
  )

  const shown = useMemo(
    () => filterByPeriod(points, periodDays(period)),
    [points, period],
  )
  const summary = useMemo(() => summarize(shown), [shown])

  // Уже записанное за выбранную дату правится, а не дублируется.
  const entryForDate = entries.find((entry) => entry.measured_on === measuredOn) ?? null
  const fallbackWeight = entryForDate
    ? Number(entryForDate.weight_kg)
    : (points[points.length - 1]?.kg ?? profile?.bodyweight_kg ?? null)
  const weight = weightDraft === undefined ? fallbackWeight : weightDraft

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError(null)

    if (weight === null) {
      setFormError('Введи вес — его и запишем')
      return
    }
    const weightError = validateBodyweight(weight)
    if (weightError) {
      setFormError(weightError)
      return
    }
    if (parseDateKey(measuredOn) === null) {
      setFormError('Проверь дату измерения')
      return
    }
    if (measuredOn > toDateKey()) {
      setFormError('Дата из будущего — вес ещё не измерен')
      return
    }

    saveEntry.mutate(
      { measuredOn, weightKg: weight },
      {
        onSuccess: () => setWeightDraft(undefined),
        onError: (error) => setFormError(bodyweightErrorMessage(error)),
      },
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <span>записать вес</span>
          <span className="num normal-case tracking-normal">
            {profile?.bodyweight_kg === null || profile?.bodyweight_kg === undefined
              ? EM_DASH
              : `${formatNumber(profile.bodyweight_kg, 1)} кг`}
          </span>
        </CardHeader>
        <CardBody>
          <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
            <Field
              label="дата"
              hint={entryForDate ? 'За этот день вес уже записан — сохранение исправит его' : undefined}
            >
              <Input
                type="date"
                max={toDateKey()}
                aria-label="дата измерения"
                value={measuredOn}
                onChange={(e) => {
                  setMeasuredOn(e.target.value)
                  setWeightDraft(undefined)
                  setFormError(null)
                }}
              />
            </Field>

            <Field label="вес тела" hint="Утром, натощак — так цифры сравнимы между собой">
              <NumberStepper
                value={weight}
                onChange={(value) => {
                  setWeightDraft(value)
                  setFormError(null)
                }}
                step={BODYWEIGHT_STEP}
                min={BODYWEIGHT_MIN}
                max={BODYWEIGHT_MAX}
                precision={1}
                unit="кг"
                size="lg"
                aria-label="вес тела"
              />
            </Field>

            <Button type="submit" fullWidth loading={saveEntry.isPending}>
              Записать
            </Button>

            {formError ? (
              <p role="alert" className="text-sm text-stamp-lit">
                {formError}
              </p>
            ) : null}
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <span>динамика</span>
          {summary ? (
            <span className="num normal-case tracking-normal text-ink">
              {summary.delta > 0 ? '+' : ''}
              {formatNumber(summary.delta, 1)} кг
            </span>
          ) : null}
        </CardHeader>
        <CardBody className="flex flex-col gap-3">
          <Segmented
            options={PERIODS.map((p) => ({ value: p.value, label: p.label }))}
            value={period}
            onChange={setPeriod}
            aria-label="период графика"
          />

          {entriesQuery.isPending ? (
            <Skeleton className="h-36 w-full" />
          ) : shown.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-muted">
              {points.length === 0
                ? 'Ни одного измерения. Запиши первое — график начнётся с него'
                : 'За этот период измерений нет'}
            </p>
          ) : (
            <>
              <WeightChart points={shown} />
              {summary ? (
                <dl className="grid grid-cols-3 gap-2">
                  <Readout label="сейчас" value={`${formatNumber(summary.current, 1)} кг`} />
                  <Readout label="минимум" value={`${formatNumber(summary.min, 1)} кг`} />
                  <Readout label="максимум" value={`${formatNumber(summary.max, 1)} кг`} />
                </dl>
              ) : null}
            </>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <span>измерения</span>
          {points.length > 0 ? (
            <span className="num normal-case tracking-normal">{points.length}</span>
          ) : null}
        </CardHeader>
        <CardBody className="flex flex-col gap-2">
          {entriesQuery.isPending ? (
            <>
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-11 w-full" />
            </>
          ) : entries.length === 0 ? (
            <EmptyState
              icon={<LineChart size={22} aria-hidden />}
              title="Журнал пуст"
              hint="Взвесился — записал. Двух точек хватит, чтобы увидеть направление."
            />
          ) : (
            entries
              .slice()
              .reverse()
              .map((entry, index, list) => {
                const previous = list[index + 1]
                const delta = previous
                  ? Number(entry.weight_kg) - Number(previous.weight_kg)
                  : null
                return (
                  <EntryRow
                    key={entry.id}
                    date={entry.measured_on}
                    kg={Number(entry.weight_kg)}
                    delta={delta}
                    confirming={confirmingId === entry.id}
                    busy={deleteEntry.isPending && confirmingId === entry.id}
                    onConfirm={() => setConfirmingId(entry.id)}
                    onCancel={() => setConfirmingId(null)}
                    onDelete={() => {
                      deleteEntry.mutate(entry.id, { onSettled: () => setConfirmingId(null) })
                    }}
                  />
                )
              })
          )}
        </CardBody>
      </Card>
    </div>
  )
}

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div className="recess flex flex-col gap-1 rounded-sm px-2.5 py-2">
      <dt className="mark text-ink-muted">{label}</dt>
      <dd className="num text-tally text-ink">{value}</dd>
    </div>
  )
}

type EntryRowProps = {
  date: string
  kg: number
  /** Разница с предыдущим измерением; null — оно первое. */
  delta: number | null
  confirming: boolean
  busy: boolean
  onConfirm: () => void
  onCancel: () => void
  onDelete: () => void
}

/** Строка журнала. Удаление подтверждается на месте — модалок в системе нет. */
function EntryRow({
  date,
  kg,
  delta,
  confirming,
  busy,
  onConfirm,
  onCancel,
  onDelete,
}: EntryRowProps) {
  const parsed = parseDateKey(date)

  return (
    <div className="bezel flex items-center gap-3 rounded-sm bg-panel px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="num text-xs text-ink-muted">{parsed ? formatDate(parsed) : date}</p>
        <p className="num mt-1 text-tally text-ink">
          {formatNumber(kg, 1)} <span className="text-xs text-ink-muted">кг</span>
        </p>
      </div>

      {delta === null ? null : (
        <span className="plate num shrink-0 rounded-xs px-1.5 py-0.5 text-xs">
          {delta > 0 ? '+' : ''}
          {formatNumber(delta, 1)}
        </span>
      )}

      {confirming ? (
        <div className="flex shrink-0 gap-1">
          <Button variant="danger" size="sm" loading={busy} onClick={onDelete}>
            Удалить
          </Button>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Отмена
          </Button>
        </div>
      ) : (
        <Button variant="ghost" size="sm" aria-label={`удалить измерение ${date}`} onClick={onConfirm}>
          <Trash2 size={16} aria-hidden />
        </Button>
      )}
    </div>
  )
}
