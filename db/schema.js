// db/schema.js
//
// SQLite хранит ТОЛЬКО сохранёнки персонажей. Справочники (оружие, моды, перки и т.д.)
// живут в JSON (data/**/*.json через i18n/equipmentCatalog, см. db/catalogSource.js).
//
// schema_meta оставлена для версионирования/миграций на будущее.

export const SCHEMA_VERSION = 9;

export const CREATE_TABLES = [
  `CREATE TABLE IF NOT EXISTS schema_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS characters (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    level INTEGER NOT NULL DEFAULT 1,
    origin_name TEXT,
    data TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
];
