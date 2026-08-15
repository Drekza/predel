import { TriangleAlert } from 'lucide-react'

import { env } from '@/lib/env'
import { Card, CardBody, CardHeader } from '@/components/ui'

const ENV_FILE = '.env.local'

/**
 * Supabase не настроен: без ключей приложение не покажет ни одного экрана,
 * поэтому вместо белого окна объясняем, чего не хватает и куда это класть.
 */
export function NotConfiguredScreen() {
  const missing = env.missing.length > 0 ? env.missing : ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']

  return (
    <main className="flex min-h-dvh items-center justify-center bg-body px-4 py-10 text-ink">
      <div className="w-full max-w-[30rem]">
        <Card>
          <CardHeader>
            <span className="flex items-center gap-2 text-warn">
              <TriangleAlert size={14} aria-hidden />
              Нет подключения к базе
            </span>
          </CardHeader>
          <CardBody className="flex flex-col gap-4">
            <p className="text-sm text-ink-muted">
              Приложение не знает, к какому проекту Supabase подключаться. Ключи задаются
              переменными окружения — без них не заработает ни вход, ни тренировки.
            </p>

            <div className="flex flex-col gap-1.5">
              <span className="mark text-ink-muted">Не хватает</span>
              <ul className="recess flex flex-col gap-1 rounded-sm px-3 py-2.5">
                {missing.map((key) => (
                  <li key={key} className="num text-xs leading-relaxed text-stamp-lit">
                    {key}
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="mark text-ink-muted">Что сделать</span>
              <ol className="flex list-decimal flex-col gap-1.5 pl-4 text-sm text-ink-muted">
                <li>
                  Скопируй <span className="num text-xs text-ink">.env.example</span> в{' '}
                  <span className="num text-xs text-ink">{ENV_FILE}</span> в корне проекта.
                </li>
                <li>
                  Возьми значения в панели Supabase, в настройках проекта, раздел{' '}
                  <span className="num text-xs text-ink">API</span>: адрес проекта и публичный
                  анонимный ключ.
                </li>
                <li>Перезапусти сборку — переменные читаются только при старте.</li>
              </ol>
            </div>

            <pre className="recess num overflow-x-auto rounded-sm px-3 py-2.5 text-xs leading-relaxed text-ink">
              {`VITE_SUPABASE_URL=https://<проект>.supabase.co\nVITE_SUPABASE_ANON_KEY=<ключ anon public>`}
            </pre>

            <p className="text-xs text-ink-muted">
              Анонимный ключ публичный, он попадает в сборку. Серверный ключ сюда класть нельзя.
            </p>
          </CardBody>
        </Card>
      </div>
    </main>
  )
}
