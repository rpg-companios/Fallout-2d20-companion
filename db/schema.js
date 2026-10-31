// db/schema.js
//
// SQLite хранит ТОЛЬКО сохранёнки персонажей. Справочники (оружие, моды, перки и т.д.)
// живут в JSON (data/**/*.json через i18n/equipmentCatalog, см. db/catalogSource.js).
//
// schema_meta оставлена для версионирования/миграций на будущее.

export const SCHEMA_VERSION = 11;

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

  `CREATE TABLE IF NOT EXISTS character_folders (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
  )`,

  `CREATE TABLE IF NOT EXISTS character_folder_memberships (
    character_id TEXT PRIMARY KEY,
    folder_id TEXT NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS character_rename_requests (
    character_id TEXT PRIMARY KEY
  )`,

  // Аватары персонажей (патч 193, задел премиум-фичы без UI): локальная копия
  // фото, облачная лежит рядом с сейвом в appDataFolder/<сеттинг>/avatars/.
  // В сейве персонажа — только метаданные (md5/updatedAt), не само фото.
  // CREATE TABLE IF NOT EXISTS идемпотентен: бамп SCHEMA_VERSION не нужен.
  `CREATE TABLE IF NOT EXISTS character_avatars (
    character_id TEXT PRIMARY KEY,
    data_url TEXT NOT NULL,
    md5 TEXT,
    updated_at INTEGER NOT NULL
  )`,

  // Комнаты мастера (gm-rooms, этапы 0–2): комната = папка со штампом
  // (код + токен владельца; токен доказывает владение при восстановлении
  // комнаты после перезапуска сервера — см. docs/architecture/gm-rooms-plan.md §3.3).
  // CREATE TABLE IF NOT EXISTS идемпотентен: бамп SCHEMA_VERSION не нужен.
  `CREATE TABLE IF NOT EXISTS folder_rooms (
    folder_id TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    owner_token TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,

  // Связка «персонаж ↔ комната» на ЭТОМ устройстве (этап 2). Штамп в сейв
  // и поездка через облако — этап 3 (паспорта полей сейва).
  `CREATE TABLE IF NOT EXISTS character_room_bindings (
    character_id TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    joined_at INTEGER NOT NULL
  )`,

  // Контейнеры добычи и торговцы Мастера (патч 468, «Добыча/Торговля»).
  // CREATE TABLE IF NOT EXISTS идемпотентен: бамп SCHEMA_VERSION не нужен.
  `CREATE TABLE IF NOT EXISTS gm_containers (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    room_code TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,

  // Сохранённые состояния (плитки) и папки экрана «Окружающая среда/бой» (патч 482).
  `CREATE TABLE IF NOT EXISTS gm_env_entries (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    category TEXT NOT NULL,
    name TEXT NOT NULL,
    folder_id TEXT,
    data TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
];
