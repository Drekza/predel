import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'

import { env } from '@/lib/env'
import { registerOfflineExecutors } from '@/lib/offline/executors'
import { startQueueAutoFlush } from '@/lib/offline/queue'

import App from './App'
import './index.css'

// Очередь подходов должна ожить до первого рендера: неотправленные подходы
// прошлой сессии уйдут на сервер, даже если пользователь не открывал тренировку.
if (env.isConfigured) {
  registerOfflineExecutors()
  startQueueAutoFlush()
}

// Сервис-воркер PWA. autoUpdate: новая версия ставится молча, без диалогов.
registerSW({ immediate: true })

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('Не найден корневой элемент #root')

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
