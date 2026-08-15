-- Сид 0001 | Карта «мышца → стат» (17 строк) и тюнинг-константы игрового слоя.
-- Запускается после всех миграций. Безопасен для повторного запуска.
--
-- Ключи мышц — ровно те строки, что лежат в primaryMuscles/secondaryMuscles
-- free-exercise-db. Ручного авторинга статов нет, только эта карта (спека 3.1).

insert into public.muscle_stat_map (muscle, stat_key) values
  ('chest',       'chest'),
  ('lats',        'back'),
  ('middle back', 'back'),
  ('traps',       'back'),
  ('shoulders',   'shoulders'),
  ('neck',        'shoulders'),
  ('biceps',      'arms'),
  ('triceps',     'arms'),
  ('forearms',    'arms'),
  ('quadriceps',  'quads'),
  ('calves',      'quads'),
  ('abductors',   'quads'),
  ('adductors',   'quads'),
  ('hamstrings',  'posterior'),
  ('glutes',      'posterior'),
  ('lower back',  'posterior'),
  ('abdominals',  'core')
on conflict (muscle) do update set stat_key = excluded.stat_key;

-- ---------------------------------------------------------------------------
-- game_config — все «константы под тюнинг» из раздела 13 спеки.
-- on conflict do nothing: сид не затирает значения, покрученные на живых
-- данных. Чтобы принудительно вернуть дефолт — удали строку и перезапусти сид.
-- ---------------------------------------------------------------------------
insert into public.game_config (key, value, description) values
  ('ri_exponent',
   '2'::jsonb,
   'Показатель степени RI в формуле score = reps × RI^n × k_effort × score_multiplier.'),

  ('ri_cutoff',
   '0.35'::jsonb,
   'Отсечка относительной интенсивности: при RI ниже этого значения подход даёт 0 очков. Так разминка отсекается сама, без флага «это разминка» в UI.'),

  ('score_multiplier',
   '100'::jsonb,
   'Общий множитель очков подхода. Чисто косметический масштаб чисел.'),

  ('k_effort',
   '{"0": 0.95, "1": 1.0, "2": 1.0, "3": 0.75, "4": 0.55, "5": 0.3}'::jsonb,
   'Множитель усилия по RIR. Пик стоит на RIR 1–2, а не на отказе: награда должна лежать там, где физиологический оптимум. RIR больше 5 берёт значение ключа «5».'),

  ('e1rm_ref_window_days',
   '90'::jsonb,
   'Окно поиска максимума e1RM по паре (профиль, упражнение) для расчёта RI, дней.'),

  ('stat_window_days',
   '28'::jsonb,
   'Скользящее окно суммирования очков в статы, дней. Decay получается из окна бесплатно.'),

  ('stat_level_divisor',
   '40'::jsonb,
   'Делитель кривой уровня отдельного стата: stat_level = floor(sqrt(stat_value / 40)).'),

  ('global_level_divisor',
   '120'::jsonb,
   'Делитель кривой глобального уровня: global_level = floor(sqrt(сумма статов / 120)).'),

  ('muscle_split',
   '{"primary": 0.7, "secondary": 0.3}'::jsonb,
   'Как очки подхода делятся между мышцами: 0.7 поровну на primary, 0.3 поровну на secondary.'),

  ('readiness_weights',
   '{"rir_drop": 25, "e1rm_trend_drop": 25, "volume_overshoot": 20, "rest_bonus": 15}'::jsonb,
   'Веса компонентов формулы готовности: падение среднего RIR за 7 дней, падение тренда e1RM на базовых, превышение недельного объёма над 28-дневной нормой, бонус за дни отдыха (максимум при 2–3 днях).'),

  ('readiness_thresholds',
   '{"high_tier_min": 70, "normal_min": 40, "deload_below": 40, "sleeper_boss_range": [40, 55]}'::jsonb,
   'Пороги готовности: выше 70 — боссы высокого тира, 40–70 — обычные, ниже 40 — рейды закрыты и предлагается разгрузка. В диапазоне 40–55 появляется разгрузочный босс «Спящий».'),

  ('raid_tier_multipliers',
   '{"1": 1.1, "2": 1.25, "3": 1.4}'::jsonb,
   'Множители HP босса по тирам: HP = средний score сессии за 28 дней × множитель.'),

  ('class_thresholds',
   '{"dominant_share": 0.35, "lagging_share": 0.05}'::jsonb,
   'Пороги класса ПЕРЕКОС: один стат больше 35% суммы либо любой стат ниже 5%.'),

  ('cardio_gives_score',
   'false'::jsonb,
   'Кардио никогда не даёт очков и не влияет на статы, уровни, класс, тоннаж и готовность. Ключ существует как явная фиксация правила: триггер расчёта score в фазе 2 обязан пропускать строки sets с kind = cardio.')
on conflict (key) do nothing;
