// domain/itemIdentity.js
// Идентичность предмета в инвентаре: id и стек-ключ.
//
// Стек-ключ — простая склейка частей: id + прочие параметры + имя.
//   - обычный нож:                        weapon_switchblade
//   - нож с модом:                        weapon_switchblade_mods_mod_113
//   - нож с прочностью 50:                weapon_switchblade_dur_50
//   - одежда с уникальным качеством:      clothing_fancy_clothes_uniq_dashing
//   - бритва (вариант ножа):              weapon_switchblade_опасная_бритва
//   - бритва, мод, прочность, качество:   weapon_switchblade_dur_50_mods_mod_113_uniq_dashing_опасная_бритва
//
// ЗАКОН стека: два 100% идентичных предмета (id + прочность + моды +
// уникальные качества + имя) — один стек; любой отличающийся параметр
// разделяет: меч 50 и меч 100 прочности — разные стеки, «элегантная» и
// «дерзкая» форменная одежда (один id, разные uniq-качества) — разные стеки.
//
// Вариант предмета (trueItemId) живёт под истинным id; разделение стека делает
// имя (baseName): бритва и нож с одинаковыми параметрами — разные стеки
// (имена не совпали), две бритвы — один стек.

const generateId = () => `id_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

/** slug для имени в ключе: читаемый, без пробелов/спецсимволов. */
export const slugifyBaseName = (baseName = '') => String(baseName)
  .toLowerCase()
  .replace(/[^a-zа-яё0-9]+/gi, '_')
  .replace(/^_+|_+$/g, '')
  .slice(0, 40);

/**
 * Собирает стек-ключ/инстанс-id из частей: id + прочность + моды +
 * уникальные качества + имя.
 * - durability — прочность (только для предметов с отслеживаемой прочностью);
 * - mods — отсортированные id установленных модов;
 * - uniqQualities — id уникальных качеств (сортировка — ключ не зависит
 *   от порядка крепления; id, а не имена — ключ не зависит от локали);
 * - baseName — перезаписанное имя варианта (иначе имя истинного предмета).
 * Предметы со своим ключом (силовая броня, Ядерный Блок — signature по
 * прочности/зарядам/модам, см. domain/powerArmor) приносят ключ с собой.
 */
const buildKey = (weaponId, appliedMods = {}, baseName = '', durability, uniqQualities = []) => {
  if (!weaponId) return generateId();
  const modIds = Object.entries(appliedMods || {})
    .sort(([k1], [k2]) => k1.localeCompare(k2))
    .map(([slot, modId]) => modId)
    .join('_');
  const parts = [weaponId];
  if (durability !== undefined && durability !== null && durability !== '') {
    parts.push(`dur_${durability}`);
  }
  if (modIds) parts.push(`mods_${modIds}`);
  const uniqIds = [...(uniqQualities || [])].filter(Boolean).sort();
  uniqIds.forEach((id) => parts.push(`uniq_${id}`));
  if (baseName) parts.push(slugifyBaseName(baseName));
  return parts.join('_');
};

/**
 * Уникальный id инстанса предмета (см. buildKey).
 */
export const generateItemId = (weaponId, appliedMods = {}, baseName = '', durability, uniqQualities) =>
  buildKey(weaponId, appliedMods, baseName, durability, uniqQualities);

/**
 * Стек-ключ для склеивания одинаковых предметов (см. buildKey).
 */
export const generateStackKey = (weaponId, appliedMods = {}, baseName = '', durability, uniqQualities) =>
  buildKey(weaponId, appliedMods, baseName, durability, uniqQualities);
