-- 0005 | Программы тренировок: программа → дни → упражнения дня.
-- program_items хранит память автозаполнения (last_*), её обновляет
-- public.finish_session() из миграции 0009.
--
-- Цели элемента программы разделены по типу упражнения:
--   силовые — rep_min / rep_max / target_rir  (у кардио-элементов null)
--   кардио  — target_duration_sec / target_distance_m (у силовых null)
-- Констрейнт на «правильную форму» здесь намеренно НЕ ставим: exercises.kind
-- живёт в другой таблице, а обращение к ней из check запрещено. Форму
-- гарантирует UI, а жёстко её проверяет только таблица sets (sets_shape_ck).

create table if not exists public.programs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 64),
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- У профиля не может быть двух активных программ одновременно.
create unique index if not exists programs_one_active_per_profile on public.programs (profile_id) where is_active;

create table if not exists public.program_days (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  order_index int not null,
  name text not null check (char_length(name) between 1 and 48),
  created_at timestamptz not null default now()
);

-- exercise_id: no action DEFERRABLE INITIALLY DEFERRED, а не restrict.
-- Смысл прежний — используемое упражнение удалить нельзя, — но проверка
-- откладывается до конца транзакции. Без этого удаление аккаунта невозможно:
-- profiles удаляется каскадом из auth.users, каскад доходит до кастомных
-- упражнений владельца РАНЬШЕ, чем до program_items (те лежат на три уровня
-- ниже: profiles -> programs -> program_days -> program_items), и немедленный
-- restrict падает с 23503 на живых ещё строках. См. тот же приём в sets.
create table if not exists public.program_items (
  id uuid primary key default gen_random_uuid(),
  program_day_id uuid not null references public.program_days(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id)
    on delete no action deferrable initially deferred,
  order_index int not null,
  target_sets smallint not null default 3 check (target_sets between 1 and 12),
  -- силовые цели: null у кардио-элементов
  rep_min smallint check (rep_min between 1 and 100),
  rep_max smallint check (rep_max between 1 and 100),
  target_rir smallint check (target_rir between 0 and 5),
  -- кардио-цели: null у силовых элементов
  target_duration_sec int check (target_duration_sec between 10 and 36000),
  target_distance_m numeric(8,1) check (target_distance_m > 0),
  -- память для автозаполнения
  last_weight_kg numeric(6,2) check (last_weight_kg >= 0),
  last_reps smallint check (last_reps between 1 and 100),
  last_duration_sec int check (last_duration_sec > 0),
  last_distance_m numeric(8,1) check (last_distance_m > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint program_items_rep_range_ck check (rep_min is null or rep_max is null or rep_max >= rep_min)
);

comment on column public.program_items.last_weight_kg is 'Память прошлой сессии для предзаполнения формы (спека 9.2).';
comment on column public.program_items.last_reps is 'Память прошлой сессии для предзаполнения формы (спека 9.2).';
comment on column public.program_items.last_duration_sec is 'Память прошлой сессии для кардио-элемента.';
comment on column public.program_items.last_distance_m is 'Память прошлой сессии для кардио-элемента, метры.';

-- Для баз, залитых предыдущей версией файла (create table if not exists уже
-- ничего не изменит): переводим FK на отложенную проверку. drop + add
-- идемпотентны, имя констрейнта совпадает с автогенерируемым.
alter table public.program_items drop constraint if exists program_items_exercise_id_fkey;
alter table public.program_items
  add constraint program_items_exercise_id_fkey
  foreign key (exercise_id) references public.exercises(id)
  on delete no action deferrable initially deferred;

-- Индексы под exists-подзапросы политик и под сортировку в редакторе программ.
create index if not exists programs_profile_idx on public.programs (profile_id);
create index if not exists program_days_program_order_idx on public.program_days (program_id, order_index);
create index if not exists program_items_day_order_idx on public.program_items (program_day_id, order_index);
create index if not exists program_items_exercise_idx on public.program_items (exercise_id);

alter table public.programs enable row level security;
alter table public.program_days enable row level security;
alter table public.program_items enable row level security;

drop trigger if exists programs_set_updated_at on public.programs;
create trigger programs_set_updated_at
  before update on public.programs
  for each row execute function public.set_updated_at();

drop trigger if exists program_items_set_updated_at on public.program_items;
create trigger program_items_set_updated_at
  before update on public.program_items
  for each row execute function public.set_updated_at();

revoke all on public.programs from anon;
revoke all on public.program_days from anon;
revoke all on public.program_items from anon;
grant select, insert, update, delete on public.programs to authenticated;
grant select, insert, update, delete on public.program_days to authenticated;
grant select, insert, update, delete on public.program_items to authenticated;
