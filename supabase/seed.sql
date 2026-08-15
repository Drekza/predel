-- Точка входа сидов. Реального SQL здесь нет, только подключение файлов.
--
-- Порядок важен: сначала карта «мышца → стат» и game_config, потом справочник
-- упражнений (он опирается на ту же номенклатуру мышц).
--
-- Мета-команды \ir понимает psql. Так это работает:
--     psql "$DATABASE_URL" -f supabase/seed.sql
--
-- Supabase CLI (`supabase db reset`) исполняет файлы сам, без psql, и мета-команды
-- не понимает — поэтому в config.toml в db.seed.sql_paths перечислены те же два
-- файла напрямую. Держи оба списка синхронными.
--
-- supabase/seed/0002_exercises.sql генерируется скриптом `npm run seed:build`
-- из scripts/data/*. В репозиторий он попадает уже сгенерированным.

\ir seed/0001_muscle_stat_map.sql
\ir seed/0002_exercises.sql
