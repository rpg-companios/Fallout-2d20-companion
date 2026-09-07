// modules/fallout/screens/WeaponsAndArmorScreen/dedupeWeaponCards.js
//
// Склейка одинаковых карточек оружия — забота ЭКРАНА, а не домена.
//
// Домен (domain/robotSlots.js) честно отдаёт каждую атаку: две руки с
// одинаковыми манипуляторами — это две атаки, и «стрельба по-македонски»
// (одно и то же оружие в обеих ладонях) — тоже две. На экране же вторая
// такая карточка ничего не добавляет, только занимает место и шумит, —
// поэтому здесь одинаковые карточки сводятся к одной (решение владельца:
// одну, без счётчика).
//
// Одинаковые — значит один и тот же предмет в одном и том же состоянии:
// совпадают id и установленные моды. Разные экземпляры разным оружием не
// считаются: снятие оружия из одной руки не должно гасить вторую (это
// обеспечивает домен, здесь мы только не показываем дубликат).

/**
 * Отпечаток карточки: что именно делает её «тем же самым оружием».
 * @param {object} weapon
 * @returns {string}
 */
export const weaponFingerprint = (weapon) => {
  if (!weapon) return 'null';
  const mods = weapon.appliedMods
    ? Object.entries(weapon.appliedMods).sort().map(([slot, id]) => `${slot}:${id}`).join(',')
    : (weapon.modIds || []).slice().sort().join(',');
  return `${weapon.id ?? weapon.weaponId ?? 'no-id'}|${mods}`;
};

/**
 * Оставить по одной карточке на каждый отпечаток, сохранив порядок.
 * @param {object[]} weapons
 * @returns {object[]}
 */
export const dedupeWeaponCards = (weapons = []) => {
  const list = Array.isArray(weapons) ? weapons : [];
  const seen = new Set();
  const result = [];
  for (const weapon of list) {
    if (!weapon) {
      result.push(weapon);
      continue;
    }
    const fp = weaponFingerprint(weapon);
    if (seen.has(fp)) continue;
    seen.add(fp);
    result.push(weapon);
  }
  return result;
};

export default dedupeWeaponCards;
