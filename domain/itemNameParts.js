// domain/itemNameParts.js
// Патч 562 — «длинные названия должны читаться целиком».
//
// Слово владельца: «Длинные названия должны читаться целиком. Обрати внимание на
// базовые имена из 2х слов, по типу боевой карабин, двуствольный дробовик и т.п».
//
// Откуда длина: `enrichItem` склеивает имя оружия в одну строку по правилу
// владельца — «[префиксы модов] [качества] [базовое имя]». У полностью
// обвешанного оружия это до 129 символов, и в списке строка превращается в кашу.
//
// Решение — не резать и не додумывать, а РАЗОБРАТЬ то же имя, что видит игрок:
//   mods  — имена модов, которые стоят В НАЧАЛЕ имени (их и выносим отдельной
//           строкой);
//   title  — всё, что осталось, БЕЗ обрезки: уникальные качества («Unreliable»,
//           «Two-Handed»), переименование прикладом («Laser Pistol» → «Laser
//           Rifle») и базовое имя целиком, в том числе из двух слов
//           («Combat Rifle», «Double-Barrel Shotgun»).
//
// Почему не «взять baseWeaponName»: это поле — имя ДО модов, оно теряет качества
// и врёт про приклад (у винтовки с прикладом показывает пистолет). Поэтому
// единственный надёжный источник — само имя предмета; мы снимаем с него ровно те
// слова, которые показываем во второй строке, и ничего больше.
//
// Инвариант (проверяется тестом): title + mods = исходное имя, слово в слово.

/** Порядок слотов оружия — стабильный, чтобы строки не «прыгали». */
export const WEAPON_MOD_SLOT_ORDER = Object.freeze([
  'Receiver',
  'Barrel',
  'Muzzle',
  'Magazine',
  'Sight',
  'Grip',
  'Stock',
]);

const slotRank = (slot) => {
  const index = WEAPON_MOD_SLOT_ORDER.indexOf(slot);
  return index === -1 ? WEAPON_MOD_SLOT_ORDER.length : index;
};

const text = (value) => String(value ?? '').trim();

/**
 * Индекс «id мода → как он записан в имени и как его читать» из каталога.
 * Имя в склейке — это `prefix || name` (правило 382 из enrichItem), а читаем мы
 * всегда полное `name`: префиксов в данных нет, но контракт сохраняем.
 *
 * @param {object} catalog — getEquipmentCatalog()
 * @returns {Object<string, {name: string, token: string}>}
 */
export const buildModsIndex = (catalog) => {
  const mods = Array.isArray(catalog?.weaponMods) ? catalog.weaponMods : [];
  const byId = {};
  for (const mod of mods) {
    if (!mod?.id) continue;
    const name = text(mod.name) || text(mod.prefix);
    const token = text(mod.prefix) || name;
    if (name) byId[mod.id] = { name, token };
  }
  return byId;
};

/**
 * Моды предмета: { key, name, token, rank }.
 *
 * Порядок — ТОТ ЖЕ, в котором `enrichItem` склеил имя (порядок ключей
 * appliedMods), иначе снятие префиксов поедет: «Long» съест начало
 * «Long Night Vision Scope». Порядок слотов (rank) нужен только для показа.
 *
 * Ключ — слот + id: два разных слота могут носить моды с одинаковым именем
 * (Barrel и Muzzle «Beam Focuser»), и это должны быть две записи.
 */
const collectMods = (item, modsById) => {
  const applied = item?.appliedMods && typeof item.appliedMods === 'object' ? item.appliedMods : {};
  return Object.keys(applied)
    .filter((slot) => applied[slot])
    .map((slot) => {
      const mod = modsById?.[applied[slot]];
      if (!mod) return null;
      const name = mod.name || mod.token;
      return {
        key: `${slot}:${applied[slot]}`,
        name,
        token: mod.token || name,
        rank: slotRank(slot),
      };
    })
    .filter(Boolean);
};

/** Одинаковые имена разных слотов («Beam Focuser») читаем один раз. */
const uniqueNames = (mods) => {
  const seen = new Set();
  const out = [];
  for (const mod of mods) {
    if (seen.has(mod.name)) continue;
    seen.add(mod.name);
    out.push(mod.name);
  }
  return out;
};

/**
 * Разбирает имя предмета на читаемые части.
 *
 * Предмет без модов (книга, броня, расходник) — имя целиком: строка просто
 * переносится, ничего не отбрасывается.
 *
 * @param {object} item — предмет или снимок предмета (name — как его видит игрок)
 * @param {object} modsById — см. buildModsIndex
 * @returns {{ title: string, mods: string[] }}
 */
export const getItemNameParts = (item, modsById = {}) => {
  const full = text(item?.name) || text(item?.displayName);
  if (!full) return { title: '', mods: [] };

  const candidates = collectMods(item, modsById);
  if (candidates.length === 0) return { title: full, mods: [] };

  // Снимаем префиксы модов с НАЧАЛА имени, в порядке склейки. Мод, которого в
  // начале нет (приклад с переименованием, качество), просто пропускаем — его
  // слова остаются в заголовке вместе с базовым именем.
  const taken = new Set();
  let rest = full;
  for (const mod of candidates) {
    if (rest === mod.token) {
      taken.add(mod.key);
      rest = '';
      continue;
    }
    if (rest.startsWith(`${mod.token} `)) {
      taken.add(mod.key);
      rest = rest.slice(mod.token.length + 1).trim();
    }
  }

  const mods = candidates
    .filter((mod) => taken.has(mod.key))
    .sort((a, b) => a.rank - b.rank);
  if (mods.length === 0) return { title: full, mods: [] };

  // Остаток — качества и базовое имя. Пусто быть не может, но если имя состояло
  // из одних модов, лучше показать исходное имя, чем пустую строку.
  const title = rest || full;
  return { title, mods: uniqueNames(mods) };
};

/** Совмещённая строка для буферов и подсказок: «Имя · мод · мод». */
export const formatItemNameLine = ({ title = '', mods = [] } = {}) => (
  [title, ...(Array.isArray(mods) ? mods : [])].filter(Boolean).join(' · ')
);

export default getItemNameParts;
