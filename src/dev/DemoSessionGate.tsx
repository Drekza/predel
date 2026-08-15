import { useState } from 'react'
import { Navigate, useSearchParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'

import { DEMO_SESSION_ID, seedDemoSession } from './demoSession'

/**
 * Дев-маршрут: наполняет кэш демо-тренировкой и уводит на настоящий
 * `/session/:sessionId`. Так главный экран продукта можно открыть и снять,
 * пока в базе пусто, — рисуют его при этом настоящие хуки и компоненты.
 */
export function DemoSessionGate() {
  const client = useQueryClient()
  const [params] = useSearchParams()
  // Кэш надо наполнить до редиректа, иначе экран сессии успеет сходить в сеть.
  // Инициализатор useState для этого и существует; операция идемпотентна.
  useState(() => {
    seedDemoSession(client)
    return true
  })

  // `?to=` позволяет открыть на демо-данных любой маршрут: итоги, конструктор.
  return <Navigate to={params.get('to') ?? `/session/${DEMO_SESSION_ID}`} replace />
}
