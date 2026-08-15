# Фаза 1: что собрано, как оно склеено, что осталось

Документ для того, кто продолжит работу. Как поднять проект — в
[`../README.md`](../README.md). Продуктовые решения — в `../gym-rpg-spec.md`.

---

## 1. Границы фазы

Сделано: авторизация по magic link, схема БД с RLS, справочник из 692
упражнений, конструктор программ, экран логирования тренировки с офлайн-очередью,
история и сводка сессии, PWA.

Сознательно не сделано (фаза 2+): очки, статы, уровни, класс, аватар, готовность,
рейды, квесты, круг и лидерборд. Колонки `sets.e1rm`, `sets.e1rm_ref`, `sets.ri`,
`sets.score` и `sessions.total_score` существуют, но остаются пустыми/нулевыми —
их заполнит триггер фазы 2. Тоннаж (`total_volume_kg`) считается уже сейчас: это
арифметика, а не игровой слой.

Кардио — осознанное отступление от спеки (раздел 1 объявляет его не-целью).
17 упражнений с `kind = 'cardio'` логируются временем и дистанцией, не дают ни
очков, ни тоннажа, не участвуют в прогрессии. Триггер расчёта score в фазе 2
обязан пропускать строки `sets` с `kind = 'cardio'`.

---

## 2. Как склеено приложение

### Провайдеры и точка входа

```
main.tsx
  registerOfflineExecutors()   // src/lib/offline/executors.ts
  startQueueAutoFlush()        // очередь оживает до первого рендера
  registerSW()                 // virtual:pwa-register, autoUpdate
  <StrictMode>
    <App>                      // src/App.tsx
      env.isConfigured === false -> <NotConfiguredScreen/>, роутер не поднимается
      <QueryClientProvider>    // src/lib/queryClient.ts
        <AuthProvider>         // features/auth, ходит в react-query -> обязан быть внутри
          <ToastProvider>      // components/ui/Toast
            <RouterProvider/>  // src/routes/router.tsx
```

Порядок не переставлять: `AuthProvider` использует `useQueryClient`, тосты нужны
любому экрану, роутер идёт последним.

### Роуты (`src/routes/router.tsx`)

| Путь | Экран | Где живёт |
|---|---|---|
| `/login` | `LoginPage` | вне оболочки |
| `/onboarding` | `OnboardingPage` | вне оболочки |
| `/` | `HomePage` | внутри `AppShell` |
| `/programs` | `ProgramsPage` | внутри `AppShell` |
| `/programs/:programId` | `ProgramEditorPage` | внутри `AppShell` |
| `/session/:sessionId` | `SessionPage` | внутри `AppShell` |
| `/session/:sessionId/summary` | `SessionSummaryPage` | внутри `AppShell` |
| `/history` | `HistoryPage` | внутри `AppShell` |
| `/profile` | `ProfilePage` | внутри `AppShell` |
| `/weight` | `BodyweightPage` | внутри `AppShell` |
| `*` | `NotFound` | вне оболочки |

Детали, о которых стоит знать:

- Ветка внутри оболочки обёрнута в `RequireAuth`: без сессии — редирект на
  `/login`, без пройденного онбординга — на `/onboarding`. `LoginPage` и
  `OnboardingPage` дополнительно охраняют себя сами, поэтому в `RequireAuth` их
  заворачивать не нужно.
- Заголовок в шапке берётся из `handle.title` маршрута через `useMatches()` —
  шапка одна на всё приложение, экраны её не рисуют.
- `errorElement` висит на корневом безымянном маршруте: любая ошибка рендера
  всплывает в `routes/ErrorBoundary.tsx`, вместо белого экрана человек видит
  объяснение и кнопку перезагрузки. Сорванная загрузка чанка после деплоя
  распознаётся отдельно и предлагает именно перезагрузку.
- Экраны сессии и программ грузятся через `React.lazy` из `index.ts` своих фич —
  в стартовый бандл попадают только оболочка, авторизация и общие библиотеки.

### Офлайн-очередь

`src/lib/offline/queue.ts` не знает про Supabase: реальную отправку регистрируют
исполнители из `src/lib/offline/executors.ts` (`log_set`, `update_set`,
`delete_set`, `finish_session`). Регистрация идемпотентна и вызывается из двух
мест — из `main.tsx` (чтобы неотправленные подходы уходили с любого экрана) и при
импорте `features/session/api.ts`. Подробности — [`data-layer.md`](data-layer.md).

---

## 3. Карта файлов

```
src/
  main.tsx                     точка входа: SW, очередь, StrictMode
  App.tsx                      провайдеры + ветка «Supabase не настроен»
  index.css                    Tailwind v4 @theme: все токены дизайна
  routes/
    router.tsx                 карта маршрутов, ленивые страницы, заголовки
    ErrorBoundary.tsx          корневой errorElement
    NotFound.tsx               404
  components/
    layout/AppShell.tsx        шапка + нижняя навигация + Outlet
    ui/*                       примитивы: Button, Card, Input, Field, Sheet,
                               NumberStepper, RirStepper, DurationStepper,
                               Toast, Spinner, EmptyState, Segmented, ...
  lib/
    env.ts supabase.ts queryClient.ts keys.ts   инфраструктура
    constants.ts               русские подписи статов, мышц, оборудования
    errors.ts                  ошибки Postgres/Auth -> русские сообщения
    format.ts                  числа, вес, время, даты по-русски
    cn.ts uuid.ts              мелкие хелперы (склейка классов, uuid)
    offline/queue.ts           очередь мутаций в localStorage
    offline/executors.ts       единственное место отправки операций в Supabase
    offline/types.ts           форма операций очереди
  types/
    database.ts                ручной тип Database под DDL
    domain.ts                  прикладные типы (Exercise, Program, Session, ...)
  features/
    auth/       AuthProvider, RequireAuth, Login/Onboarding/Profile, api
    bodyweight/ BodyweightPage, WeightChart, series (геометрия графика), api
    exercises/  ExercisePicker, ExerciseCard, CustomExerciseForm, фильтры
    programs/   ProgramsPage, ProgramEditorPage, ProgramDayEditor, reorder
    session/    HomePage, SessionPage, SessionSummaryPage, HistoryPage,
                ExerciseBlock, SetRow, SetInputBar, RestTimer, prefill
supabase/
  migrations/   10 файлов, применяются по возрастанию имени
  seed/         0001 карта мышц + game_config, 0002 упражнения (генерируется)
scripts/
  build-exercise-seed.mjs      сборка сида из free-exercise-db + переводы
```

Каждая фича отдаёт наружу только `index.ts`. Прямых вызовов `supabase` из
компонентов нет — только из `features/*/api.ts` и `lib/offline/executors.ts`.

---

## 4. Что чинилось при сборке частей

Части писались параллельно, поэтому стыки разъезжались. Что пришлось привести к
одному виду:

1. **`start_session` возвращал `uuid`**, а клиент и типы ждали строку `sessions`
   целиком (кэш активной сессии + переход на экран тренировки без второго
   запроса). Функция в миграции `20260815120800` переписана на
   `returns public.sessions`.
2. **`finish_session(p_session_id)` не принимал `p_state` и `p_note`**, а клиент
   шлёт оба: «бросить тренировку» — это `state = 'abandoned'`. Сигнатура стала
   `finish_session(uuid, session_state, text)`; память автозаполнения в
   `program_items` обновляется только у завершённой сессии, брошенная её не
   трогает. Повторный вызов на уже закрытой сессии ничего не меняет — это важно,
   потому что закрытие идёт через очередь и может повториться.
3. **Три копии генератора id.** Версия в `features/programs/api.ts` при
   отсутствии `crypto.randomUUID` выдавала строку вида `18f3a…-a1b2c3d4`, которая
   не является uuid и упала бы на вставке. Всё сведено в `src/lib/uuid.ts`.
4. **Исполнители очереди жили внутри `features/session/api.ts`.** Перенесены в
   `src/lib/offline/executors.ts`, чтобы очередь работала и на экранах, которые
   фичу сессии не импортируют.

Осознанно оставленное дублирование: `formatDuration`/`parseDuration` в
`components/ui/DurationStepper.tsx` и `formatClock`/`parseDurationInput` в
`lib/format.ts`. Поведение разное: степпер всегда показывает `мм:сс` (65 минут —
это `65:00`), а `formatClock` от часа переходит на `ч:мм:сс`.

---

## 5. Долги и что делать дальше

Известные хвосты фазы 1:

- Стартовый чанк ~620 КБ (≈185 КБ gzip) — почти весь объём это supabase-js и
  react-router. Резать имеет смысл после фазы 2, вместе с реальными измерениями.
- `game_config` заполняется сидом, но клиент его пока не читает: константы нужны
  только формулам фазы 2.
- Таблицы `circles` / `circle_members` / `circle_invites` созданы, политики есть,
  но обмена инвайтов и UI круга нет — это фаза 3.
- `sessions.readiness_at_start` и `sessions.raid_id` не заполняются (фазы 4 и 5).
- Тестами закрыты чистые функции (очередь, prefill, reorder, фильтры) и экраны
  авторизации; сквозного теста «тренировка от старта до сводки» нет.

Порядок дальнейших фаз — раздел 12 спеки:

| Фаза | Содержание |
|---|---|
| 2 | Триггер score, статы, уровни, класс, SVG-аватар, дневник, движок прогрессии, детектор застоя |
| 3 | Круг, инвайты, лидерборд |
| 4 | Готовность, жетоны, недельные квесты, аудит калибровки RIR |
| 5 | Рейды: соло, механики, добыча, якоря |
| 6 | Кооп-рейды через Realtime, дерево навыков, косметика |

Первое, что делает фаза 2, — триггер расчёта `score` на `sets`. Он обязан
пропускать строки с `kind = 'cardio'` (в миграции `..._sessions_sets.sql` про это
оставлен комментарий) и опираться на константы из `game_config`, а не на числа,
разбросанные по коду.
