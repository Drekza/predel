-- 0002 | Профили пользователей + автосоздание профиля при регистрации.
-- RLS включается сразу при создании таблицы (fail-closed), политики — в миграции 0008.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null check (char_length(nickname) between 2 and 32),
  bodyweight_kg numeric(5,2) check (bodyweight_kg > 20 and bodyweight_kg < 400),
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Профиль пользователя, 1:1 с auth.users.';
comment on column public.profiles.onboarded_at is 'Не null — онбординг пройден, пускаем в приложение.';

alter table public.profiles enable row level security;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Автосоздание профиля после регистрации в auth.users.
-- Никогда не роняем регистрацию: конфликт гасим on conflict do nothing,
-- любую другую ошибку — перехватываем.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nickname text;
begin
  v_nickname := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'nickname'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'user'
  );
  v_nickname := left(v_nickname, 32);
  -- страхуемся от check (char_length between 2 and 32)
  if char_length(v_nickname) < 2 then
    v_nickname := v_nickname || '_u';
  end if;

  begin
    insert into public.profiles (id, nickname)
    values (new.id, v_nickname)
    on conflict (id) do nothing;
  exception when others then
    -- регистрация важнее профиля: профиль дозаполнит онбординг
    null;
  end;

  return new;
end;
$$;

comment on function public.handle_new_user() is 'After insert на auth.users: создаёт строку в public.profiles.';

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

revoke all on public.profiles from anon;
grant select, insert, update on public.profiles to authenticated;
