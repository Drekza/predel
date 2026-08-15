/**
 * Единственный генератор клиентских идентификаторов.
 *
 * Оптимистичные строки создаются на клиенте и уезжают в колонки типа uuid,
 * поэтому формат обязан быть настоящим uuid: строка вида «время-случайность»
 * прошла бы по типам, но упала бы на вставке в Postgres.
 */
export function newUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // Запасной путь для окружений без Web Crypto (старый WebView, http-контекст).
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}
