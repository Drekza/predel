import { Link, isRouteErrorResponse, useRouteError } from 'react-router'
import { TriangleAlert } from 'lucide-react'

import { env } from '@/lib/env'
import { Button, Card, CardBody, CardHeader } from '@/components/ui'

import { NotFound } from './NotFound'

/** Текст ошибки для строчки диагностики. Пользователю сырьё не показываем. */
function technicalDetails(error: unknown): string | null {
  if (isRouteErrorResponse(error)) return `${error.status} ${error.statusText}`
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return null
}

/** Обвал загрузки чанка после деплоя лечится перезагрузкой, а не жалобой. */
function isChunkLoadError(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error ?? '')
  return /dynamically imported module|chunk|importing a module script failed/i.test(text)
}

/**
 * Корневой errorElement роутера. Ловит всё, что упало при рендере маршрута,
 * чтобы вместо белого экрана человек видел объяснение и кнопку выхода.
 */
export function ErrorBoundary() {
  const error = useRouteError()

  if (isRouteErrorResponse(error) && error.status === 404) return <NotFound />

  const chunk = isChunkLoadError(error)
  const details = technicalDetails(error)

  return (
    <main className="flex min-h-dvh items-center justify-center bg-body px-4 py-10 text-ink">
      <Card className="w-full max-w-[26rem]">
        <CardHeader>
          <span className="flex items-center gap-2 text-stamp-lit">
            <TriangleAlert size={14} aria-hidden />
            сбой экрана
          </span>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          <p className="text-sm text-ink-muted">
            {chunk
              ? 'Приложение обновилось, пока страница была открыта. Перезагрузи её — данные тренировки сохранены.'
              : 'Что-то пошло не так при отрисовке экрана. Записанные подходы никуда не делись: они лежат в очереди и уйдут на сервер.'}
          </p>

          <div className="flex flex-col gap-2">
            <Button size="lg" fullWidth onClick={() => window.location.reload()}>
              Перезагрузить
            </Button>
            <Link to="/" className="w-full">
              <Button variant="outline" size="md" fullWidth>
                На главную
              </Button>
            </Link>
          </div>

          {env.isDev && details ? (
            <pre className="recess num overflow-x-auto rounded-sm border border-edge px-3 py-2.5 text-xs leading-relaxed text-ink-muted">
              {details}
            </pre>
          ) : null}
        </CardBody>
      </Card>
    </main>
  )
}
