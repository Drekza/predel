import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
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
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#10130d',
        theme_color: '#10130d',
        icons: [
          {
            src: '/manifest-icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/manifest-icon-512.png',
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
