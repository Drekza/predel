/**
 * Переменные окружения. Модуль НИКОГДА не бросает исключение:
 * если Supabase не настроен, приложение обязано показать экран
 * «не настроен Supabase», а не белый экран из-за падения на импорте.
 */

function readEnv(key: 'VITE_SUPABASE_URL' | 'VITE_SUPABASE_ANON_KEY'): string {
  const raw = import.meta.env?.[key]
  return typeof raw === 'string' ? raw.trim() : ''
}

const supabaseUrl = readEnv('VITE_SUPABASE_URL')
const supabaseAnonKey = readEnv('VITE_SUPABASE_ANON_KEY')

/** Урл должен быть похож на урл, иначе createClient упадёт на разборе. */
function looksLikeUrl(value: string): boolean {
  return /^https?:\/\/[^\s]+$/i.test(value)
}

const isConfigured = looksLikeUrl(supabaseUrl) && supabaseAnonKey.length > 20

/** Список того, чего не хватает, — для экрана диагностики. */
const missing: string[] = []
if (!looksLikeUrl(supabaseUrl)) missing.push('VITE_SUPABASE_URL')
if (supabaseAnonKey.length <= 20) missing.push('VITE_SUPABASE_ANON_KEY')

export const env = {
  supabaseUrl,
  supabaseAnonKey,
  isConfigured,
  missing,
  isDev: import.meta.env?.DEV === true,
  isTest: import.meta.env?.MODE === 'test',
} as const

export type Env = typeof env
