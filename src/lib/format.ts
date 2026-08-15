/**
 * Форматирование чисел, времени и дат по-русски.
 * Только Intl, никаких внешних библиотек.
 *
 * Правила подачи: десятичный разделитель — запятая, разряды — неразрывный пробел,
 * прочерк вместо пустого значения — «—» (U+2014).
 */

const LOCALE = 'ru-RU'
export const EM_DASH = '—'

const numberFormatCache = new Map<string, Intl.NumberFormat>()

function nf(minFrac: number, maxFrac: number): Intl.NumberFormat {
  const key = `${minFrac}:${maxFrac}`
  let formatter = numberFormatCache.get(key)
  if (!formatter) {
    formatter = new Intl.NumberFormat(LOCALE, {
      minimumFractionDigits: minFrac,
      maximumFractionDigits: maxFrac,
    })
    numberFormatCache.set(key, formatter)
  }
  return formatter
}

function isNum(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** «4 120,5» — разряды неразрывным пробелом, дробь запятой. */
export function formatNumber(value: number | null | undefined, maxFrac = 2): string {
  if (!isNum(value)) return EM_DASH
  return nf(0, maxFrac).format(value)
}

// --- Склонения ---

/** pluralRu(2, 'подход', 'подхода', 'подходов') -> 'подхода' */
export function pluralRu(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(Math.trunc(n))
  const mod10 = abs % 10
  const mod100 = abs % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}

// --- Вес и объём ---

/** «82,5 кг», «80 кг». Дробную часть показываем только если она есть. */
export function formatWeight(kg: number | null | undefined): string {
  if (!isNum(kg)) return EM_DASH
  return `${formatNumber(kg, 2)} кг`
}

/** То же без единицы — для полей ввода и компактных мест. */
export function formatWeightValue(kg: number | null | undefined): string {
  if (!isNum(kg)) return ''
  return formatNumber(kg, 2)
}

/** Тоннаж сессии: «4 120 кг». Дроби не показываем, они тут шум. */
export function formatVolume(kg: number | null | undefined): string {
  if (!isNum(kg)) return EM_DASH
  return `${formatNumber(Math.round(kg), 0)} кг`
}

/** Накопленный тоннаж за всё время: «412 т» при больших числах. */
export function formatTonnage(kg: number | null | undefined): string {
  if (!isNum(kg)) return EM_DASH
  if (Math.abs(kg) < 10_000) return formatVolume(kg)
  return `${formatNumber(kg / 1000, 1)} т`
}

// --- Повторы, подходы, RIR ---

export function formatReps(reps: number | null | undefined): string {
  if (!isNum(reps)) return EM_DASH
  return formatNumber(reps, 0)
}

/** «12 повторов» */
export function formatRepsWord(reps: number | null | undefined): string {
  if (!isNum(reps)) return EM_DASH
  return `${formatNumber(reps, 0)} ${pluralRu(reps, 'повтор', 'повтора', 'повторов')}`
}

/** «3 подхода» */
export function formatSetsWord(sets: number | null | undefined): string {
  if (!isNum(sets)) return EM_DASH
  return `${formatNumber(sets, 0)} ${pluralRu(sets, 'подход', 'подхода', 'подходов')}`
}

/** «8–12», «8» если границы совпали. */
export function formatRepRange(
  min: number | null | undefined,
  max: number | null | undefined,
): string {
  if (!isNum(min) && !isNum(max)) return EM_DASH
  if (!isNum(min)) return formatReps(max)
  if (!isNum(max)) return formatReps(min)
  if (min === max) return formatReps(min)
  return `${formatReps(min)}–${formatReps(max)}`
}

/** «RIR 2» */
export function formatRir(rir: number | null | undefined): string {
  if (!isNum(rir)) return EM_DASH
  return `RIR ${formatNumber(rir, 0)}`
}

/** Строка силового подхода: «82,5 кг × 8 · RIR 2» */
export function formatStrengthSet(
  weightKg: number | null | undefined,
  reps: number | null | undefined,
  rir?: number | null,
): string {
  const head = `${formatWeight(weightKg)} × ${formatReps(reps)}`
  return isNum(rir) ? `${head} · ${formatRir(rir)}` : head
}

// --- Время ---

/** «10:00» из секунд; от часа и больше — «1:05:30». */
export function formatClock(totalSeconds: number | null | undefined): string {
  if (!isNum(totalSeconds) || totalSeconds < 0) return EM_DASH
  const total = Math.round(totalSeconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  const mm = String(minutes).padStart(2, '0')
  const ss = String(seconds).padStart(2, '0')
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`
}

/** «1 ч 12 мин», «45 мин», «40 с». Для длительности сессии. */
export function formatDurationHuman(totalSeconds: number | null | undefined): string {
  if (!isNum(totalSeconds) || totalSeconds < 0) return EM_DASH
  const total = Math.round(totalSeconds)
  if (total < 60) return `${total} с`
  const hours = Math.floor(total / 3600)
  const minutes = Math.round((total % 3600) / 60)
  if (hours === 0) return `${minutes} мин`
  if (minutes === 0) return `${hours} ч`
  return `${hours} ч ${minutes} мин`
}

export function formatDurationMs(ms: number | null | undefined): string {
  if (!isNum(ms)) return EM_DASH
  return formatDurationHuman(ms / 1000)
}

/** Длительность сессии по её меткам времени. finishedAt=null -> считаем до сейчас. */
export function formatSessionDuration(
  startedAt: string | null | undefined,
  finishedAt?: string | null,
  now: number = Date.now(),
): string {
  if (!startedAt) return EM_DASH
  const start = Date.parse(startedAt)
  if (Number.isNaN(start)) return EM_DASH
  const end = finishedAt ? Date.parse(finishedAt) : now
  if (Number.isNaN(end) || end < start) return EM_DASH
  return formatDurationMs(end - start)
}

/**
 * Разбор ручного ввода длительности в секунды.
 *   «10:30» -> 630   (мм:сс)
 *   «1:05:30» -> 3930 (чч:мм:сс)
 *   «630»   -> 630   (целое = секунды)
 *   «10.5» / «10,5» -> 630 (дробное = минуты)
 * Некорректный ввод -> null.
 */
export function parseDurationInput(input: string | null | undefined): number | null {
  if (input === null || input === undefined) return null
  const raw = String(input).trim().replace(/\s+/g, '').replace(',', '.')
  if (raw === '') return null

  if (raw.includes(':')) {
    const parts = raw.split(':')
    if (parts.length > 3) return null
    const nums = parts.map((p) => (p === '' ? 0 : Number(p)))
    if (nums.some((n) => !Number.isFinite(n) || n < 0)) return null
    let seconds = 0
    for (const n of nums) seconds = seconds * 60 + n
    return clampDuration(Math.round(seconds))
  }

  const value = Number(raw)
  if (!Number.isFinite(value) || value < 0) return null
  // Целое считаем секундами, дробное — минутами: «10.5» это 10 с половиной минут.
  const seconds = Number.isInteger(value) ? value : value * 60
  return clampDuration(Math.round(seconds))
}

function clampDuration(seconds: number): number {
  if (seconds < 0) return 0
  return Math.min(seconds, 36_000)
}

// --- Дистанция ---

/** «1,8 км» из метров; меньше километра — «800 м». */
export function formatDistance(meters: number | null | undefined): string {
  if (!isNum(meters)) return EM_DASH
  if (Math.abs(meters) < 1000) return `${formatNumber(Math.round(meters), 0)} м`
  return `${formatNumber(meters / 1000, 2)} км`
}

/** Значение в километрах для степпера: 1800 -> 1,8 */
export function formatDistanceKm(meters: number | null | undefined): string {
  if (!isNum(meters)) return ''
  return formatNumber(meters / 1000, 2)
}

/** Кардио одной строкой: «12:00 · 2,1 км». Пустые части опускаются. */
export function formatCardio(
  durationSec: number | null | undefined,
  distanceM?: number | null,
): string {
  const parts: string[] = []
  if (isNum(durationSec) && durationSec > 0) parts.push(formatClock(durationSec))
  if (isNum(distanceM) && distanceM > 0) parts.push(formatDistance(distanceM))
  return parts.length > 0 ? parts.join(' · ') : EM_DASH
}

// --- Разбор чисел из полей ввода ---

/** «82,5» -> 82.5; мусор -> null. */
export function parseNumberRu(input: string | null | undefined): number | null {
  if (input === null || input === undefined) return null
  const raw = String(input)
    .trim()
    .replace(/[\s\u00a0\u202f]/g, '')
    .replace(',', '.')
  if (raw === '') return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

// --- Даты ---

const dateFmt = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'long' })
const dateWithYearFmt = new Intl.DateTimeFormat(LOCALE, {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})
const timeFmt = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit' })
const weekdayFmt = new Intl.DateTimeFormat(LOCALE, { weekday: 'long' })
const shortDateFmt = new Intl.DateTimeFormat(LOCALE, { day: '2-digit', month: '2-digit' })

function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/** «15 августа», с годом если год не текущий. */
export function formatDate(
  value: string | number | Date | null | undefined,
  now: number = Date.now(),
): string {
  const date = toDate(value)
  if (!date) return EM_DASH
  const sameYear = date.getFullYear() === new Date(now).getFullYear()
  return sameYear ? dateFmt.format(date) : dateWithYearFmt.format(date)
}

/** «15.08» — для компактных списков. */
export function formatDateShort(value: string | number | Date | null | undefined): string {
  const date = toDate(value)
  return date ? shortDateFmt.format(date) : EM_DASH
}

/** «18:30» */
export function formatTime(value: string | number | Date | null | undefined): string {
  const date = toDate(value)
  return date ? timeFmt.format(date) : EM_DASH
}

/** «15 августа, 18:30» */
export function formatDateTime(
  value: string | number | Date | null | undefined,
  now: number = Date.now(),
): string {
  const date = toDate(value)
  if (!date) return EM_DASH
  return `${formatDate(date, now)}, ${timeFmt.format(date)}`
}

/** «пятница» */
export function formatWeekday(value: string | number | Date | null | undefined): string {
  const date = toDate(value)
  return date ? weekdayFmt.format(date) : EM_DASH
}

/** «сегодня» / «вчера» / «15 августа» — заголовки в истории. */
export function formatRelativeDay(
  value: string | number | Date | null | undefined,
  now: number = Date.now(),
): string {
  const date = toDate(value)
  if (!date) return EM_DASH
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const diffDays = Math.round((startOf(new Date(now)) - startOf(date)) / 86_400_000)
  if (diffDays === 0) return 'сегодня'
  if (diffDays === 1) return 'вчера'
  if (diffDays === 2) return 'позавчера'
  return formatDate(date, now)
}

/** «3 дня назад» — для «последняя активность». */
export function formatDaysAgo(
  value: string | number | Date | null | undefined,
  now: number = Date.now(),
): string {
  const date = toDate(value)
  if (!date) return EM_DASH
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const diffDays = Math.round((startOf(new Date(now)) - startOf(date)) / 86_400_000)
  if (diffDays <= 0) return 'сегодня'
  if (diffDays === 1) return 'вчера'
  return `${diffDays} ${pluralRu(diffDays, 'день', 'дня', 'дней')} назад`
}
