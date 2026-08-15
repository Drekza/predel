import { useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { ScanLine } from 'lucide-react'

import { Button, Card, CardBody, Field, Input, NumberStepper, Spinner } from '@/components/ui'

import { useAuth } from './AuthProvider'
import {
  BODYWEIGHT_MAX,
  BODYWEIGHT_MIN,
  BODYWEIGHT_STEP,
  NICKNAME_MAX,
  profileErrorMessage,
  useUpdateProfile,
  validateBodyweight,
  validateNickname,
} from './api'

export function OnboardingPage() {
  const { session, user, profile, loading } = useAuth()
  const navigate = useNavigate()
  const updateProfile = useUpdateProfile(user?.id)

  const [nickname, setNickname] = useState(() => profile?.nickname ?? '')
  const [bodyweight, setBodyweight] = useState<number | null>(() => profile?.bodyweight_kg ?? null)
  const [nicknameError, setNicknameError] = useState<string | null>(null)
  const [weightError, setWeightError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [loadedProfileId, setLoadedProfileId] = useState<string | null>(profile?.id ?? null)

  // Триггер регистрации уже придумал ник по адресу почты — подставим его как черновик.
  if (profile && loadedProfileId !== profile.id) {
    setLoadedProfileId(profile.id)
    setNickname(profile.nickname)
    setBodyweight(profile.bodyweight_kg)
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const nickErr = validateNickname(nickname)
    const weightErr = validateBodyweight(bodyweight)
    setNicknameError(nickErr)
    setWeightError(weightErr)
    setFormError(null)
    if (nickErr || weightErr) return

    updateProfile.mutate(
      { nickname, bodyweightKg: bodyweight, completeOnboarding: true },
      {
        onSuccess: () => {
          void navigate('/', { replace: true })
        },
        onError: (error) => setFormError(profileErrorMessage(error)),
      },
    )
  }

  if (loading) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-bg" role="status">
        <Spinner size={22} className="text-accent" />
      </main>
    )
  }

  if (!session) return <Navigate to="/login" replace />
  if (profile?.onboarded_at) return <Navigate to="/" replace />

  return (
    <main className="hud-grid flex min-h-dvh flex-col justify-center bg-bg px-4 py-10 text-text">
      <div className="mx-auto flex w-full max-w-[26rem] flex-col gap-6">
        <header className="flex flex-col gap-3">
          <span className="flex items-center gap-2 font-mono text-hud uppercase text-accent">
            <ScanLine size={14} aria-hidden />
            калибровка
          </span>
          <h1 className="font-mono text-2xl font-semibold tracking-hud uppercase">Знакомимся</h1>
          <p className="text-sm text-muted">
            Два поля — и можно идти в зал. Всё остальное появится по ходу тренировок.
          </p>
        </header>

        <Card>
          <CardBody className="py-4">
            <form className="flex flex-col gap-5" onSubmit={handleSubmit} noValidate>
              <Field
                label="как тебя звать"
                hint={`От 2 до ${NICKNAME_MAX} символов. Это имя увидят в круге`}
                error={nicknameError ?? undefined}
              >
                <Input
                  type="text"
                  autoComplete="nickname"
                  maxLength={NICKNAME_MAX}
                  aria-label="ник"
                  invalid={Boolean(nicknameError)}
                  value={nickname}
                  onChange={(e) => {
                    setNickname(e.target.value)
                    if (nicknameError) setNicknameError(null)
                  }}
                />
              </Field>

              <Field
                label="вес тела"
                hint="Нужен для отжиманий и подтягиваний. Можно пропустить и добавить позже"
                error={weightError ?? undefined}
              >
                <NumberStepper
                  value={bodyweight}
                  onChange={(value) => {
                    setBodyweight(value)
                    if (weightError) setWeightError(null)
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

              <Button type="submit" size="lg" fullWidth loading={updateProfile.isPending}>
                Начать
              </Button>

              {formError ? (
                <p role="alert" className="text-sm text-danger">
                  {formError}
                </p>
              ) : null}
            </form>
          </CardBody>
        </Card>
      </div>
    </main>
  )
}
