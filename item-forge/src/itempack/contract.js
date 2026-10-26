// GENERATED from rpg-companios/Fallout-2d20-companion by tools/sync-from-main.mjs.
// НЕ редактировать: правка — в источнике (src/itempack/ там), потом npm run sync.
// src/itempack/contract.js
// Контракт «пак контента» v1 (прототип P): оружие / моды оружия / патроны.
// Общий код генератора (item-forge) и приложения (правило одного поведения:
// файл, который собрал генератор, проходит этот же валидатор при загрузке).
//
// Ключевые решения владельца (2026-10-19):
// - один JSON-файл поверх активного сеттинга (не полный .trpg);
// - id предметов — строго с префиксом `hb_<packId>_` (коллизии исключены);
// - локалей достаточно одной (manifest.locale); перевода текущего языка нет —
//   в интерфейсе показывается id;
// - удаление пака — полное, без следов (каскад по сейвам делает приложение);
// - ключи-резервы (влияния/происхождения/черты/перки) валидатор отклоняет
//   ошибкой «зарезервировано», будущие версии не пройдут молча.

export const ITEM_PACK_FORMAT = 1;

export const PACK_LOCALES = ['ru-RU', 'en-EN'];

/** Аудитория предмета. 'human' покрывает human/ghoul/cyborg (человеческое тело). */
export const AUDIENCES = ['human', 'mutant', 'robot'];

export const AUDIENCE_CHARACTER_TYPES = {
  human: ['human', 'ghoul', 'cyborg'],
  mutant: ['mutant'],
  robot: ['robot'],
};

/** Ключи верхнего уровня, зарезервированные под будущие версии формата. */
export const RESERVED_KEYS = ['influences', 'origins', 'traits', 'perks'];

/** Разрешённые коллекции в items (прототип P). */
export const ITEM_COLLECTIONS = ['weapons', 'weaponMods', 'ammo'];

/** Операции полей-модификаторов модов — ровно как в данных сеттинга
 *  (weapon_mods.json: '+', '-', 'set'). × и ÷ появятся вместе с будущим
 *  интерпретатором влияний — в прототипе их нет, чтобы механика модов
 *  работала без правок. */
export const MOD_OPS = ['+', '-', 'set'];

export const QUALITY_CHANGE_OPS = ['gain', 'lose'];

export const MOD_RARITIES = ['Common', 'Uncommon', 'Rare'];

export const PACK_ID_PATTERN = /^[a-z][a-z0-9_]*$/;

export const itemIdPrefix = (packId) => `hb_${packId}_`;

export const isPackItemId = (id, packId) =>
  typeof id === 'string' && id.startsWith(itemIdPrefix(packId));

/** Проверка аудитории: строка 'all' или массив из AUDIENCES. */
export const normalizeAudience = (value) => {
  if (value === undefined || value === null) return 'all';
  if (value === 'all') return 'all';
  const list = Array.isArray(value) ? value : [value];
  const clean = list.filter((a) => AUDIENCES.includes(a));
  return clean.length === 0 ? 'all' : (clean.length === list.length ? clean : 'invalid');
};
