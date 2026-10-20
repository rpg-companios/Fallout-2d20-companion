// src/store/saveSchema.js
//
// ЕДИНСТВЕННЫЙ источник истины для версии формата сохранения персонажа.
//
// Правило (владелец):
//   - Никогда не менять формат сохранения «на лету» в loadCharacter/serializers.
//   - Формат меняется только версионированной миграцией движка или
//     активного пакета, зарегистрированной в state migration chain.
//   - Эта константа импортируется ВСЕМИ местами, которые пишут/читают schemaVersion,
//     чтобы версия не разъезжалась по трём файлам (как было с хардкодом schemaVersion: 1).
//
// Значение: 0 = начальный (неверсированный) формат.
// v1 — разделение эффектов (effect_) и качеств (quality_) в экипировке;
//       Legacy catalog ID mapping registered by the setting package.
// v2 — optional setting-owned skill reward journal.
// v3 — setting-owned item-quality normalization.
// v4 — damageType из строки в массив (поддержка комбинированного урона).
// v5 — комплект снаряжения без метаданных → заглушка {id: null, name: null}.
// v6 — setting-owned origin ID normalization.
// v7 — setting-owned catalog ID/name normalization.
// v8 — setting-owned equipment quality normalization.
// v9 — числовые статы предметов; setting-owned equipment migration
//       the setting migration capability.
// v10–v14 — legacy character corrections and deferred starting-equipment
//       grant, registered through the setting migration capability.
// v15 — состояние универсальных проверок риска в текущей реальной сцене.
// v16 — одноразовый модификатор сложности для следующей новой категории риска.
// v17 — снять лишние ранги перков сверх catalog maxRanks; сейв перка — {id, rank}.
// v18 — setting-owned catalog ID remapping.
// v19 — «худой» сейв: предметы хранят только состояние экземпляра, имя/цену/
//       вес/статы/моды достаёт resolveItem по id (domain/saveSlimming.js).
// v20 — зарезервированный переход для компактного представления вложенных
//       setting-owned item containers. Экспорт и восстановление выполняет
//       optional characterSave codec активного пакета; engine migration остаётся
//       чистым no-op и не трактует внутреннюю структуру этих контейнеров. Миграция — только бамп версии, идемпотентна.
// v19 — предметы в сейве хранят состояние экземпляра; имя/цену/вес/статы
//       достаёт каталог активного пакета. Generic projection выполняет
//       domain/saveSlimming.js, setting-specific поля и контейнеры объявляет
//       capability. Старые «жирные» сейвы остаются совместимыми: миграция
//       v18→v19 — только бамп, проекция выполняется при записи.
// v21–v22 — setting-owned equipment save migrations, registered by
//       the setting migration capability.
// v23 — выживание: поле survival (шкалы еды/воды/сна, очки Усталости с
//       источниками, аккумуляторы времени). Поле и миграция принадлежат
//       модулю сеттинга: переход
//       регистрируется через реестр расширений состояния
//       (stateExtensions.js), номер схемы остаётся движковым.
//       Типам персонажей сеттинга — начальные максимумы и
//       киборгам — null (шкал нет).
// v24 — знание каталога в сейве (патч 212): опциональное поле
//       folder { id, name } | null (отсутствие/null = корневой список).
//       Миграция идентична: поле пишется и сверяется слоем БД
//       (db/Database.js, domain/characterFolders.js), преобразований нет.
//       Старые сейвы без поля остаются в корневом списке.
// v25 — setting-owned condition-rank migration.
// v26 — setting-owned removed catalog IDs, migrated by
//       the setting migration capability.
export const CURRENT_SCHEMA_VERSION = 26;

// Версия, которая ставится при отсутствии schemaVersion в сохранении
// (старые сохранения без поля — считаем v0, текущим форматом).
export const LEGACY_SCHEMA_VERSION = 0;
