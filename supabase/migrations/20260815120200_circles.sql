-- 0003 | Круги (приватные группы), участники, инвайты.
-- Фаза 1: таблицы + минимальные политики. Полный флоу инвайтов — фаза 3.
--
-- ВАЖНО про рекурсию политик: политика circles ссылается на circle_members,
-- политика circle_members — на circles. Прямые exists-подзапросы дали бы
-- бесконечную рекурсию RLS. Поэтому обе стороны ходят друг к другу ТОЛЬКО через
-- security definer функции ниже (они выполняются в обход RLS).

create table if not exists public.circles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.circle_members (
  circle_id uuid not null references public.circles(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (circle_id, profile_id)
);

create table if not exists public.circle_invites (
  token text primary key,
  circle_id uuid not null references public.circles(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz not null,
  used_by uuid references public.profiles(id) on delete set null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

-- индексы под подзапросы политик и обратные выборки
create index if not exists circles_owner_idx on public.circles (owner_id);
create index if not exists circle_members_profile_idx on public.circle_members (profile_id);
create index if not exists circle_invites_circle_idx on public.circle_invites (circle_id);

alter table public.circles enable row level security;
alter table public.circle_members enable row level security;
alter table public.circle_invites enable row level security;

-- ---------------------------------------------------------------------------
-- Security definer хелперы (search_path = '', все имена — полные).
-- ---------------------------------------------------------------------------
create or replace function public.is_circle_member(p_circle_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.circle_members m
    where m.circle_id = p_circle_id
      and m.profile_id = (select auth.uid())
  );
$$;

comment on function public.is_circle_member(uuid) is 'Текущий пользователь состоит в круге. Обходит RLS, чтобы не было рекурсии политик.';

create or replace function public.is_circle_owner(p_circle_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.circles c
    where c.id = p_circle_id
      and c.owner_id = (select auth.uid())
  );
$$;

comment on function public.is_circle_owner(uuid) is 'Текущий пользователь — владелец круга. Обходит RLS.';

-- Есть ли общий круг у текущего пользователя и p_profile_id (для видимости профилей).
create or replace function public.shares_circle_with(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.circle_members me
    join public.circle_members other on other.circle_id = me.circle_id
    where me.profile_id = (select auth.uid())
      and other.profile_id = p_profile_id
  );
$$;

comment on function public.shares_circle_with(uuid) is 'Текущий пользователь и p_profile_id состоят в одном круге. Обходит RLS.';

revoke execute on function public.is_circle_member(uuid) from public;
revoke execute on function public.is_circle_owner(uuid) from public;
revoke execute on function public.shares_circle_with(uuid) from public;
grant execute on function public.is_circle_member(uuid) to authenticated;
grant execute on function public.is_circle_owner(uuid) to authenticated;
grant execute on function public.shares_circle_with(uuid) to authenticated;

revoke all on public.circles from anon;
revoke all on public.circle_members from anon;
revoke all on public.circle_invites from anon;
grant select, insert, update, delete on public.circles to authenticated;
grant select, insert, delete on public.circle_members to authenticated;
grant select, insert, update, delete on public.circle_invites to authenticated;
