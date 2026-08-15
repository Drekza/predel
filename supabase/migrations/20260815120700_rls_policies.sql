-- 0008 | RLS-политики на все таблицы схемы public (спека, раздел 14).
--
-- Сам RLS включён в миграции каждой таблицы (fail-closed: таблица существует
-- без единой политики → не видна никому, кроме service_role). Политики
-- собраны здесь одним файлом, потому что часть из них ссылается на таблицы
-- из соседних миграций (profiles ↔ circle_members), и порядок применения
-- в одном файле читать проще, чем восстанавливать по семи.
--
-- Везде auth.uid() завёрнут в (select auth.uid()): так планировщик вычисляет
-- его один раз на запрос, а не на каждую строку.
--
-- Роль anon нигде не получает политик: приложение приватное, без авторизации
-- не показываем ничего.

-- ---------------------------------------------------------------------------
-- profiles: свой профиль всегда; чужой — только если есть общий круг.
-- Проверка круга идёт через security definer функцию, иначе политика profiles
-- полезла бы в circle_members под RLS и получила бы рекурсию.
-- ---------------------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.shares_circle_with(id));

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()));

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- delete нет намеренно: профиль умирает каскадом вместе с auth.users.

-- ---------------------------------------------------------------------------
-- exercises: глобальный справочник читают все авторизованные,
-- писать можно только собственные кастомные упражнения.
-- ---------------------------------------------------------------------------
drop policy if exists exercises_select on public.exercises;
create policy exercises_select on public.exercises
  for select to authenticated
  using (owner_id is null or owner_id = (select auth.uid()));

drop policy if exists exercises_insert_own on public.exercises;
create policy exercises_insert_own on public.exercises
  for insert to authenticated
  with check (owner_id = (select auth.uid()) and is_custom = true);

drop policy if exists exercises_update_own on public.exercises;
create policy exercises_update_own on public.exercises
  for update to authenticated
  using (owner_id = (select auth.uid()) and is_custom = true)
  with check (owner_id = (select auth.uid()) and is_custom = true);

drop policy if exists exercises_delete_own on public.exercises;
create policy exercises_delete_own on public.exercises
  for delete to authenticated
  using (owner_id = (select auth.uid()) and is_custom = true);

-- ---------------------------------------------------------------------------
-- Справочники только на чтение. Политик на insert/update/delete нет вообще —
-- значит запись невозможна ни для кого, кроме service_role (он вне RLS).
-- ---------------------------------------------------------------------------
drop policy if exists muscle_stat_map_select on public.muscle_stat_map;
create policy muscle_stat_map_select on public.muscle_stat_map
  for select to authenticated
  using (true);

drop policy if exists game_config_select on public.game_config;
create policy game_config_select on public.game_config
  for select to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- programs / program_days / program_items: полный CRUD только владельцу.
-- Дочерние таблицы проверяются exists-подзапросом до programs.profile_id.
-- Индексы под эти подзапросы созданы в миграции 0005:
--   programs_profile_idx, program_days_program_order_idx (program_id — ведущая),
--   program_items_day_order_idx (program_day_id — ведущая).
-- ---------------------------------------------------------------------------
drop policy if exists programs_all_own on public.programs;
create policy programs_all_own on public.programs
  for all to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

drop policy if exists program_days_all_own on public.program_days;
create policy program_days_all_own on public.program_days
  for all to authenticated
  using (
    exists (
      select 1 from public.programs p
      where p.id = program_days.program_id
        and p.profile_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.programs p
      where p.id = program_days.program_id
        and p.profile_id = (select auth.uid())
    )
  );

drop policy if exists program_items_all_own on public.program_items;
create policy program_items_all_own on public.program_items
  for all to authenticated
  using (
    exists (
      select 1
      from public.program_days d
      join public.programs p on p.id = d.program_id
      where d.id = program_items.program_day_id
        and p.profile_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.program_days d
      join public.programs p on p.id = d.program_id
      where d.id = program_items.program_day_id
        and p.profile_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- sessions / sets: только свои. sets ходят до владельца через sessions.
-- Индекс sets_session_idx (миграция 0006) закрывает этот подзапрос.
-- ---------------------------------------------------------------------------
drop policy if exists sessions_all_own on public.sessions;
create policy sessions_all_own on public.sessions
  for all to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

drop policy if exists sets_all_own on public.sets;
create policy sets_all_own on public.sets
  for all to authenticated
  using (
    exists (
      select 1 from public.sessions s
      where s.id = sets.session_id
        and s.profile_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.sessions s
      where s.id = sets.session_id
        and s.profile_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- circles / circle_members / circle_invites — минимум фазы 1.
-- Полный флоу инвайтов (обмен токена на членство) — фаза 3, он будет
-- отдельной security definer RPC, а не политикой: сейчас редимить некому.
--
-- ВСЯ перекрёстная проверка circles ↔ circle_members идёт только через
-- security definer функции is_circle_member / is_circle_owner (миграция 0003).
-- Прямые exists-подзапросы между этими двумя таблицами дают бесконечную
-- рекурсию политик (42P17 infinite recursion detected in policy for relation).
-- ---------------------------------------------------------------------------
drop policy if exists circles_select on public.circles;
create policy circles_select on public.circles
  for select to authenticated
  using (owner_id = (select auth.uid()) or public.is_circle_member(id));

drop policy if exists circles_insert_own on public.circles;
create policy circles_insert_own on public.circles
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

drop policy if exists circles_update_owner on public.circles;
create policy circles_update_owner on public.circles
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists circles_delete_owner on public.circles;
create policy circles_delete_owner on public.circles
  for delete to authenticated
  using (owner_id = (select auth.uid()));

-- Участник видит состав своих кругов; владелец видит состав своего круга.
drop policy if exists circle_members_select on public.circle_members;
create policy circle_members_select on public.circle_members
  for select to authenticated
  using (
    profile_id = (select auth.uid())
    or public.is_circle_member(circle_id)
    or public.is_circle_owner(circle_id)
  );

-- Фаза 1: вписать в круг можно ТОЛЬКО САМОГО СЕБЯ, и только владельцу круга
-- (то есть создатель круга становится его первым участником).
--
-- Проверять один лишь is_circle_owner() нельзя: круг создаёт любой
-- авторизованный (circles_insert_own), и владелец без согласия жертвы вписал
-- бы в свой круг чужой profile_id. Дальше shares_circle_with() отдала бы ему
-- чужую строку profiles — полный обход изоляции профилей, причём выход из
-- круга такой доступ не отзывает. В фазе 3 на этот же предикат сядут статы
-- и лидерборд, поэтому дыру закрываем сразу.
--
-- Вступление чужого профиля появится в фазе 3 отдельной security definer RPC,
-- меняющей circle_invites.token на членство: согласие вступающего обязательно.
drop policy if exists circle_members_insert_owner on public.circle_members;
create policy circle_members_insert_owner on public.circle_members
  for insert to authenticated
  with check (public.is_circle_owner(circle_id) and profile_id = (select auth.uid()));

-- Выйти можно самому; выгнать — только владельцу.
drop policy if exists circle_members_delete on public.circle_members;
create policy circle_members_delete on public.circle_members
  for delete to authenticated
  using (profile_id = (select auth.uid()) or public.is_circle_owner(circle_id));

drop policy if exists circle_invites_select_owner on public.circle_invites;
create policy circle_invites_select_owner on public.circle_invites
  for select to authenticated
  using (created_by = (select auth.uid()) or public.is_circle_owner(circle_id));

drop policy if exists circle_invites_insert_owner on public.circle_invites;
create policy circle_invites_insert_owner on public.circle_invites
  for insert to authenticated
  with check (public.is_circle_owner(circle_id) and created_by = (select auth.uid()));

drop policy if exists circle_invites_update_owner on public.circle_invites;
create policy circle_invites_update_owner on public.circle_invites
  for update to authenticated
  using (public.is_circle_owner(circle_id))
  with check (public.is_circle_owner(circle_id));

drop policy if exists circle_invites_delete_owner on public.circle_invites;
create policy circle_invites_delete_owner on public.circle_invites
  for delete to authenticated
  using (public.is_circle_owner(circle_id));
