# Supabase: как накатить схему

Фаза 1. Единственный источник истины по схеме — файлы в `supabase/migrations/`.
Подробности решений и что отложено на фазы 2–5 — в [`docs/db.md`](../docs/db.md).

## Что где лежит

```
supabase/
  config.toml                       конфиг CLI (порты локального стека + auth)
  migrations/
    20260815120000_extensions_enums_helpers.sql   pgcrypto, 3 enum-типа, set_updated_at()
    20260815120100_profiles.sql                   profiles + триггер на auth.users
    20260815120200_circles.sql                    circles / members / invites + SD-хелперы
    20260815120300_exercises.sql                  exercises + muscle_stat_map
    20260815120400_programs.sql                   programs / program_days / program_items
    20260815120500_sessions_sets.sql              sessions / sets + триггер set_set_kind
    20260815120600_game_config.sql                game_config
    20260815120700_rls_policies.sql               все RLS-политики
    20260815120800_session_functions.sql          start_session() / finish_session()
  seed.sql                          точка входа сидов (мета-команды psql)
  seed/
    0001_muscle_stat_map.sql        17 строк карты мышц + константы game_config
    0002_exercises.sql              справочник упражнений, генерируется `npm run seed:build`
```

Миграции применяются строго по возрастанию имени файла. Порядок не переставлять:
`profiles` обязан существовать раньше `exercises` (FK `owner_id`), `programs` — раньше
`sessions`, а политики (`..._rls_policies.sql`) — последними, они ссылаются на все таблицы
и на security definer функции из миграции кругов.

## Вариант 1: через CLI (рекомендуемый)

```bash
npx supabase login
npx supabase link --project-ref <project-ref>   # ref из URL дашборда
npx supabase db push                            # накатить миграции на удалённый проект
```

Сиды `db push` НЕ запускает. Их заливаем отдельно:

```bash
# строку подключения взять в дашборде: Project Settings → Database → Connection string
psql "$DATABASE_URL" -f supabase/seed.sql
```

Локальный стек в докере (если он есть):

```bash
npx supabase start
npx supabase db reset    # пересоздаёт БД, гоняет все миграции и сиды из config.toml
```

После изменений схемы обновить типы для фронта:

```bash
npm run db:types    # supabase gen types typescript --linked --schema public
```

## Вариант 2: вручную через SQL Editor дашборда

Если CLI и докера нет — это рабочий путь, миграции написаны так, чтобы их можно было
вставлять в SQL Editor как есть.

1. Дашборд → SQL Editor → New query.
2. Открывать файлы из `supabase/migrations/` **по одному, в порядке имён**, вставлять
   содержимое целиком, жать Run. Дождаться «Success» перед следующим файлом.
3. Затем так же прогнать `supabase/seed/0001_muscle_stat_map.sql`, потом
   `supabase/seed/0002_exercises.sql`. Сам `seed.sql` в SQL Editor вставлять
   бесполезно: `\ir` — это команда psql, дашборд её не понимает.
4. Проверка, что всё встало:

```sql
select count(*) from public.muscle_stat_map;                  -- ожидаем 17
select count(*) from public.game_config;                      -- ожидаем 14
select kind, count(*) from public.exercises group by kind;    -- ожидаем cardio = 17
select tablename, rowsecurity from pg_tables
 where schemaname = 'public';                                 -- rowsecurity = true везде
select tablename, policyname from pg_policies
 where schemaname = 'public' order by tablename;              -- без политик таблиц быть не должно
```

## Повторный запуск

Все миграции написаны идемпотентно (`create ... if not exists`, `create or replace`,
`drop policy if exists` перед `create policy`), поэтому повторный прогон на **той же
версии схемы** безопасен.

Важное исключение: если БД уже была залита более ранней версией этих же файлов
(до появления кардио — колонок `exercises.kind`, `sets.kind`, `sessions.total_cardio_sec`),
`create table if not exists` ничего не добавит и схема останется старой. В этом случае
нужно пересоздать схему:

```sql
-- ВНИМАНИЕ: удаляет все данные приложения
drop schema public cascade;
create schema public;
grant usage on schema public to anon, authenticated, service_role;
```

и накатить миграции заново. Локально то же самое делает `npx supabase db reset`.

## Настройки auth в дашборде

`config.toml` управляет удалённым проектом только через `supabase config push`. Если
работаешь через дашборд — выставь руками в Authentication → URL Configuration:

- Site URL: `http://localhost:5173`
- Redirect URLs: `http://localhost:5173/**` (плюс прод-домен, когда появится)

Провайдер входа — Email (magic link). Подтверждение адреса выключено.

## Сиды и тюнинг-константы

`seed/0001` вставляет `game_config` с `on conflict (key) do nothing` — повторный запуск
не затрёт значения, покрученные на живых данных. Чтобы вернуть дефолт конкретного ключа,
удали строку и прогони сид ещё раз.

Карта `muscle_stat_map`, наоборот, обновляется через `do update`: это фиксированный
справочник, расхождений в нём быть не должно.
