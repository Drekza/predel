-- 0004 | Справочник упражнений и карта «мышца → стат».
-- Данные (17 строк карты и глобальные упражнения) заливаются сидами, не миграцией.

create table if not exists public.muscle_stat_map (
  muscle text primary key,
  stat_key public.stat_key not null
);

comment on table public.muscle_stat_map is 'Ровно 17 строк: мышца из free-exercise-db → один из 7 статов. Данные — supabase/seed/0001.';

create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name_ru text not null,
  name_en text,
  kind public.exercise_kind not null default 'strength', -- 'cardio' логируется временем/дистанцией, а не весом
  equipment text,
  category text,
  mechanic text,
  force text,
  level text,
  primary_muscles text[] not null default '{}',
  secondary_muscles text[] not null default '{}',
  weight_step_kg numeric(5,2) not null default 2.5 check (weight_step_kg > 0),
  is_custom boolean not null default false,
  owner_id uuid references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint exercises_custom_owner_ck check ((is_custom = true and owner_id is not null) or (is_custom = false and owner_id is null))
);

comment on column public.exercises.owner_id is 'null = глобальное упражнение (видно всем). Не null = кастомное упражнение владельца.';
comment on column public.exercises.weight_step_kg is 'Шаг веса для прогрессии: 2.5 низ, 1.25 верх/изоляция, 2.0 стек.';
comment on column public.exercises.kind is 'strength — вес/повторы/RIR. cardio — время и/или дистанция, очков не даёт (17 строк сида).';

-- Глобальные слаги уникальны глобально, кастомные — в пределах владельца.
create unique index if not exists exercises_slug_global_uniq on public.exercises (slug) where owner_id is null;
create unique index if not exists exercises_slug_owner_uniq on public.exercises (owner_id, slug) where owner_id is not null;

-- Под подзапрос политики select (owner_id is null or owner_id = auth.uid()).
create index if not exists exercises_owner_idx on public.exercises (owner_id) where owner_id is not null;
-- Поиск по названию в конструкторе программ.
create index if not exists exercises_name_ru_idx on public.exercises (name_ru);
-- Фильтр списка упражнений по типу (силовые / кардио).
create index if not exists exercises_kind_idx on public.exercises (kind);
-- Фильтр по мышцам (используется при подсчёте статов в фазе 2).
create index if not exists exercises_primary_muscles_gin on public.exercises using gin (primary_muscles);
create index if not exists exercises_secondary_muscles_gin on public.exercises using gin (secondary_muscles);

alter table public.muscle_stat_map enable row level security;
alter table public.exercises enable row level security;

revoke all on public.muscle_stat_map from anon;
revoke all on public.exercises from anon;
grant select on public.muscle_stat_map to authenticated;
grant select, insert, update, delete on public.exercises to authenticated;
