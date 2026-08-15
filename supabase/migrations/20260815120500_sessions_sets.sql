-- 0006 | Тренировочные сессии и подходы.
--
-- ФАЗА 1: игровой слой не считается. Колонки e1rm / e1rm_ref / ri / score
-- остаются NULL — триггер расчёта очков появится в ФАЗЕ 2 (спека 2.2, 10.3).
-- Здесь его сознательно НЕТ. Считаем только тоннаж (weight_kg * reps) —
-- это не игровая метрика, её пересчитывает finish_session().
--
-- КАРДИО (осознанное отступление от спеки, решение владельца продукта).
-- Строка с kind = 'cardio' — это факт «пробежал 10 минут перед тренировкой».
-- Она НИКОГДА не даёт очков и не влияет на статы, уровни, класс, тоннаж
-- и готовность. Когда в ФАЗЕ 2 появится триггер расчёта score, он ОБЯЗАН
-- пропускать строки с kind = 'cardio' (иначе ломается формула RI из спеки 2.2:
-- у кардио нет ни веса, ни повторов, ни RIR). Кардио также не участвует
-- в движке прогрессии нагрузок (спека 4) и в детекторе застоя.

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  program_day_id uuid references public.program_days(id) on delete set null,
  raid_id uuid, -- FK на raids появится в фазе 5
  state public.session_state not null default 'active',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  total_score numeric(10,2) not null default 0,
  total_volume_kg numeric(12,2) not null default 0,
  total_cardio_sec int not null default 0,
  readiness_at_start smallint,
  note text,
  created_at timestamptz not null default now()
);

comment on column public.sessions.total_score is 'Фаза 2. В фазе 1 всегда 0.';
comment on column public.sessions.total_volume_kg is 'Тоннаж только силовых подходов. Кардио сюда не попадает никогда.';
comment on column public.sessions.total_cardio_sec is 'Суммарное время кардио-отрезков сессии. Показывается отдельной строкой, не смешивается с тоннажем.';
comment on column public.sessions.raid_id is 'Фаза 5. FK намеренно не создан, таблицы raids ещё нет.';

-- Не более одной активной сессии на профиль. start_session() сначала
-- закрывает висящую активную, чтобы не ловить конфликт по этому индексу.
create unique index if not exists sessions_one_active_per_profile on public.sessions (profile_id) where state = 'active';

-- exercise_id: no action DEFERRABLE INITIALLY DEFERRED вместо restrict.
-- Запрет на удаление используемого упражнения сохраняется, но проверяется
-- в конце транзакции. Немедленный restrict делал пользователя неудаляемым:
-- delete из auth.users каскадом сносит profiles -> его кастомные упражнения,
-- и проверка срабатывала раньше, чем каскад доходил до sets/program_items.
create table if not exists public.sets (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id)
    on delete no action deferrable initially deferred,
  program_item_id uuid references public.program_items(id) on delete set null,
  order_index int not null,
  kind public.exercise_kind not null default 'strength', -- проставляется триггером из exercises.kind, клиенту не доверяем
  -- силовой подход
  weight_kg numeric(6,2) check (weight_kg >= 0),
  reps smallint check (reps between 1 and 100),
  rir smallint check (rir between 0 and 5),
  -- кардио-отрезок
  duration_sec int check (duration_sec between 1 and 36000),
  distance_m numeric(8,1) check (distance_m > 0),
  e1rm numeric(8,3),      -- заполнит триггер в фазе 2
  e1rm_ref numeric(8,3),  -- заполнит триггер в фазе 2
  ri numeric(6,4),        -- заполнит триггер в фазе 2
  score numeric(10,3),    -- заполнит триггер в фазе 2
  client_id uuid not null, -- идемпотентность оптимистичной очереди, генерится клиентом
  logged_at timestamptz not null default now(),
  constraint sets_shape_ck check (
    (kind = 'strength' and weight_kg is not null and reps is not null and rir is not null
       and duration_sec is null and distance_m is null)
    or
    (kind = 'cardio' and (duration_sec is not null or distance_m is not null)
       and weight_kg is null and reps is null and rir is null)
  )
);

comment on column public.sets.client_id is 'UUID от клиента. Уникален в пределах сессии: повторная отправка из офлайн-очереди не создаёт дубль.';
comment on column public.sets.score is 'Фаза 2. В фазе 1 остаётся null, триггера расчёта нет. Для kind = cardio останется null навсегда.';
comment on column public.sets.kind is 'Копия exercises.kind на момент лога. Проставляется триггером set_set_kind, значение клиента игнорируется.';

-- Для баз, залитых предыдущей версией файла: переводим FK на отложенную
-- проверку (drop + add идемпотентны, имя совпадает с автогенерируемым).
alter table public.sets drop constraint if exists sets_exercise_id_fkey;
alter table public.sets
  add constraint sets_exercise_id_fkey
  foreign key (exercise_id) references public.exercises(id)
  on delete no action deferrable initially deferred;

-- Идемпотентность очереди мутаций: повтор той же строки упрётся в этот индекс.
create unique index if not exists sets_session_client_uniq on public.sets (session_id, client_id);
create index if not exists sets_exercise_logged_idx on public.sets (exercise_id, logged_at desc);
create index if not exists sets_session_idx on public.sets (session_id);
create index if not exists sessions_profile_started_idx on public.sessions (profile_id, started_at desc);

-- Дополнительно: под обновление памяти автозаполнения в finish_session().
create index if not exists sets_program_item_idx on public.sets (program_item_id) where program_item_id is not null;

-- ---------------------------------------------------------------------------
-- Тип подхода берётся из справочника упражнений, а не от клиента.
-- Без этого триггера sets_shape_ck обходится: клиент прислал бы kind = 'cardio'
-- для штанги и записал бы «подход» без веса и RIR.
-- security definer обязателен: под RLS клиента строка exercises может быть
-- не видна (чужое кастомное упражнение), и select вернул бы null.
-- ---------------------------------------------------------------------------
create or replace function public.set_set_kind()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind public.exercise_kind;
begin
  select e.kind into v_kind
  from public.exercises e
  where e.id = new.exercise_id;

  if v_kind is null then
    raise exception 'Упражнение % не найдено', new.exercise_id using errcode = 'foreign_key_violation';
  end if;

  new.kind := v_kind;
  return new;
end;
$$;

comment on function public.set_set_kind() is 'Перезаписывает sets.kind значением exercises.kind. Клиентскому значению не доверяем.';

-- Ловим и вставку, и попытку подменить kind апдейтом.
drop trigger if exists sets_set_kind on public.sets;
create trigger sets_set_kind
  before insert or update of exercise_id, kind on public.sets
  for each row execute function public.set_set_kind();

alter table public.sessions enable row level security;
alter table public.sets enable row level security;

revoke all on public.sessions from anon;
revoke all on public.sets from anon;
grant select, insert, update, delete on public.sessions to authenticated;
grant select, insert, update, delete on public.sets to authenticated;
