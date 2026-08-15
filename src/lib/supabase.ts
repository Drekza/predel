import { createClient } from '@supabase/supabase-js'

import { env } from './env'
import type { Database } from '@/types/database'

/**
 * Единственный экземпляр клиента на всё приложение.
 *
 * Если переменные окружения не заданы, клиент всё равно создаётся —
 * на фиктивных строках. Так импорт модуля не падает, а UI успевает
 * показать экран «не настроен Supabase» (см. env.isConfigured).
 */
const url = env.isConfigured ? env.supabaseUrl : 'http://localhost:54321'
const anonKey = env.isConfigured ? env.supabaseAnonKey : 'anon-key-not-configured'

export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
    storageKey: 'gymrpg.auth.v1',
  },
  global: {
    headers: { 'x-client-info': 'predel/phase-1' },
  },
  db: { schema: 'public' },
})

export type { Database }
