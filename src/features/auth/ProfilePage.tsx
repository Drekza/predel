import { useState } from 'react'
import type { FormEvent } from 'react'
import { CheckCheck, CircleAlert, CloudUpload, LogOut, RefreshCw, Trash2 } from 'lucide-react'

import {
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  Field,
  Input,
  NumberStepper,
  Skeleton,
} from '@/components/ui'
import { pluralRu } from '@/lib/format'
import { useOfflineQueue } from '@/lib/offline/queue'

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

/** Держится в одну строку с полем version в package.json. */
const APP_VERSION = '0.1.0'

export function ProfilePage() {
  const { user, profile, signOut, signingOut } = useAuth()
  const updateProfile = useUpdateProfile(user?.id)
  const queue = useOfflineQueue()

  const [nickname, setNickname] = useState(() => profile?.nickname ?? '')
  const [bodyweight, setBodyweight] = useState<number | null>(() => profile?.bodyweight_kg ?? null)
  const [nicknameError, setNicknameError] = useState<string | null>(null)
  const [weightError, setWeightError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [confirmingSignOut, setConfirmingSignOut] = useState(false)
  const [signOutError, setSignOutError] = useState<string | null>(null)
  const [loadedProfileId, setLoadedProfileId] = useState<string | null>(profile?.id ?? null)

  // Профиль подъехал позже (или сменился пользователь) — подставляем его в поля.
  if (profile && loadedProfileId !== profile.id) {
    setLoadedProfileId(profile.id)
    setNickname(profile.nickname)
    setBodyweight(profile.bodyweight_kg)
  }

  if (!profile) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-40" />
        <Skeleton className="h-28" />
      </div>
    )
  }

  const dirty = nickname !== profile.nickname || bodyweight !== profile.bodyweight_kg

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const nickErr = validateNickname(nickname)
    const weightErr = validateBodyweight(bodyweight)
    setNicknameError(nickErr)
    setWeightError(weightErr)
    setFormError(null)
    if (nickErr || weightErr) return

    updateProfile.mutate(
      { nickname, bodyweightKg: bodyweight },
      { onError: (error) => setFormError(profileErrorMessage(error)) },
    )
  }

  const handleSignOut = () => {
    setSignOutError(null)
    void signOut().catch((error: unknown) => {
      setConfirmingSignOut(false)
      setSignOutError(profileErrorMessage(error))
    })
  }

  const failedCount = queue.failed.length
  const firstFailedError = queue.failed[0]?.lastError

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <span>профиль</span>
          <span className="font-mono normal-case tracking-normal text-muted">
            {user?.email ?? '—'}
          </span>
        </CardHeader>

        <CardBody>
          <form className="flex flex-col gap-5" onSubmit={handleSubmit} noValidate>
            <Field
              label="ник"
              hint={`До ${NICKNAME_MAX} символов`}
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
                  if (updateProfile.isSuccess) updateProfile.reset()
                }}
              />
            </Field>

            <Field
              label="вес тела"
              hint="Влияет на упражнения с собственным весом"
              error={weightError ?? undefined}
            >
              <NumberStepper
                value={bodyweight}
                onChange={(value) => {
                  setBodyweight(value)
                  if (weightError) setWeightError(null)
                  if (updateProfile.isSuccess) updateProfile.reset()
                }}
                step={BODYWEIGHT_STEP}
                min={BODYWEIGHT_MIN}
                max={BODYWEIGHT_MAX}
                precision={1}
                unit="кг"
                aria-label="вес тела"
              />
            </Field>

            <div className="flex items-center gap-3">
              <Button
                type="submit"
                fullWidth
                disabled={!dirty}
                loading={updateProfile.isPending}
              >
                Сохранить
              </Button>
              {updateProfile.isSuccess ? (
                <span className="shrink-0 font-mono text-hud uppercase text-ok">сохранено</span>
              ) : null}
            </div>

            {formError ? (
              <p role="alert" className="text-sm text-danger">
                {formError}
              </p>
            ) : null}
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <span>синхронизация</span>
        </CardHeader>
        <CardBody className="flex flex-col gap-3">
          {queue.pending === 0 && failedCount === 0 ? (
            <p className="flex items-center gap-2 text-sm text-ok">
              <CheckCheck size={16} aria-hidden />
              Всё отправлено на сервер
            </p>
          ) : null}

          {queue.pending > 0 ? (
            <div className="flex flex-col gap-2">
              <p className="flex items-center gap-2 text-sm text-text">
                <CloudUpload size={16} className="text-accent" aria-hidden />
                <span className="font-mono tabular-nums">{queue.pending}</span>
                {pluralRu(queue.pending, 'операция ждёт', 'операции ждут', 'операций ждут')} отправки
              </p>
              <Button variant="outline" size="sm" onClick={queue.flush}>
                Отправить сейчас
              </Button>
            </div>
          ) : null}

          {failedCount > 0 ? (
            <div className="flex flex-col gap-2">
              <p className="flex items-center gap-2 text-sm text-danger">
                <CircleAlert size={16} aria-hidden />
                <span className="font-mono tabular-nums">{failedCount}</span>
                {pluralRu(failedCount, 'операция не ушла', 'операции не ушли', 'операций не ушли')}
              </p>
              {firstFailedError ? <p className="text-xs text-muted">{firstFailedError}</p> : null}
              <p className="text-xs text-muted">
                Пока они в очереди, остальное на сервер не уходит
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={queue.retryFailed}>
                  <RefreshCw size={14} aria-hidden />
                  Повторить
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    // Сервер отказывает всегда — единственный выход разблокировать очередь.
                    for (const op of queue.failed) queue.discard(op.id)
                  }}
                >
                  <Trash2 size={14} aria-hidden />
                  Удалить
                </Button>
              </div>
            </div>
          ) : null}

          <p className="text-xs text-muted">
            Подходы пишутся сразу на экране, а на сервер уходят фоном. Пока очередь не пуста,
            приложение лучше не закрывать
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <span>приложение</span>
          <span className="font-mono tabular-nums normal-case tracking-normal">
            версия {APP_VERSION}
          </span>
        </CardHeader>
        <CardFooter className="flex-col items-stretch gap-2">
          {confirmingSignOut ? (
            <>
              <p className="text-sm text-muted">
                Выйти? Все тренировки останутся на сервере, вход снова по ссылке из письма
              </p>
              <div className="flex gap-2">
                <Button
                  variant="danger"
                  fullWidth
                  loading={signingOut}
                  onClick={handleSignOut}
                >
                  Да, выйти
                </Button>
                <Button variant="ghost" fullWidth onClick={() => setConfirmingSignOut(false)}>
                  Отмена
                </Button>
              </div>
            </>
          ) : (
            <Button variant="outline" fullWidth onClick={() => setConfirmingSignOut(true)}>
              <LogOut size={16} aria-hidden />
              Выйти
            </Button>
          )}

          {signOutError ? (
            <p role="alert" className="text-sm text-danger">
              {signOutError}
            </p>
          ) : null}
        </CardFooter>
      </Card>
    </div>
  )
}
