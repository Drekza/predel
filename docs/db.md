# База данных: схема, политики, решения

Фаза 1. Как накатить — в [`supabase/README.md`](../supabase/README.md).
Продуктовая логика и формулы — в `gym-rpg-spec.md`.

---

## 1. Карта таблиц

| Таблица | Назначение | Фаза |
|---|---|---|
| `profiles` | 1:1 с `auth.users`: ник, вес тела, факт онбординга | 1 |
| `circles`, `circle_members`, `circle_invites` | приватный круг, участники, инвайты | 1 (таблицы) / 3 (флоу) |
| `muscle_stat_map` | 17 строк «мышца → стат», без ручного авторинга | 1 |
| `exercises` | справочник: глобальный (`owner_id is null`) + кастомные | 1 |
| `programs`, `program_days`, `program_items` | конструктор программ + память автозаполнения | 1 |
| `sessions`, `sets` | тренировки и подходы | 1 |
| `game_config` | все тюнинг-константы из раздела 13 спеки | 1 |

Три enum-типа: `stat_key` (7 статов), `session_state` (`active`/`finished`/`abandoned`),
`exercise_kind` (`strength`/`cardio`).

---

## 2. Ключевые решения

### 2.1 Одна активная сущность — частичный уникальный индекс

```sql
create unique index programs_one_active_per_profile on public.programs (profile_id) where is_active;
create unique index sessions_one_active_per_profile on public.sessions (profile_id) where state = 'active';
```

Инвариант «одна активная программа» и «одна активная тренировка» держит база, а не UI.
Плата за это: клиент, включающий новую активную программу, обязан сначала снять флаг
со старой (иначе `23505`), а `start_session()` сначала помечает висящую сессию как
`abandoned`. Это осознанно: восстановить «одну активную» после рассинхрона клиентов
дороже, чем написать два запроса подряд.

### 2.2 Идемпотентность оптимистичной очереди

```sql
create unique index sets_session_client_uniq on public.sets (session_id, client_id);
```

`client_id` генерит клиент (`crypto.randomUUID()`), офлайн-очередь в localStorage может
отправить одну и ту же строку дважды. Второй раз она упрётся в этот индекс — дубля не
будет. Клиент трактует `23505` на `sets` как успех, а не как ошибку.

### 2.3 Тип подхода — из справочника, не от клиента

`sets.kind` копируется триггером `set_set_kind()` из `exercises.kind`:

```sql
create trigger sets_set_kind
  before insert or update of exercise_id, kind on public.sets
  for each row execute function public.set_set_kind();
```

Без этого `sets_shape_ck` обходится тривиально: прислал `kind = 'cardio'` для штанги —
и записал «подход» без веса и RIR. Триггер ловит и вставку, и попытку подменить `kind`
апдейтом (контракт требовал минимум `update of exercise_id`; `kind` добавлен как строгое
надмножество, поведение от этого только жёстче).

Триггер `security definer` с `search_path = ''`: под RLS вызывающего строка в `exercises`
может быть не видна (чужое кастомное упражнение), и `select` вернул бы `null`.
Ненайденное упражнение — исключение с кодом `foreign_key_violation`.

BEFORE-триггеры отрабатывают до проверки check-констрейнтов, так что `sets_shape_ck`
всегда видит уже правильный `kind`.

### 2.4 Кардио — отдельная форма строки, не отдельная таблица

`sets_shape_ck` разрешает ровно две формы:

- `strength` — есть `weight_kg`, `reps`, `rir`; `duration_sec` и `distance_m` обязаны быть `null`;
- `cardio` — есть `duration_sec` и/или `distance_m`; `weight_kg`, `reps`, `rir` обязаны быть `null`.

Отдельная таблица `cardio_sets` дала бы вторую сущность в UNION для каждой выборки
истории ради 17 упражнений из восьмисот. Один констрейнт дешевле.

**Кардио не даёт очков — это правило, а не умолчание.** `total_volume_kg` считается
`filter (where kind = 'strength')`, кардио-время живёт в отдельной колонке
`sessions.total_cardio_sec`. В фазе 2 триггер расчёта `score` обязан пропускать строки
с `kind = 'cardio'` — иначе ломается формула RI (у кардио нет ни веса, ни повторов,
ни RIR). Явные напоминания об этом стоят в шапке миграции `..._sessions_sets.sql`
и в ключе `game_config.cardio_gives_score`.

### 2.5 Цели в `program_items` — без констрейнта формы

`rep_min/rep_max/target_rir` (силовые) и `target_duration_sec/target_distance_m` (кардио)
все nullable, и правило «либо одни, либо другие» на уровне БД не проверяется. Причина
техническая: `exercises.kind` лежит в другой таблице, а обращаться к ней из `check`
Postgres не разрешает. Ставить ради этого ещё один триггер не стали — цена ошибки нулевая
(это подсказка для формы, а не факт тренировки), а жёсткую проверку формы несёт `sets`.

### 2.6 Память автозаполнения живёт в `program_items`

`last_weight_kg`, `last_reps`, `last_duration_sec`, `last_distance_m` обновляет
`finish_session()` по последнему подходу каждого элемента дня. Альтернатива — считать
последнюю сессию оконным запросом по `sets` на каждом открытии экрана — это лишний
джойн в самом горячем сценарии (спека 9.2: форма открывается потными руками между
подходами). Денормализация здесь оправдана.

Обновление идёт через `coalesce`: кардио-подход, записанный только дистанцией, не
затирает ранее запомненное время.

### 2.7 Очки не считаются в фазе 1

Колонки `sets.e1rm`, `e1rm_ref`, `ri`, `score` и `sessions.total_score` созданы, но
остаются пустыми. Триггера расчёта нет намеренно (спека 2.2, 10.3 — фаза 2). Колонки
заведены сразу, чтобы фаза 2 была одним триггером, а не миграцией с переписыванием
истории. Тоннаж считается уже сейчас: это измерение, а не игровой слой.

---

## 3. RLS

RLS включается в миграции каждой таблицы, сразу при её создании. Политики собраны
одним файлом `..._rls_policies.sql` последним по порядку.

**Почему так, а не «политики рядом с таблицей»:** часть политик ссылается на соседние
таблицы (`profiles` → `circle_members`, `sets` → `sessions`), и при раскладке по файлам
пришлось бы либо тасовать порядок миграций, либо дублировать security definer хелперы.
Одним файлом видно всю поверхность доступа целиком — а это ровно тот код, который
читают глазами, когда проверяют, не утекут ли чужие данные.

Пока таблица создана и RLS включён, но политики ещё не применены, она **не видна никому**
кроме `service_role` — fail-closed. Промежуточное состояние между миграциями безопасно.

`anon` не получает ни грантов, ни политик: приложение приватное.

Везде используется `(select auth.uid())`, а не голый `auth.uid()` — так планировщик
вычисляет значение один раз на запрос (InitPlan), а не на каждую строку.

### 3.1 Таблица политик

| Таблица | select | insert | update | delete |
|---|---|---|---|---|
| `profiles` | свой ИЛИ есть общий круг | `id = auth.uid()` | `id = auth.uid()` | нет (каскад от `auth.users`) |
| `exercises` | `owner_id is null` ИЛИ свой | свой кастомный | свой кастомный | свой кастомный |
| `muscle_stat_map` | все авторизованные | — | — | — |
| `game_config` | все авторизованные | — | — | — |
| `programs` | владелец | владелец | владелец | владелец |
| `program_days` | через `programs` | через `programs` | через `programs` | через `programs` |
| `program_items` | через `program_days`→`programs` | то же | то же | то же |
| `sessions` | владелец | владелец | владелец | владелец |
| `sets` | через `sessions` | через `sessions` | через `sessions` | через `sessions` |
| `circles` | владелец ИЛИ участник | владелец | владелец | владелец |
| `circle_members` | свой ИЛИ участник круга ИЛИ владелец круга | владелец круга, и только сам себя | — | сам себя ИЛИ владелец |
| `circle_invites` | автор ИЛИ владелец круга | владелец круга | владелец круга | владелец круга |

Прочерк «—» означает, что политики нет вообще, то есть операция запрещена всем ролям,
кроме `service_role`.

### 3.2 Рекурсия политик кругов

Политика `circles` должна знать участников, политика `circle_members` — владельца круга.
Прямые `exists`-подзапросы дали бы `42P17 infinite recursion detected in policy for
relation`: политика A читает таблицу B, чья политика читает таблицу A.

Разрыв цикла — три `security definer` функции в миграции кругов:

- `public.is_circle_member(uuid)` — текущий пользователь состоит в круге;
- `public.is_circle_owner(uuid)` — текущий пользователь владеет кругом;
- `public.shares_circle_with(uuid)` — у текущего пользователя и переданного профиля есть общий круг (для видимости чужих профилей).

Все три `stable`, `set search_path = ''`, все имена внутри — полные (`public.circle_members`,
`auth.uid()`). Пустой `search_path` обязателен: иначе владелец функции (а она `definer`)
может быть уведён на подставленную схему. `execute` отозван у `public` и выдан только
`authenticated`.

Функции читают таблицы в обход RLS — это их работа. Утечки нет: каждая отвечает строго
`boolean` про самого вызывающего, а не отдаёт строки.

### 3.3 Индексы под подзапросы политик

Политика с `exists` выполняется на каждой строке результата, поэтому все её подзапросы
должны идти по индексу, иначе получим seq scan на каждый чих:

| Подзапрос политики | Индекс |
|---|---|
| `program_days` → `programs.id` | PK `programs` |
| `program_items` → `program_days.id` | PK `program_days` |
| `sets` → `sessions.id` | PK `sessions` |
| `programs` по владельцу | `programs_profile_idx (profile_id)` |
| выборка дней программы | `program_days_program_order_idx (program_id, order_index)` |
| выборка упражнений дня | `program_items_day_order_idx (program_day_id, order_index)` |
| выборка подходов сессии | `sets_session_idx (session_id)` |
| `is_circle_member` / `shares_circle_with` | PK `circle_members` + `circle_members_profile_idx (profile_id)` |
| `is_circle_owner` | `circles_owner_idx (owner_id)` |
| `exercises` по владельцу | `exercises_owner_idx (owner_id) where owner_id is not null` |

---

## 4. Функции

| Функция | Режим | Что делает |
|---|---|---|
| `public.set_updated_at()` | invoker | общий BEFORE UPDATE триггер на `profiles`, `programs`, `program_items`, `game_config` |
| `public.handle_new_user()` | definer | AFTER INSERT на `auth.users` → строка в `profiles` |
| `public.set_set_kind()` | definer | BEFORE INSERT/UPDATE на `sets` → `kind` из `exercises` |
| `public.is_circle_member(uuid)` | definer | членство в круге, разрыв рекурсии политик |
| `public.is_circle_owner(uuid)` | definer | владение кругом |
| `public.shares_circle_with(uuid)` | definer | общий круг с другим профилем |
| `public.start_session(uuid)` | invoker | старт тренировки |
| `public.finish_session(uuid, session_state, text)` | invoker | завершение или отказ от тренировки |

Все `security definer` функции объявлены с `set search_path = ''` и полными именами схем.

### 4.1 `handle_new_user()`

Ник берётся как `coalesce(raw_user_meta_data->>'nickname', split_part(email,'@',1))`,
обрезается до 32 символов и добивается до минимальных двух — под `check` таблицы.
Вставка идёт с `on conflict (id) do nothing` и вдобавок завёрнута в `exception when
others then null`: **регистрация не должна падать из-за профиля**. Если строка не
создалась, её дозаполнит онбординг (`/onboarding` пишет ник и вес).

### 4.2 `start_session(p_program_day_id uuid default null)` → `public.sessions`

1. Требует авторизацию.
2. Если день программы передан — проверяет, что он принадлежит вызывающему (иначе
   `insufficient_privilege`). `null` допустим: свободная тренировка без программы.
3. Помечает висящую активную сессию как `abandoned` (`finished_at = coalesce(...)`).
4. Вставляет новую активную и возвращает её строку целиком: клиент сразу кладёт
   её в кэш активной сессии и уходит на экран тренировки без второго запроса.

`security invoker`: функция ничего не делает сверх того, что пользователь может сделать
сам, — она лишь укладывает три шага в одну транзакцию, чтобы между «бросили старую» и
«создали новую» не оказалось окна.

### 4.3 `finish_session(p_session_id uuid, p_state session_state default 'finished', p_note text default null)` → `public.sessions`

1. Требует авторизацию и владение сессией. `p_state` допускает только `finished`
   и `abandoned`: «бросить тренировку» — та же функция с другим состоянием.
2. Уже закрытую сессию (любую не-`active`) возвращает как есть: закрытие идёт через
   офлайн-очередь и может повториться, повтор не должен ни воскрешать брошенную,
   ни отменять завершённую.
3. Только при `p_state = 'finished'` обновляет память автозаполнения:
   `distinct on (program_item_id) ... order by logged_at desc, order_index desc` —
   последний подход каждого элемента дня. Для `strength` пишет вес/повторы, для
   `cardio` — время/дистанцию. Брошенная тренировка память не трогает.
4. Пересчитывает `total_volume_kg = sum(weight_kg * reps) filter (where kind='strength')`
   и `total_cardio_sec = sum(duration_sec) filter (where kind='cardio')`.
5. Ставит `state = p_state`, `finished_at = coalesce(finished_at, now())`,
   `note = coalesce(p_note, note)`.

Возвращает готовую строку сессии — экрану сводки не нужен второй запрос.

---

## 5. Что отложено

| Фаза | Что появится в БД |
|---|---|
| 2 | Триггер `BEFORE INSERT` на `sets`: e1RM по Эпли, `e1rm_ref` за 90 дней, `RI`, `score` с отсечкой `RI < 0.35` и `k_effort` по RIR. Строки `kind = 'cardio'` он обязан пропускать. Плюс вьюхи статов (оконный запрос за 28 дней) и уровней. |
| 3 | RPC обмена инвайт-токена на членство (`security definer`), политики чтения чужих профилей и статов внутри круга, вьюха лидерборда. |
| 4 | `readiness_daily`, `token_ledger`, `quests`; `pg_cron` на ночной пересчёт готовности и генерацию недельных квестов. |
| 5 | `bosses`, `raids`, `raid_participants`, `raid_loot`, `stat_anchors`; FK `sessions.raid_id` → `raids.id` (колонка уже есть, FK намеренно не создан). |
| 6 | Realtime-публикация на `raid_participants` для кооп-рейдов. |

Отдельно: `stat_snapshots` из раздела 11 спеки в фазе 1 не заводили. Пока статы —
оконный запрос по `sets`, снапшоты нужны только когда история перестанет считаться
на лету; заводить пустую таблицу заранее смысла нет.

---

## 6. Известные компромиссы

- **`sessions.raid_id` без FK.** Колонка есть, таблицы `raids` нет до фазы 5.
  Ссылочная целостность здесь появится позже; сейчас колонка всегда `null`.
- **`program_items` не запрещает силовые цели у кардио-упражнения.** См. 2.5.
- **`circle_invites` в фазе 1 не редимятся.** Токен видит только владелец круга;
  обмен токена на членство — RPC фазы 3. Сейчас участников добавляет владелец.
- **`sets` можно обновлять и удалять.** Дневник должен позволять исправить опечатку
  сразу после подхода. Когда в фазе 2 появится `score`, править историю станет опаснее —
  тогда же имеет смысл ограничить `update`/`delete` окном (например, текущей активной
  сессией) политикой с проверкой `sessions.state = 'active'`.
- **`game_config` пишет только `service_role`.** Тюнинг — через дашборд или миграцию,
  не через приложение. Так константы не разъедутся между клиентами.
