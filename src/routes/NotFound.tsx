import { Link } from 'react-router'
import { Compass } from 'lucide-react'

import { Button, Card, CardBody } from '@/components/ui'

/** Экран для несуществующего адреса. Живёт вне AppShell — нижняя навигация тут лишняя. */
export function NotFound() {
  return (
    <main className="hud-grid flex min-h-dvh items-center justify-center bg-bg px-4 py-10 text-text">
      <Card className="w-full max-w-[26rem]">
        <CardBody className="flex flex-col items-center gap-4 py-8 text-center">
          <span className="flex items-center gap-2 font-mono text-hud uppercase text-muted">
            <Compass size={14} aria-hidden />
            сигнал потерян
          </span>
          <p className="font-mono text-4xl font-semibold tracking-hud text-accent">404</p>
          <p className="text-sm text-muted">
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
