-- 0010 | Журнал веса тела: история измерений под график в профиле.
--
-- profiles.bodyweight_kg остаётся «текущим весом» — его читают упражнения с
-- собственным весом и вся фаза 2. Но источником истины становится журнал:
-- триггер сносит в профиль вес самого свежего измерения.
--
-- Направление синхронизации ровно одно, журнал -> профиль. Обратного нет
-- намеренно: два триггера, пишущих друг в друга, гоняют строку по кругу, а
-- задним числом исправленное измерение порождало бы фантомную запись за
-- сегодня. Поэтому вес правится только через журнал.

create table if not exists public.bodyweight_entries (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  -- Дата, а не метка времени: вес меряют утром натощак и записывают «за день».
  -- Дату присылает клиент (свой локальный день), потому что сервер живёт в UTC
  -- и в Москве после полуночи current_date отдал бы вчерашнее число.
  measured_on date not null,
  -- Границы те же, что у profiles.bodyweight_kg: значения ходят между колонками.
  weight_kg numeric(5,2) not null check (weight_kg > 20 and weight_kg < 400),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Одно измерение на день: повторная запись за ту же дату заменяет прежнюю.
  -- Индекс этого констрейнта закрывает и «последнее измерение профиля»
  -- (order by measured_on desc limit 1) — отдельного индекса не нужно.
  constraint bodyweight_entries_day_uniq unique (profile_id, measured_on)
);

comment on table public.bodyweight_entries is 'История измерений веса тела, одно значение на дату.';
comment on column public.bodyweight_entries.measured_on is 'Локальная дата пользователя, приходит с клиента.';

alter table public.bodyweight_entries enable row level security;

drop trigger if exists bodyweight_entries_set_updated_at on public.bodyweight_entries;
create trigger bodyweight_entries_set_updated_at
  before update on public.bodyweight_entries
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Текущий вес профиля = вес последнего измерения.
-- security invoker: строку профиля правит сам владелец, его пускает
-- profiles_update_self, а чужой profile_id не пройдёт политику журнала.
-- ---------------------------------------------------------------------------
create or replace function public.sync_profile_bodyweight()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_profile uuid;
  v_latest numeric(5,2);
begin
  -- В DELETE-триггере new не присвоена, обращение к её полю падает.
  if tg_op = 'DELETE' then
    v_profile := old.profile_id;
  else
    v_profile := new.profile_id;
  end if;

  select e.weight_kg into v_latest
  from public.bodyweight_entries e
  where e.profile_id = v_profile
  order by e.measured_on desc
  limit 1;

  -- Журнал опустел -> вес профиля тоже становится null.
  update public.profiles p
     set bodyweight_kg = v_latest
   where p.id = v_profile
     and p.bodyweight_kg is distinct from v_latest;

  return null;
end;
$$;

comment on function public.sync_profile_bodyweight() is 'Держит profiles.bodyweight_kg равным весу последнего измерения.';

drop trigger if exists bodyweight_entries_sync_profile on public.bodyweight_entries;
create trigger bodyweight_entries_sync_profile
  after insert or update or delete on public.bodyweight_entries
  for each row execute function public.sync_profile_bodyweight();

-- ---------------------------------------------------------------------------
-- RLS. Политика живёт здесь, а не в общем файле 0008: та миграция уже
-- применена на проекте, дописывать в неё задним числом нельзя.
-- ---------------------------------------------------------------------------
drop policy if exists bodyweight_entries_all_own on public.bodyweight_entries;
create policy bodyweight_entries_all_own on public.bodyweight_entries
  for all to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

revoke all on public.bodyweight_entries from anon;
grant select, insert, update, delete on public.bodyweight_entries to authenticated;

-- ---------------------------------------------------------------------------
-- Перенос уже введённых весов: у кого профиль заполнен, у того график
-- начинается с одной точки, а не с пустого экрана.
-- ---------------------------------------------------------------------------
insert into public.bodyweight_entries (profile_id, measured_on, weight_kg)
select p.id, (p.updated_at at time zone 'utc')::date, p.bodyweight_kg
from public.profiles p
where p.bodyweight_kg is not null
on conflict (profile_id, measured_on) do nothing;
