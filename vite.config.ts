import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * Сайт живёт на GitHub Pages в подпапке репозитория: drekza.github.io/predel/.
 * Свой домен появится — сюда придёт «/», и больше ничего менять не придётся:
 * все пути внутри приложения считаются от этой константы.
 */
const BASE = process.env.VITE_BASE_PATH ?? '/predel/'

export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['robots.txt'],
      manifest: {
        name: 'ПРЕДЕЛ',
        short_name: 'ПРЕДЕЛ',
        description: 'Дневник силовых тренировок с игровой прогрессией',
        lang: 'ru',
        dir: 'ltr',
        start_url: BASE,
        scope: BASE,
        id: BASE,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#10130d',
        theme_color: '#10130d',
        icons: [
          {
            src: `${BASE}manifest-icon-192.png`,
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: `${BASE}manifest-icon-512.png`,
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
        ],
      },
      workbox: {
        navigateFallbackDenylist: [/^\/api/],
        globPatterns: ['**/*.{js,css,html,woff2,png,svg,ico}'],
        // Интерфейс только русский: офлайн нужны латиница и кириллица.
        // Греческий, вьетнамский и расширенные наборы догрузятся из сети,
        // если вдруг понадобятся, но в установку приложения не поедут.
        globIgnores: ['assets/*-{greek,greek-ext,vietnamese,cyrillic-ext,latin-ext}-*.woff2'],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/setupTests.ts'],
    css: false,
  },
})
