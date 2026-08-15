-- 0007 | Таблица тюнинг-констант игрового слоя (спека, раздел 13).
-- Значения заливает supabase/seed/0001_muscle_stat_map.sql.
-- Клиент читает только select; менять значения можно из дашборда (service_role).

create table if not exists public.game_config (
  key text primary key,
  value jsonb not null,
  description text,
  updated_at timestamptz not null default now()
);

comment on table public.game_config is 'Все «константы под тюнинг» в одном месте, чтобы не искать магические числа по репозиторию.';

drop trigger if exists game_config_set_updated_at on public.game_config;
create trigger game_config_set_updated_at
  before update on public.game_config
  for each row execute function public.set_updated_at();

alter table public.game_config enable row level security;

revoke all on public.game_config from anon;
grant select on public.game_config to authenticated;
