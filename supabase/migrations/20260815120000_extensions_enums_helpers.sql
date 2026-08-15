-- 0001 | Расширения, enum-типы и общие вспомогательные функции.
-- Фаза 1. Идемпотентно: миграцию можно повторно вставить в SQL Editor дашборда.

-- pgcrypto нужен для gen_random_uuid() на инстансах Postgres < 13.
-- На Supabase схема extensions уже существует.
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Enum-типы
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'stat_key' and n.nspname = 'public'
  ) then
    create type public.stat_key as enum ('chest','back','shoulders','arms','quads','posterior','core');
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'session_state' and n.nspname = 'public'
  ) then
    create type public.session_state as enum ('active','finished','abandoned');
  end if;
end
$$;

-- Тип упражнения. 'cardio' логируется временем/дистанцией, а не весом.
-- Кардио никогда не даёт очков и не влияет на статы (см. миграцию sets).
do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'exercise_kind' and n.nspname = 'public'
  ) then
    create type public.exercise_kind as enum ('strength','cardio');
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Общий триггер обновления updated_at.
-- Вешается на каждую таблицу, где есть колонка updated_at.
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.set_updated_at() is 'Проставляет updated_at = now() перед update.';
