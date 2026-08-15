import { useId, type ReactNode } from 'react'

type FieldProps = {
  label: string
  hint?: string
  error?: string
  children: ReactNode
}

/**
 * Группа «подпись + контрол». Не оборачивает детей в <label>: внутри часто
 * лежат степперы с кнопками, а клик по кнопке внутри label уводит фокус.
 */
export function Field({ label, hint, error, children }: FieldProps) {
  const id = useId()
  return (
    <div role="group" aria-labelledby={`${id}-label`} className="flex flex-col gap-1.5">
      <span id={`${id}-label`} className="mark text-ink-muted">
        {label}
      </span>
      {children}
      {error ? (
        <span className="text-xs text-stamp-lit">{error}</span>
      ) : hint ? (
        <span className="text-xs text-ink-muted">{hint}</span>
      ) : null}
    </div>
  )
}
