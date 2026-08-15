-- 0009 | RPC жизненного цикла тренировки: start_session / finish_session.
--
-- Обе функции security INVOKER: они работают строго под RLS вызывающего,
-- дополнительных прав не выдают. Владелец проверяется явно (profile_id =
-- auth.uid()), чтобы вместо «тихо ничего не нашлось» клиент получал ошибку.
--
-- Здесь НЕТ никакого расчёта очков/статов — это фаза 2 (спека 2.2, 10.3).
-- total_score остаётся 0.

-- ---------------------------------------------------------------------------
-- Старт тренировки.
-- Частичный уникальный индекс sessions_one_active_per_profile разрешает ровно
-- одну активную сессию. Пользователь мог закрыть вкладку неделю назад и
-- бросить сессию открытой — поэтому сначала помечаем висящую как 'abandoned',
-- и только потом вставляем новую. Иначе получили бы 23505 на ровном месте.
-- ---------------------------------------------------------------------------
-- Сигнатуры менялись (см. ниже), а create or replace не умеет менять тип
-- возврата и список аргументов. Дроп делает файл безопасным для повторного
-- прогона на базе, залитой предыдущей версией этого же файла.
drop function if exists public.start_session(uuid);
drop function if exists public.finish_session(uuid);
drop function if exists public.finish_session(uuid, public.session_state, text);

create or replace function public.start_session(p_program_day_id uuid default null)
returns public.sessions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_profile uuid := (select auth.uid());
  v_session public.sessions%rowtype;
begin
  if v_profile is null then
    raise exception 'Требуется авторизация' using errcode = 'insufficient_privilege';
  end if;

  -- День программы обязан принадлежать вызывающему. null допустим — это
  -- свободная тренировка без программы.
  if p_program_day_id is not null then
    if not exists (
      select 1
      from public.program_days d
      join public.programs p on p.id = d.program_id
      where d.id = p_program_day_id
        and p.profile_id = v_profile
    ) then
      raise exception 'День программы не найден' using errcode = 'insufficient_privilege';
    end if;
  end if;

  update public.sessions
     set state = 'abandoned',
         finished_at = coalesce(finished_at, now())
   where profile_id = v_profile
     and state = 'active';

  -- Возвращаем строку целиком: клиент сразу кладёт её в кэш активной сессии
  -- и уходит на экран тренировки, не делая второй запрос.
  insert into public.sessions (profile_id, program_day_id)
  values (v_profile, p_program_day_id)
  returning * into v_session;

  return v_session;
end;
$$;

comment on function public.start_session(uuid) is 'Создаёт активную сессию, предварительно бросая висящую активную (abandoned).';

-- ---------------------------------------------------------------------------
-- Завершение тренировки.
-- 1) обновляет память автозаполнения в program_items по ПОСЛЕДНЕМУ подходу
--    каждого элемента программы этой сессии (спека 9.2);
-- 2) пересчитывает тоннаж и суммарное время кардио;
-- 3) закрывает сессию.
-- Кардио и силовые считаются раздельно: тоннаж не должен «испачкаться»
-- кардио-строками, а кардио-время не должно попадать в игровые метрики.
--
-- p_state приходит от клиента: 'finished' — тренировка честно закрыта,
-- 'abandoned' — брошена (кнопка «Бросить»). Память автозаполнения в
-- program_items обновляется только у завершённой: брошенная тренировка не
-- должна подставлять свои веса в следующую.
-- ---------------------------------------------------------------------------
create or replace function public.finish_session(
  p_session_id uuid,
  p_state public.session_state default 'finished',
  p_note text default null
)
returns public.sessions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_profile uuid := (select auth.uid());
  v_session public.sessions%rowtype;
begin
  if v_profile is null then
    raise exception 'Требуется авторизация' using errcode = 'insufficient_privilege';
  end if;

  if p_state not in ('finished', 'abandoned') then
    raise exception 'Недопустимое состояние тренировки' using errcode = 'check_violation';
  end if;

  select s.* into v_session
  from public.sessions s
  where s.id = p_session_id
    and s.profile_id = v_profile;

  if not found then
    raise exception 'Тренировка не найдена' using errcode = 'insufficient_privilege';
  end if;

  -- Закрытую сессию не трогаем: повторный вызов из офлайн-очереди должен быть
  -- безобидным и не может ни воскресить брошенную, ни отменить завершённую.
  if v_session.state <> 'active' then
    return v_session;
  end if;

  -- Память автозаполнения: последний по времени подход каждого элемента дня.
  if p_state = 'finished' then
    with last_set as (
      select distinct on (st.program_item_id)
             st.program_item_id,
             st.kind,
             st.weight_kg,
             st.reps,
             st.duration_sec,
             st.distance_m
      from public.sets st
      where st.session_id = p_session_id
        and st.program_item_id is not null
      order by st.program_item_id, st.logged_at desc, st.order_index desc
    )
    update public.program_items pi
       set last_weight_kg = case when ls.kind = 'strength'
                                 then coalesce(ls.weight_kg, pi.last_weight_kg)
                                 else pi.last_weight_kg end,
           last_reps = case when ls.kind = 'strength'
                            then coalesce(ls.reps, pi.last_reps)
                            else pi.last_reps end,
           last_duration_sec = case when ls.kind = 'cardio'
                                    then coalesce(ls.duration_sec, pi.last_duration_sec)
                                    else pi.last_duration_sec end,
           last_distance_m = case when ls.kind = 'cardio'
                                  then coalesce(ls.distance_m, pi.last_distance_m)
                                  else pi.last_distance_m end
      from last_set ls
     where pi.id = ls.program_item_id;
  end if;

  update public.sessions s
     set state = p_state,
         finished_at = coalesce(s.finished_at, now()),
         note = coalesce(p_note, s.note),
         total_volume_kg = t.volume_kg,
         total_cardio_sec = t.cardio_sec
    from (
      select
        coalesce(sum(x.weight_kg * x.reps) filter (where x.kind = 'strength'), 0)::numeric(12,2) as volume_kg,
        coalesce(sum(x.duration_sec) filter (where x.kind = 'cardio'), 0)::int as cardio_sec
      from public.sets x
      where x.session_id = p_session_id
    ) t
   where s.id = p_session_id
     and s.profile_id = v_profile
  returning s.* into v_session;

  return v_session;
end;
$$;

comment on function public.finish_session(uuid, public.session_state, text) is 'Закрывает сессию (finished/abandoned), пересчитывает тоннаж и время кардио, у завершённой обновляет память автозаполнения в program_items.';

revoke execute on function public.start_session(uuid) from public;
revoke execute on function public.finish_session(uuid, public.session_state, text) from public;
grant execute on function public.start_session(uuid) to authenticated;
grant execute on function public.finish_session(uuid, public.session_state, text) to authenticated;
