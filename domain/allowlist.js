// domain/allowlist.js
// Общая движковая функция поддержки белого списка по слагу/id/категории.
// Домен — движок, где общие правила. Частные случаи (что именно может носить робот) — вне домена.

/**
 * Проверяет входит ли предмет в allowlist.
 * Allowlist может быть:
 *  - массив строк: каждая строка — id, itemType или префикс (если заканчивается на '_' или содержит '*')
 *  - объект { itemTypes: [], ids: [], prefixes: [] }
 *  - объект-словарь { [slug]: true } где ключи — разрешённые id/категории
 *
 * @param {object} item - предмет с полями id, itemType, weaponId и т.д.
 * @param {object|array} allowlist - белый список
 * @returns {boolean}
 */
export function isItemInAllowlist(item, allowlist) {
  if (!item || !allowlist) return false;

  const id = String(item.id || item.weaponId || item.armorId || item.clothingId || '');
  const itemType = String(item.itemType || '');

  // Legacy override: если на самом предмете стоит robotOnly/mutantOnly/canRobotWear — считаем разрешённым
  // Это позволяет быстро пометить предмет в данных без правки allowlist
  if (item.robotOnly === true || item.robotArmorType || item.canRobotWear === true) return true;
  if (item.mutantOnly === true) return true;

  // Allowlist как массив
  if (Array.isArray(allowlist)) {
    for (const entry of allowlist) {
      const slug = String(entry);
      if (!slug) continue;
      if (id === slug) return true;
      if (itemType === slug) return true;
      // Префикс: если entry заканчивается на '_' или содержит '*' — проверяем startsWith
      if (slug.endsWith('_') || slug.includes('*')) {
        const prefix = slug.replace('*', '');
        if (id.startsWith(prefix)) return true;
      }
      // Поддержка категорий из примера владельца: robotArmor, robotPlating и т.д.
      // Мапим их на реальные типы/префиксы через простую таблицу (движковая, не частная)
      if (CATEGORY_ALIASES[slug]) {
        const mapped = CATEGORY_ALIASES[slug];
        if (mapped.itemTypes && mapped.itemTypes.includes(itemType)) return true;
        if (mapped.prefixes && mapped.prefixes.some(p => id.startsWith(p))) return true;
        if (mapped.ids && mapped.ids.includes(id)) return true;
      }
    }
    return false;
  }

  // Allowlist как объект-словарь { [slug]: true }
  if (allowlist && typeof allowlist === 'object' && !allowlist.itemTypes && !allowlist.ids && !allowlist.prefixes && !allowlist.allowedIds) {
    // Проверяем ключи объекта как разрешённые слаги
    for (const key of Object.keys(allowlist)) {
      if (!allowlist[key]) continue; // false — пропускаем
      if (id === key) return true;
      if (itemType === key) return true;
      if (key.endsWith('_') && id.startsWith(key)) return true;
      if (CATEGORY_ALIASES[key]) {
        const mapped = CATEGORY_ALIASES[key];
        if (mapped.itemTypes && mapped.itemTypes.includes(itemType)) return true;
        if (mapped.prefixes && mapped.prefixes.some(p => id.startsWith(p))) return true;
      }
    }
    return false;
  }

  // Allowlist как структурированный объект { itemTypes, ids, prefixes, allowedIds }
  const itemTypes = allowlist.itemTypes instanceof Set ? Array.from(allowlist.itemTypes) : (allowlist.itemTypes || []);
  const ids = allowlist.ids instanceof Set ? Array.from(allowlist.ids) : (allowlist.allowedIds instanceof Set ? Array.from(allowlist.allowedIds) : (allowlist.ids || allowlist.allowedIds || []));
  const prefixes = allowlist.prefixes || allowlist.idPrefixes || [];

  if (itemTypes.includes(itemType)) return true;
  if (ids.includes(id)) return true;
  for (const prefix of prefixes) {
    if (id.startsWith(String(prefix))) return true;
  }

  return false;
}

// Алиасы категорий из примера владельца: robotOnly:{ robotArmor, robotPlating, robotFrame, robotLims, robotWeapons, fancyHat }
// Это общая движковая таблица маппинга категорий на реальные типы/префиксы, не частный случай конкретных предметов.
// Частный случай — какие именно id добавить в fancyHat и т.д. — в данных вне домена.
const CATEGORY_ALIASES = Object.freeze({
  robotArmor: { itemTypes: ['robotArmor', 'armor'], prefixes: ['robot_armor_'] },
  robotPlating: { itemTypes: ['plating'], prefixes: ['robot_plating_'] },
  robotFrame: { itemTypes: ['frame', 'robotFrame'], prefixes: ['robot_frame_'] },
  robotLims: { itemTypes: ['robotArm', 'robotHead', 'robotBody', 'robotLeg', 'robotLegs', 'robotPart'], prefixes: ['robot_head_', 'robot_body_', 'robot_legs_', 'robot_leg_', 'robot_arm_'] },
  robotLimbs: { itemTypes: ['robotArm', 'robotHead', 'robotBody', 'robotLeg', 'robotLegs', 'robotPart'], prefixes: ['robot_head_', 'robot_body_', 'robot_legs_', 'robot_leg_', 'robot_arm_'] },
  robotWeapons: { itemTypes: ['weapon'], prefixes: ['robot_weapon_', 'robot_arm_'] },
  fancyHat: { ids: ['headwear_fancy_hat'] },
  casualHat: { ids: ['headwear_casual_hat'] },
  // Можно расширять без правки частной логики
});
