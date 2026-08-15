import { Link } from 'react-router'
import { Compass } from 'lucide-react'

import { Button, Card, CardBody } from '@/components/ui'

/** Экран для несуществующего адреса. Живёт вне AppShell — нижняя навигация тут лишняя. */
export function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-body px-4 py-10 text-ink">
      <Card className="w-full max-w-[26rem]">
        <CardBody className="flex flex-col items-center gap-4 py-8 text-center">
          <span className="mark flex items-center gap-2 text-ink-muted">
            <Compass size={14} aria-hidden />
            сигнал потерян
          </span>
          {/* Код ответа читают — значит, он стоит на пластине, а не на корпусе. */}
          <p className="plate plate-etch num rounded-sm px-6 pt-3 pb-5 text-4xl font-semibold tracking-mark">
            404
          </p>
          <p className="text-sm text-ink-muted">
            Такой страницы нет. Похоже, ссылка устарела или в адресе опечатка.
          </p>
          <Link to="/" className="w-full">
            <Button size="lg" fullWidth>
              На главную
            </Button>
          </Link>
        </CardBody>
      </Card>
    </main>
  )
}
