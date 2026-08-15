#!/usr/bin/env node
/**
 * Генератор сида справочника упражнений.
 *
 *   node scripts/build-exercise-seed.mjs          (== npm run seed:build)
 *
 * Вход  (руками не редактируется скриптом, только читается):
 *   scripts/data/exercises.json        дамп free-exercise-db, 873 объекта
 *   scripts/data/exercises.extra.json  дописанные вручную кардио-упражнения
 *   scripts/data/ru/chunk-*.json       карты id -> русское название
 *
 * Выход:
 *   scripts/data/exercises.ru.json     склеенный словарь переводов (отсортирован)
 *   supabase/seed/0002_exercises.sql   идемпотентный сид, коммитится в репозиторий
 *
 * Скрипт намеренно падает на любом расхождении данных: сид попадает в базу,
 * молча пропустить кривую строку хуже, чем остановить сборку.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(SCRIPTS_DIR);
const DATA_DIR = join(SCRIPTS_DIR, 'data');
const RU_DIR = join(DATA_DIR, 'ru');

const SRC_MAIN = join(DATA_DIR, 'exercises.json');
const SRC_EXTRA = join(DATA_DIR, 'exercises.extra.json');
const OUT_RU = join(DATA_DIR, 'exercises.ru.json');
const OUT_SQL = join(ROOT, 'supabase', 'seed', '0002_exercises.sql');

const RU_CHUNK_COUNT = 10;
const BATCH_SIZE = 100;

/** Категории free-exercise-db, которые попадают в приложение. */
const KEPT_CATEGORIES = new Set([
  'strength',
  'powerlifting',
  'olympic weightlifting',
  'strongman',
  'cardio',
]);

/** Ожидаемая раскладка. Не сошлось — значит вход подменили, сборку останавливаем. */
const EXPECTED_STRENGTH = 675;
const EXPECTED_CARDIO = 17;

/** Ровно 17 мышц из free-exercise-db = ключи public.muscle_stat_map. */
const KNOWN_MUSCLES = new Set([
  'chest',
  'lats',
  'middle back',
  'traps',
  'shoulders',
  'neck',
  'biceps',
  'triceps',
  'forearms',
  'quadriceps',
  'calves',
  'abductors',
  'adductors',
  'hamstrings',
  'glutes',
  'lower back',
  'abdominals',
]);

/** Низ тела: compound-движение на эти мышцы шагает по 2.5 кг (спека 4.1). */
const LOWER_BODY_MUSCLES = new Set([
  'quadriceps',
  'hamstrings',
  'glutes',
  'lower back',
  'calves',
  'abductors',
  'adductors',
]);

/** Тренажёры со стеком: шаг задан плитой. */
const STACK_EQUIPMENT = new Set(['machine', 'cable']);

const STEP_STACK = 2.0;
const STEP_LOWER_COMPOUND = 2.5;
const STEP_DEFAULT = 1.25; // верх и изоляция; у кардио не используется вовсе

// ---------------------------------------------------------------------------
// утилиты
// ---------------------------------------------------------------------------

class BuildError extends Error {}

function fail(message) {
  throw new BuildError(message);
}

function readJson(file) {
  if (!existsSync(file)) fail(`нет входного файла: ${rel(file)}`);
  const raw = readFileSync(file, 'utf8').replace(/^﻿/, ''); // BOM у части чанков
  try {
    return JSON.parse(raw);
  } catch (e) {
    fail(`битый JSON в ${rel(file)}: ${e.message}`);
  }
}

function rel(file) {
  return relative(ROOT, file).replace(/\\/g, '/');
}

/** id датасета -> slug: нижний регистр, всё не [a-z0-9] схлопывается в один дефис. */
function toSlug(id) {
  return String(id)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Одинарная кавычка удваивается. standard_conforming_strings=on, бэкслеш литерален. */
function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlNullable(value) {
  if (value === null || value === undefined || value === '') return 'null';
  return sqlString(value);
}

function sqlTextArray(values) {
  if (!values || values.length === 0) return `'{}'::text[]`;
  return `array[${values.map(sqlString).join(',')}]::text[]`;
}

// ---------------------------------------------------------------------------
// 1. чтение и фильтрация датасета
// ---------------------------------------------------------------------------

function loadExercises() {
  const main = readJson(SRC_MAIN);
  const extra = readJson(SRC_EXTRA);
  if (!Array.isArray(main) || !Array.isArray(extra)) {
    fail('exercises.json и exercises.extra.json должны быть массивами');
  }

  const all = [...main, ...extra];
  const kept = all.filter((e) => KEPT_CATEGORIES.has(e.category));

  const strength = kept.filter((e) => e.category !== 'cardio');
  const cardio = kept.filter((e) => e.category === 'cardio');

  if (strength.length !== EXPECTED_STRENGTH || cardio.length !== EXPECTED_CARDIO) {
    fail(
      `после фильтрации ожидалось ${EXPECTED_STRENGTH} силовых + ${EXPECTED_CARDIO} кардио ` +
        `= ${EXPECTED_STRENGTH + EXPECTED_CARDIO}, получено ${strength.length} + ${cardio.length} ` +
        `= ${kept.length}. Вход в scripts/data/ подменили или испортили — проверь ` +
        `${rel(SRC_MAIN)} и ${rel(SRC_EXTRA)}.`,
    );
  }

  return { all, kept, strengthCount: strength.length, cardioCount: cardio.length };
}

// ---------------------------------------------------------------------------
// 2. словарь переводов
// ---------------------------------------------------------------------------

function loadRuDictionary() {
  const dict = {};
  const missingChunks = [];
  let loadedChunks = 0;

  for (let i = 1; i <= RU_CHUNK_COUNT; i++) {
    const name = `chunk-${String(i).padStart(2, '0')}.json`;
    const file = join(RU_DIR, name);
    if (!existsSync(file)) {
      missingChunks.push(name);
      continue;
    }
    const chunk = readJson(file);
    if (chunk === null || typeof chunk !== 'object' || Array.isArray(chunk)) {
      fail(`${rel(file)}: ожидался объект id -> русское название`);
    }
    for (const [id, ru] of Object.entries(chunk)) {
      if (typeof ru !== 'string' || ru.trim() === '') {
        fail(`${rel(file)}: пустой перевод у id "${id}"`);
      }
      dict[id] = ru.trim();
    }
    loadedChunks++;
  }

  // Пересобираем отсортированным по ключу — иначе diff словаря скачет между запусками.
  const sorted = {};
  for (const key of Object.keys(dict).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) {
    sorted[key] = dict[key];
  }

  return { dict: sorted, missingChunks, loadedChunks };
}

// ---------------------------------------------------------------------------
// 3. правила
// ---------------------------------------------------------------------------

function weightStepFor(exercise, kind) {
  if (kind === 'cardio') return STEP_DEFAULT; // значение мёртвое, кардио не прогрессирует
  if (STACK_EQUIPMENT.has(exercise.equipment)) return STEP_STACK;
  const isLowerCompound =
    exercise.mechanic === 'compound' &&
    (exercise.primaryMuscles ?? []).some((m) => LOWER_BODY_MUSCLES.has(m));
  return isLowerCompound ? STEP_LOWER_COMPOUND : STEP_DEFAULT;
}

/** Мини-валидатор: любая незнакомая мышца ломает карту «мышца → стат» на 17 строк. */
function validateMuscles(exercise) {
  for (const field of ['primaryMuscles', 'secondaryMuscles']) {
    const list = exercise[field] ?? [];
    if (!Array.isArray(list)) {
      fail(`${exercise.id}: ${field} должен быть массивом`);
    }
    for (const muscle of list) {
      if (!KNOWN_MUSCLES.has(muscle)) {
        fail(
          `${exercise.id}: неизвестная мышца "${muscle}" в ${field}. ` +
            `Допустимы только 17 значений из public.muscle_stat_map.`,
        );
      }
    }
  }
}

function buildRows(kept, ru) {
  const rows = [];
  const bySlug = new Map();
  const untranslated = [];

  for (const e of kept) {
    if (!e.id) fail('в датасете есть упражнение без id');
    if (!e.name) fail(`${e.id}: пустое поле name`);

    validateMuscles(e);

    const slug = toSlug(e.id);
    if (slug === '') fail(`${e.id}: slug выродился в пустую строку`);
    if (bySlug.has(slug)) {
      fail(
        `коллизия slug "${slug}": id "${bySlug.get(slug)}" и "${e.id}" сводятся к одному ` +
          `значению. Глобальные слаги уникальны (exercises_slug_global_uniq), сид бы затёр строку.`,
      );
    }
    bySlug.set(slug, e.id);

    const kind = e.category === 'cardio' ? 'cardio' : 'strength';
    const nameRu = ru[e.id];
    if (!nameRu) untranslated.push(e.id);

    rows.push({
      slug,
      nameRu: nameRu ?? e.name, // фолбэк на английское имя, чтобы сид не падал
      nameEn: e.name,
      kind,
      equipment: e.equipment ?? null,
      category: e.category,
      mechanic: e.mechanic ?? null,
      force: e.force ?? null,
      level: e.level ?? null,
      primaryMuscles: e.primaryMuscles ?? [],
      secondaryMuscles: e.secondaryMuscles ?? [],
      weightStepKg: weightStepFor(e, kind),
    });
  }

  // Стабильный порядок строк в SQL: иначе перегенерация даёт шумный diff.
  rows.sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));

  return { rows, untranslated };
}

// ---------------------------------------------------------------------------
// 4. генерация SQL
// ---------------------------------------------------------------------------

const COLUMNS = [
  'slug',
  'name_ru',
  'name_en',
  'kind',
  'equipment',
  'category',
  'mechanic',
  'force',
  'level',
  'primary_muscles',
  'secondary_muscles',
  'weight_step_kg',
];

const UPDATED_COLUMNS = COLUMNS.filter((c) => c !== 'slug');

function rowValues(row) {
  return (
    '  (' +
    [
      sqlString(row.slug),
      sqlString(row.nameRu),
      sqlNullable(row.nameEn),
      `${sqlString(row.kind)}::public.exercise_kind`,
      sqlNullable(row.equipment),
      sqlNullable(row.category),
      sqlNullable(row.mechanic),
      sqlNullable(row.force),
      sqlNullable(row.level),
      sqlTextArray(row.primaryMuscles),
      sqlTextArray(row.secondaryMuscles),
      row.weightStepKg.toFixed(2),
    ].join(', ') +
    ')'
  );
}

function buildSql(rows, stats) {
  const out = [];
  const total = rows.length;

  out.push(`-- Сид 0002 | Справочник упражнений. Всего строк: ${total} (силовых ${stats.strengthCount}, кардио ${stats.cardioCount}).`);
  out.push('--');
  out.push('-- ФАЙЛ СГЕНЕРИРОВАН. РУКАМИ НЕ ПРАВИТЬ — правки затрёт следующая сборка.');
  out.push('-- Генератор:  scripts/build-exercise-seed.mjs   (npm run seed:build)');
  out.push('-- Источник:   free-exercise-db (лицензия Unlicense) — scripts/data/exercises.json');
  out.push('--             + scripts/data/exercises.extra.json (3 кардио, дописаны вручную)');
  out.push('-- Переводы:   scripts/data/ru/chunk-*.json -> scripts/data/exercises.ru.json');
  out.push('--');
  out.push('-- Только глобальные упражнения: owner_id остаётся null, is_custom = false (дефолты).');
  out.push('-- Идемпотентен: on conflict целится в частичный индекс exercises_slug_global_uniq,');
  out.push('-- поэтому повторный запуск обновляет справочные поля и не трогает кастомные');
  out.push('-- упражнения пользователей (у них owner_id is not null). id строк не меняется,');
  out.push('-- внешние ключи из program_items и sets переживают перезалив.');
  out.push('--');
  out.push('-- kind = cardio у 17 строк. Мышцы у кардио сохранены — они нужны только для фильтров');
  out.push('-- в списке упражнений. В расчёт статов кардио не попадает никогда: триггер score');
  out.push('-- в фазе 2 пропускает строки sets с kind = cardio, у них score остаётся null.');
  out.push('--');
  out.push('-- Даты генерации в шапке намеренно нет: она давала бы diff при каждой пересборке.');
  out.push('');
  out.push('begin;');
  out.push('');

  for (let start = 0; start < total; start += BATCH_SIZE) {
    const batch = rows.slice(start, start + BATCH_SIZE);
    const from = start + 1;
    const to = start + batch.length;
    out.push(`-- строки ${from}–${to} из ${total}`);
    out.push(`insert into public.exercises (${COLUMNS.join(', ')}) values`);
    out.push(batch.map(rowValues).join(',\n'));
    out.push('on conflict (slug) where owner_id is null do update set');
    out.push(UPDATED_COLUMNS.map((c) => `  ${c} = excluded.${c}`).join(',\n') + ';');
    out.push('');
  }

  out.push('commit;');
  out.push('');

  return out.join('\n');
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

function main() {
  const { kept, strengthCount, cardioCount } = loadExercises();
  const { dict, missingChunks, loadedChunks } = loadRuDictionary();

  if (missingChunks.length > 0) {
    console.warn(
      `[warn] не найдены чанки переводов: ${missingChunks.join(', ')} ` +
        `(ожидались в ${rel(RU_DIR)}). Упражнения из них уедут в сид с английскими названиями.`,
    );
  }

  const { rows, untranslated } = buildRows(kept, dict);

  mkdirSync(dirname(OUT_RU), { recursive: true });
  writeFileSync(OUT_RU, JSON.stringify(dict, null, 2) + '\n', 'utf8');

  mkdirSync(dirname(OUT_SQL), { recursive: true });
  writeFileSync(OUT_SQL, buildSql(rows, { strengthCount, cardioCount }), 'utf8');

  // ---- сводка ----
  const steps = new Map();
  for (const r of rows) {
    const key = r.weightStepKg.toFixed(2);
    steps.set(key, (steps.get(key) ?? 0) + 1);
  }
  const translated = rows.length - untranslated.length;
  const batches = Math.ceil(rows.length / BATCH_SIZE);

  console.log('');
  console.log('Сид упражнений собран.');
  console.log(`  отфильтровано:   ${rows.length} (силовые ${strengthCount} / кардио ${cardioCount})`);
  console.log(`  чанков ru:       ${loadedChunks}/${RU_CHUNK_COUNT}, ключей в словаре ${Object.keys(dict).length}`);
  console.log(`  переведено:      ${translated}/${rows.length}, без перевода ${untranslated.length}`);
  console.log('  шаг веса:');
  for (const key of [...steps.keys()].sort((a, b) => Number(a) - Number(b))) {
    console.log(`    ${key} кг — ${steps.get(key)}`);
  }
  if (untranslated.length > 0) {
    console.log(`  топ-10 непереведённых: ${untranslated.slice(0, 10).join(', ')}`);
  }
  console.log(`  записано:        ${rel(OUT_RU)}`);
  console.log(`  записано:        ${rel(OUT_SQL)} (${batches} insert-батчей по ${BATCH_SIZE})`);
  console.log('');
}

try {
  main();
} catch (e) {
  if (e instanceof BuildError) {
    console.error(`\n[build-exercise-seed] ${e.message}\n`);
    process.exit(1);
  }
  throw e;
}
