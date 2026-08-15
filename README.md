# ПРЕДЕЛ — дневник силовых тренировок

Мобильное веб-приложение (PWA) для лога тренировок в зале: программа, экран
логирования с автозаполнением из прошлой сессии, RIR на каждый подход и очередь
мутаций, которая не теряет подход при пропавшей связи.

Полная продуктовая спецификация — [`gym-rpg-spec.md`](gym-rpg-spec.md).
Сейчас реализована **фаза 1**: авторизация, схема БД, справочник упражнений,
конструктор программ, экран тренировки, история. Игровой слой (очки, статы,
уровни, рейды) — фазы 2–5, см. [`docs/phase-1.md`](docs/phase-1.md).

---

## Стек

| Слой | Чем сделано |
|---|---|
| Сборка | Vite 7, TypeScript 5 (strict), `vite-plugin-pwa` |
| UI | React 19, Tailwind CSS v4 (конфиг через `@theme` в `src/index.css`, без `tailwind.config.js`), lucide-react |
| Роутинг | react-router v7 (`createBrowserRouter`) |
| Данные | TanStack Query v5, `@supabase/supabase-js` v2 |
| Тесты | vitest + jsdom + @testing-library/react |
| Шрифты | Inter Variable, JetBrains Mono Variable (все числа — моно) |

Бэкенд — Supabase: Postgres с RLS, magic-link авторизация, две RPC-функции
жизненного цикла тренировки. Своего сервера у приложения нет.

---

## Быстрый старт

Нужен Node 20+ (версия зафиксирована в `.nvmrc`).

```bash
npm install
cp .env.example .env.local     # и заполнить два значения, см. ниже
npm run dev                    # http://localhost:5173
```

Без переменных окружения приложение не падает в белый экран: вместо роутера
рендерится экран «Нет подключения к базе» со списком недостающих переменных.

### Переменные окружения

Обе живут в `.env.local` (файл в `.gitignore`), обе публичные и попадают в бандл.

| Переменная | Где взять |
|---|---|
| `VITE_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | там же → Project API keys → `anon public` |

`service_role`-ключ в приложение класть нельзя ни при каких условиях: всё, что
попадает в `VITE_*`, видно любому пользователю в исходниках бандла.

### Команды

| Команда | Что делает |
|---|---|
| `npm run dev` | дев-сервер |
| `npm run build` | `tsc -b` + прод-сборка + генерация service worker и манифеста PWA |
| `npm run preview` | посмотреть прод-сборку локально |
| `npm run lint` | ESLint |
| `npm test -- --run` | тесты один раз, без watch |
| `npm run seed:build` | пересобрать SQL-сид справочника упражнений |
| `npm run db:push` | `supabase db push` (нужен залинкованный проект) |
| `npm run db:types` | перегенерировать типы БД из линкованного проекта |

---

## Проект Supabase и миграции

### 1. Создать проект

1. [supabase.com](https://supabase.com) → New project. Регион — ближайший, пароль
   базы сохранить, он понадобится для `psql`.
2. Authentication → Providers: включить **Email**, выключить подтверждение адреса
   (вход по magic link).
3. Authentication → URL Configuration:
   - Site URL: `http://localhost:5173`
   - Redirect URLs: `http://localhost:5173/**` (и прод-домен, когда появится).
4. Project Settings → API: скопировать URL и `anon public` в `.env.local`.

### 2. Накатить схему — способ A: CLI

```bash
npx supabase login
npx supabase link --project-ref <ref из адреса дашборда>
npx supabase db push
```

`db push` применяет только миграции. Сиды — отдельно (строка подключения:
Project Settings → Database → Connection string → URI):

```bash
psql "$DATABASE_URL" -f supabase/seed.sql
```

Локальный стек в докере, если он есть: `npx supabase start`, затем
`npx supabase db reset` — пересоздаст базу, прогонит миграции и сиды разом.

### 2. Накатить схему — способ B: вручную через SQL Editor

Если нет CLI и докера. Дашборд → SQL Editor → New query, затем открывать файлы
**по одному, строго в порядке имён**, вставлять целиком и жать Run, дожидаясь
«Success» перед следующим:

1. `supabase/migrations/20260815120000_extensions_enums_helpers.sql`
2. `supabase/migrations/20260815120100_profiles.sql`
3. `supabase/migrations/20260815120200_circles.sql`
4. `supabase/migrations/20260815120300_exercises.sql`
5. `supabase/migrations/20260815120400_programs.sql`
6. `supabase/migrations/20260815120500_sessions_sets.sql`
7. `supabase/migrations/20260815120600_game_config.sql`
8. `supabase/migrations/20260815120700_rls_policies.sql`
9. `supabase/migrations/20260815120800_session_functions.sql`

Потом сиды, тоже по порядку:

10. `supabase/seed/0001_muscle_stat_map.sql` — 17 строк «мышца → стат» и
    тюнинг-константы в `game_config`
11. `supabase/seed/0002_exercises.sql` — 692 упражнения

Сам `supabase/seed.sql` в SQL Editor вставлять бесполезно: он состоит из команд
`\ir`, которые понимает только `psql`.

Порядок переставлять нельзя: `profiles` нужен раньше `exercises` (внешний ключ
`owner_id`), `programs` — раньше `sessions`, политики RLS идут последними, они
ссылаются на все таблицы.

### 3. Проверить, что всё встало

```sql
select count(*) from public.muscle_stat_map;                -- 17
select count(*) from public.exercises;                      -- 692
select kind, count(*) from public.exercises group by kind;  -- cardio 17, strength 675
select count(*) from public.game_config;                    -- 14
select tablename, rowsecurity from pg_tables where schemaname = 'public';  -- везде true
```

### Справочник упражнений

Сид `supabase/seed/0002_exercises.sql` уже лежит в репозитории — генерировать его
заново нужно только если менялись исходные данные или переводы:

```bash
npm run seed:build      # читает scripts/data/**, пишет supabase/seed/0002_exercises.sql
```

Источник — [free-exercise-db](https://github.com/yuhonas/free-exercise-db)
(Unlicense) плюс три кардио-упражнения, дописанных вручную. Скрипт
детерминированный: без изменений входа файл не меняется. Подробности —
[`scripts/README.md`](scripts/README.md) и [`docs/exercises.md`](docs/exercises.md).

Файл идемпотентен: повторный прогон обновляет справочные поля глобальных
упражнений, не плодит дубли и не трогает пользовательские упражнения.

---

## Что готово в фазе 1

- Вход по ссылке из письма, онбординг (ник + вес тела), профиль, выход.
- Справочник из 692 упражнений с поиском, фильтрами по группе мышц и
  оборудованию, плюс свои упражнения.
- Конструктор программ: дни, упражнения в днях, порядок, цели (подходы,
  диапазон повторов, целевой RIR; у кардио — время и дистанция), одна активная
  программа на пользователя.
- Экран тренировки: все упражнения дня сразу списком, вес и повторы
  предзаполнены из прошлой сессии, RIR на каждый подход, таймер отдыха,
  тоннаж, кардио отдельной строкой.
- Офлайн-очередь мутаций в localStorage: подход появляется в списке мгновенно,
  отправка догоняет; переживает перезагрузку страницы и потерю связи.
- История тренировок и сводка по завершённой сессии.
- PWA: устанавливается на телефон, статика работает офлайн.

Чего в фазе 1 нет намеренно: очков, статов, уровней, класса, аватара,
готовности, рейдов, квестов, круга и лидерборда. Колонки `e1rm`, `ri`, `score`
в таблице `sets` существуют и остаются пустыми до фазы 2.

## Что дальше

| Фаза | Содержание |
|---|---|
| 2 | Триггер расчёта score, статы, уровни, класс, SVG-аватар, движок прогрессии, детектор застоя |
| 3 | Круг, инвайты, лидерборд |
| 4 | Готовность, жетоны, недельные квесты, аудит калибровки RIR |
| 5 | Рейды на накопленных данных |
| 6 | Кооп-рейды через Realtime, дерево навыков, косметика |

---

## Документация

| Файл | О чём |
|---|---|
| [`gym-rpg-spec.md`](gym-rpg-spec.md) | продуктовая спецификация целиком |
| [`docs/phase-1.md`](docs/phase-1.md) | что реализовано, карта файлов, долги |
| [`docs/db.md`](docs/db.md) | схема, политики RLS, принятые решения |
| [`docs/data-layer.md`](docs/data-layer.md) | клиентский слой данных и офлайн-очередь |
| [`docs/design.md`](docs/design.md) | дизайн-токены и UI-примитивы |
| [`docs/exercises.md`](docs/exercises.md) | справочник упражнений и его сборка |
| [`supabase/README.md`](supabase/README.md) | миграции: подробности и повторный прогон |
