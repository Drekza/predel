# Слой данных (фаза 1)

Кто владеет: агент «Данные». Файлы: `src/lib/*`, `src/lib/offline/*`, `src/types/*`.
Правило номер один: **прямых вызовов `supabase` из компонентов нет**. Запрос живёт в
`src/features/<фича>/api.ts` внутри `useQuery` / `useMutation`, ключ берётся из `qk`.

## Карта модулей

| Модуль | Что даёт |
|---|---|
| `src/types/database.ts` | Ручной `Database` в формате supabase-js v2 + `Tables<'sets'>`, `TablesInsert<...>`, `Enums<...>`, `Constants` |
| `src/features/bodyweight/*` | Журнал веса тела: хуки, геометрия графика, экран |
| `src/types/domain.ts` | Прикладные типы (`Exercise`, `ProgramItem`, `WorkoutSet`, `SessionExerciseView`, черновики подходов) и type guard'ы `isCardioSet` / `isStrengthSet` |
| `src/lib/env.ts` | `env.supabaseUrl`, `env.supabaseAnonKey`, `env.isConfigured`, `env.missing` |
| `src/lib/supabase.ts` | Единственный клиент `supabase` |
| `src/lib/queryClient.ts` | Настроенный `queryClient` |
| `src/lib/keys.ts` | `qk` — все ключи запросов |
| `src/lib/constants.ts` | `STAT_LABELS_RU`, `MUSCLE_LABELS_RU`, `EQUIPMENT_LABELS_RU`, `MUSCLE_TO_STAT`, лимиты ввода |
| `src/lib/errors.ts` | `toRussianMessage(err)` и классификация ошибок |
| `src/lib/format.ts` | Форматирование чисел, веса, тоннажа, времени, дистанции, дат; `parseDurationInput`, `parseNumberRu` |
| `src/lib/offline/queue.ts` | Очередь оптимистичных мутаций |

## Env и «не настроен Supabase»

`env.ts` ничего не бросает. Если переменных нет, `env.isConfigured === false`, а
`supabase` всё равно создан на фиктивных строках — импорт модуля безопасен.
Экран-заглушку рисует агент интеграции по `env.isConfigured`, список недостающих
переменных лежит в `env.missing`.

## Ключи запросов

```ts
qk.profile(id)          // ['gymrpg','profile',id]
qk.bodyweight(id)       // ['gymrpg','bodyweight',id] — журнал веса целиком
qk.exercises(filters?)  // ['gymrpg','exercises'] | ['gymrpg','exercises',filters]
qk.exercise(id)
qk.programs() / qk.program(id)
qk.sessions() / qk.activeSession() / qk.session(id) / qk.sessionSets(id)
qk.muscleStatMap() / qk.gameConfig()
```

Иерархия префиксная: `invalidateQueries({ queryKey: qk.sessions() })` снесёт и
`session(id)`, и `sessionSets(id)`, и `activeSession()`.

Дефолты `queryClient`: `staleTime` 30 с, `gcTime` 24 ч, `refetchOnWindowFocus: false`,
ретраи только для сети и 5xx (`isRetriableError`), пауза 1с → 2с → 4с (потолок 15 с).
Мутации не ретраятся: повторами занимается офлайн-очередь.

## Ошибки

```ts
import { toRussianMessage } from '@/lib/errors'
show(toRussianMessage(error))            // «Такая запись уже есть», «Нет доступа», ...
```

`23505` → «Такая запись уже есть», `23514` → «Значение вне допустимого диапазона»,
`42501` / `PGRST301` → «Нет доступа», сеть → «Нет связи, изменения сохранены и уйдут позже».
Сырой текст ошибки в UI не показываем никогда.
Дополнительно: `isDuplicateError`, `isPermissionError`, `isNetworkError`, `isRetriableError`.

## Форматирование

```ts
formatWeight(82.5)          // «82,5 кг»
formatVolume(4120)          // «4 120 кг»
formatRepRange(8, 12)       // «8–12»
formatDurationHuman(4320)   // «1 ч 12 мин»
formatClock(600)            // «10:00»
formatDistance(1800)        // «1,8 км»
formatCardio(720, 2100)     // «12:00 · 2,1 км»
parseDurationInput('10:30') // 630   (мм:сс)
parseDurationInput('630')   // 630   (целое = секунды)
parseDurationInput('10.5')  // 630   (дробное = минуты)
parseNumberRu('82,5')       // 82.5
toDateKey()                 // «2026-08-16» — ЛОКАЛЬНАЯ дата, не UTC
parseDateKey('2026-08-16')  // Date локальной полуночи
```

Пустое значение везде даёт «—» (`EM_DASH`), а не «NaN» и не пустую строку.

## Офлайн-очередь

Ключ хранилища: `gymrpg.mutation-queue.v1`. Операция:

```ts
{ id, kind: 'log_set'|'update_set'|'delete_set'|'finish_session',
  payload, createdAt, attempts, status: 'pending'|'failed', nextAttemptAt, lastError? }
```

### Подключение (один раз при старте приложения)

```ts
import { registerExecutor, startQueueAutoFlush } from '@/lib/offline/queue'

registerExecutor('log_set', async (payload) => {
  const { error } = await supabase.from('sets').insert({
    session_id: payload.sessionId,
    client_id: payload.clientId,          // = op.id, на нём держится идемпотентность
    exercise_id: payload.exerciseId,
    program_item_id: payload.programItemId,
    order_index: payload.orderIndex,
    weight_kg: payload.weightKg,
    reps: payload.reps,
    rir: payload.rir,
    duration_sec: payload.durationSec,
    distance_m: payload.distanceM,
    logged_at: payload.loggedAt,
  })
  if (error) throw error                   // очередь сама классифицирует ошибку
})
```

`kind` строки `sets` проставляет триггер из `exercises.kind` — клиент его не шлёт.

### Использование в UI

```ts
const { pending, failed, flush, retryFailed, discard } = useOfflineQueue()
const op = enqueue({ kind: 'log_set', id: clientId, payload })  // сразу пишем в localStorage
```

Хук сам включает автофлаш: событие `online`, `visibilitychange`, таймер раз в 15 с
и один флаш при монтировании. Из не-React кода — `startQueueAutoFlush()` (возвращает отписку).

### Поведение

- Строгий FIFO, по одной операции за раз.
- `23505` = успех (строка уже доехала), операция удаляется.
- Сетевая ошибка: `attempts + 1`, пауза `1с·2^(attempts−1)` до 60 с, флаш останавливается,
  порядок сохраняется.
- Ошибка прав или нарушение ограничения: сразу `failed`, флаш идёт дальше по очереди.
- После `MAX_ATTEMPTS` (6) операция становится `failed` и **остаётся в очереди** —
  показать её пользователю обязан UI (`failed`, `retryFailed()`, `discard(id)`).
- Битый JSON в хранилище очередь переживает, а не роняет приложение.

Тесты: `src/lib/offline/__tests__/queue.test.ts` (FIFO, backoff, идемпотентность на 23505,
переживание перезагрузки, ошибки прав, retry/discard).

## Вес тела

`bodyweight_entries` — журнал измерений, одно значение на дату. Хуки в
`src/features/bodyweight/api.ts`: `useBodyweightEntries` (по возрастанию даты, как
рисует график), `useSaveBodyweight` (upsert по `profile_id, measured_on`),
`useDeleteBodyweightEntry`. Каждая мутация гасит и `qk.profile(id)`: текущий вес
профиля переставляет серверный триггер, клиент его не пишет.

`measured_on` формируется через `toDateKey()` — именно локальная дата. Через
офлайн-очередь вес не идёт: это настройка, а не подход между сетами.

Геометрия графика — чистые функции в `src/features/bodyweight/series.ts`
(`filterByPeriod`, `summarize`, `weightBounds`, `buildChart`), рисует их
`WeightChart` рукописным SVG. Библиотеки графиков в проекте нет.

## Кардио

`exercises.kind` = `'strength' | 'cardio'`. У кардио-подхода заполнены `duration_sec`
и/или `distance_m`, а `weight_kg` / `reps` / `rir` строго `null` (в БД это стережёт
`sets_shape_ck`). Кардио не даёт очков и не входит в тоннаж: в `SessionTotals` для него
отдельные поля `cardioSec` и `cardioDistanceM`, а `volumeKg` считается только по силовым.
В `program_items` силовые цели (`rep_min`, `rep_max`, `target_rir`) и кардио-цели
(`target_duration_sec`, `target_distance_m`) взаимно `null`.

## RPC

Типизированы две функции: `start_session(p_program_day_id?)` и
`finish_session(p_session_id, p_state?, p_note?)`, обе возвращают строку `sessions`.
Если миграции назовут аргументы иначе — правится `Database['public']['Functions']`
в `src/types/database.ts`, и только там.

## Сверка с БД

`src/types/database.ts` написан руками по DDL из контракта фазы 1 и является источником
истины для клиента. Когда появится доступ к проекту, `npm run db:types` положит
сгенерированный тип в `src/types/database.generated.ts` (отдельный файл, ручной не
перетирает) — расхождения разбираются вручную.
