import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate } from 'react-router'
import { MailCheck } from 'lucide-react'

import { Button, Card, CardBody, Field, Input, Spinner } from '@/components/ui'
import { formatClock } from '@/lib/format'

import { useAuth } from './AuthProvider'
import { authErrorMessage, isRateLimitError, normalizeEmail, useSignInWithOtp, validateEmail } from './api'

const RESEND_COOLDOWN_MS = 60_000

export function LoginPage() {
  const { session, loading } = useAuth()
  const signIn = useSignInWithOtp()

  const [email, setEmail] = useState('')
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())

  // Обратный отсчёт до повторной отправки. Один интервал на весь кулдаун.
  useEffect(() => {
    if (cooldownUntil === null) return
    const id = window.setInterval(() => {
      if (Date.now() >= cooldownUntil) setCooldownUntil(null)
      setNow(Date.now())
    }, 500)
    return () => window.clearInterval(id)
  }, [cooldownUntil])

  const secondsLeft =
    cooldownUntil === null ? 0 : Math.max(0, Math.ceil((cooldownUntil - now) / 1000))

  const send = (value: string) => {
    setFormError(null)
    signIn.mutate(value, {
      onSuccess: (sent) => {
        setSentTo(sent)
        setCooldownUntil(Date.now() + RESEND_COOLDOWN_MS)
        setNow(Date.now())
      },
      onError: (error) => {
        setFormError(authErrorMessage(error))
        // Ловим лимит писем: пусть кнопка сама подождёт, а не собирает новые отказы.
        if (isRateLimitError(error)) {
          setCooldownUntil(Date.now() + RESEND_COOLDOWN_MS)
          setNow(Date.now())
        }
      },
    })
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const error = validateEmail(email)
    setFieldError(error)
    if (error) return
    send(normalizeEmail(email))
  }

  if (loading) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-body" role="status">
        <Spinner size={22} className="text-ink" />
      </main>
    )
  }

  if (session) return <Navigate to="/" replace />

  return (
    <main className="flex min-h-dvh flex-col justify-center bg-body px-4 py-10 text-ink">
      <div className="mx-auto flex w-full max-w-[26rem] flex-col gap-6">
        <header className="flex flex-col gap-3">
          <h1 className="font-stencil text-4xl font-semibold tracking-mark uppercase">ПРЕДЕЛ</h1>
          {/* Гравированная линейка — подпись станции, та же, что в корпусе. */}
          <div aria-hidden className="rule-etch h-2 w-full" />
          <p className="text-sm leading-relaxed text-ink-muted">Дневник силовых тренировок</p>
        </header>

        <Card>
          <CardBody className="flex flex-col gap-4 py-4">
            {sentTo === null ? (
              <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
                <Field
                  label="почта"
                  hint="Пришлём ссылку для входа. Пароль не нужен"
                  error={fieldError ?? undefined}
                >
                  <Input
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    aria-label="почта"
                    invalid={Boolean(fieldError)}
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value)
                      if (fieldError) setFieldError(null)
                    }}
                  />
                </Field>

                <Button type="submit" size="lg" fullWidth loading={signIn.isPending}>
                  Прислать ссылку
                </Button>
              </form>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <span className="mark flex items-center gap-2 text-ok">
                    <MailCheck size={14} aria-hidden />
                    ссылка отправлена
                  </span>
                  <p className="text-sm text-ink-muted">
                    Письмо ушло на <span className="num break-all text-ink">{sentTo}</span>.
                    Открой ссылку на этом же устройстве — она сразу пустит внутрь.
                  </p>
                  <p className="text-xs text-ink-muted">Письма нет пару минут — загляни в спам.</p>
                </div>

                <div className="flex flex-col gap-2">
                  <Button
                    variant="outline"
                    size="lg"
                    fullWidth
                    loading={signIn.isPending}
                    disabled={secondsLeft > 0}
                    onClick={() => send(sentTo)}
                  >
                    Отправить ещё раз
                  </Button>
                  {secondsLeft > 0 ? (
                    <p className="mark text-center text-ink-muted">
                      повтор через{' '}
                      <span className="num text-ink">{formatClock(secondsLeft)}</span>
                    </p>
                  ) : null}
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  fullWidth
                  onClick={() => {
                    setSentTo(null)
                    setFormError(null)
                  }}
                >
                  Другая почта
                </Button>
              </div>
            )}

            {formError ? (
              <p role="alert" className="text-sm text-stamp-lit">
                {formError}
              </p>
            ) : null}
          </CardBody>
        </Card>

        <p className="text-center text-xs text-ink-muted">
          Вход по ссылке из письма. Никаких паролей — их нечего терять
        </p>
      </div>
    </main>
  )
}
