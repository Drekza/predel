/**
 * Ошибки Supabase/Postgres -> человеческие русские сообщения.
 * Сырой текст ошибки пользователю не показываем никогда.
 *
 * Тут же живёт классификация ошибок, на которую опираются
 * офлайн-очередь (что ретраить, что считать успехом) и queryClient.
 */

export type AppErrorLike = {
  code?: string | number
  message?: string
  details?: string | null
  hint?: string | null
  status?: number
  name?: string
}

const NETWORK_MESSAGE = 'Нет связи, изменения сохранены и уйдут позже'
const FALLBACK_MESSAGE = 'Что-то пошло не так. Попробуй ещё раз'

function asRecord(err: unknown): AppErrorLike {
  if (err && typeof err === 'object') return err as AppErrorLike
  if (typeof err === 'string') return { message: err }
  return {}
}

/** Код ошибки в виде строки: '23505', 'PGRST301', 'over_email_send_rate_limit'... */
export function getErrorCode(err: unknown): string | undefined {
  const { code } = asRecord(err)
  if (code === undefined || code === null) return undefined
  return String(code)
}

export function getErrorStatus(err: unknown): number | undefined {
  const rec = asRecord(err)
  if (typeof rec.status === 'number') return rec.status
  // PostgREST кладёт статус в code при HTTP-ошибках уровня fetch
  const code = getErrorCode(err)
  if (code && /^\d{3}$/.test(code)) return Number(code)
  return undefined
}

export function getErrorMessage(err: unknown): string {
  const { message } = asRecord(err)
  return typeof message === 'string' ? message : ''
}

/** Нарушение уникального индекса — для очереди это успех (идемпотентность). */
export function isDuplicateError(err: unknown): boolean {
  return getErrorCode(err) === '23505'
}

/** Прав нет / протух токен. Ретраить бессмысленно. */
export function isPermissionError(err: unknown): boolean {
  const code = getErrorCode(err)
  if (code === '42501' || code === 'PGRST301' || code === '42P01') return true
  const status = getErrorStatus(err)
  return status === 401 || status === 403
}

/** Оффлайн или сеть отвалилась. */
export function isNetworkError(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  const rec = asRecord(err)
  if (rec.name === 'AbortError' || rec.name === 'TimeoutError') return true
  const code = getErrorCode(err)
  if (code === 'ECONNREFUSED' || code === 'ETIMEDOUT' || code === 'ENOTFOUND') return true
  const message = getErrorMessage(err).toLowerCase()
  if (!message) return false
  return (
    message.includes('failed to fetch') ||
    message.includes('networkerror') ||
    message.includes('network request failed') ||
    message.includes('load failed') ||
    message.includes('fetch failed') ||
    message.includes('network error') ||
    message.includes('timeout')
  )
}

/**
 * Есть ли смысл повторять операцию.
 * Сеть и 5xx — да. Права, нарушения ограничений и прочие 4xx — нет.
 */
export function isRetriableError(err: unknown): boolean {
  if (isDuplicateError(err)) return false
  if (isPermissionError(err)) return false
  if (isNetworkError(err)) return true

  const status = getErrorStatus(err)
  if (status !== undefined) return status >= 500

  const code = getErrorCode(err)
  if (!code) return true // непонятная ошибка — даём шанс повтору
  // Классы кодов Postgres: 23xxx — нарушения ограничений, 22xxx — данные, 42xxx — синтаксис/права
  if (/^(22|23|42)/.test(code)) return false
  if (code.startsWith('PGRST')) return false
  return true
}

const PG_MESSAGES: Record<string, string> = {
  '23505': 'Такая запись уже есть',
  '23514': 'Значение вне допустимого диапазона',
  '23503': 'Связанная запись не найдена',
  '23502': 'Не заполнено обязательное поле',
  '22P02': 'Некорректное значение',
  '22003': 'Слишком большое число',
  '42501': 'Нет доступа',
  '42P01': 'Нет доступа',
  PGRST301: 'Нет доступа',
  PGRST116: 'Запись не найдена',
  PGRST204: 'Схема данных устарела — обнови страницу',
  '23P01': 'Значение конфликтует с уже сохранённым',
  P0001: 'Сервер отклонил операцию',
}

/** Частые ошибки Supabase Auth — по коду и по тексту (коды появились не везде). */
const AUTH_MESSAGES: Array<[RegExp, string]> = [
  [/invalid login credentials/i, 'Неверная почта или пароль'],
  [/email not confirmed/i, 'Почта не подтверждена — проверь письмо'],
  [/user already registered|already been registered/i, 'Такой пользователь уже есть'],
  [/password should be at least/i, 'Пароль слишком короткий'],
  [/token has expired or is invalid|invalid.*token/i, 'Ссылка устарела — запроси новую'],
  [/rate limit|too many requests|only request this after/i, 'Слишком часто — подожди немного'],
  [/email address .* is invalid|invalid email/i, 'Некорректный адрес почты'],
  [/signups not allowed|signup is disabled/i, 'Регистрация закрыта'],
  [/auth session missing|session_not_found/i, 'Сессия истекла — войди заново'],
]

/**
 * Главная функция маппинга. Отдаёт короткое русское сообщение,
 * пригодное для тоста и для инлайн-подсказки под полем.
 */
export function toRussianMessage(err: unknown, fallback: string = FALLBACK_MESSAGE): string {
  if (err === null || err === undefined) return fallback

  if (isNetworkError(err)) return NETWORK_MESSAGE

  const code = getErrorCode(err)
  const mapped = code === undefined ? undefined : PG_MESSAGES[code]
  if (mapped) return mapped

  const message = getErrorMessage(err)
  for (const [pattern, ru] of AUTH_MESSAGES) {
    if (pattern.test(message) || (code !== undefined && pattern.test(code))) return ru
  }

  const status = getErrorStatus(err)
  if (status === 404) return 'Запись не найдена'
  if (status === 409) return 'Такая запись уже есть'
  if (status === 429) return 'Слишком часто — подожди немного'
  if (status !== undefined && status >= 500) return 'Сервер недоступен, попробуй позже'

  return fallback
}

/** Короткий алиас, которым удобно пользоваться в хуках. */
export const errorMessageRu = toRussianMessage

export const NETWORK_ERROR_MESSAGE = NETWORK_MESSAGE
