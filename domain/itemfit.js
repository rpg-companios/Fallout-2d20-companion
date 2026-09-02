// domain/itemfit.js
// Механика ограничения предметов по архетипу (fitProfile) и по действию.
// ЧИСТЫЕ ФУНКЦИИ: никаких данных сеттинга, никакого React/RN.
// Данные (fitProfile, справочник категорий) передаются аргументами.
//
// Заменяет цепочку origins.armorPolicy → getArmorPolicy → canEquipArmor/
// canEquipWeapon/canEquipClothing (+ allowlist на origin/main).
//
// Модель:
//   fitProfile = {
//     equip:        { allow, forbidden, bypassAllow, bypassForbidden },
//     consume: { self: {...}, other: {...} }
//   }
//   Профиль {} (или отсутствие ветки) = «по умолчанию разрешено всё».
//
// Действие (action):
//   'equip'         — носить/держать (броня, одежда, оружие, конечность)
//   'consume.self'  — использовать предмет на себе
//   'consume.other' — применить на другом
// Всё прочее (лут/покупка/продажа/передача/мода) НЕ ограничивается fitProfile.

export const ACTIONS = Object.freeze({
  EQUIP: 'equip',
  CONSUME_SELF: 'consume.self',
  CONSUME_OTHER: 'consume.other',
});

/**
 * Возвращает ветку профиля для действия.
 * 'equip' -> profile.equip; 'consume.self'/'consume.other' -> profile.consume.*.
 */
export function getBranch(profile = {}, action = ACTIONS.EQUIP) {
  if (action === ACTIONS.EQUIP) return profile.equip ?? {};
  if (action === ACTIONS.CONSUME_SELF) return profile.consume?.self ?? {};
  if (action === ACTIONS.CONSUME_OTHER) return profile.consume?.other ?? {};
  return {};
}

const ruleValue = (rule, key) => {
  const v = rule?.[key];
  return Array.isArray(v) ? v : [];
};

// Сопоставление item с ОДНИМ матчером. Все ключи матчера = И (AND).
function matchMatcher(item, matcher, categories) {
  if (!matcher || typeof matcher !== 'object') return false;
  for (const [key, expected] of Object.entries(matcher)) {
    if (expected === undefined) continue;

    if (key === 'category') {
      const def = categories?.[expected];
      if (!def || !matchMatcher(item, def, categories)) return false;
      continue;
    }
    if (key === 'any') {
      if (!Array.isArray(expected)) return false;
      if (!expected.some((m) => matchMatcher(item, m, categories))) return false;
      continue;
    }
    if (key === 'not') {
      if (matchMatcher(item, expected, categories)) return false;
      continue;
    }
    if (key === 'item') {
      const id = String(item?.id ?? '');
      const pattern = String(expected);
      if (pattern.endsWith('*')) {
        if (!id.startsWith(pattern.slice(0, -1))) return false;
      } else if (id !== pattern) {
        return false;
      }
      continue;
    }
    if (key === 'idRoot') {
      if (!String(item?.id ?? '').startsWith(String(expected))) return false;
      continue;
    }

    // Обычное поле предмета.
    const actual = item?.[key];
    if (Array.isArray(expected)) {
      if (!expected.includes(actual)) return false;
    } else if (expected === true) {
      if (!actual) return false;
    } else if (expected === false) {
      if (actual) return false;
    } else if (actual !== expected) {
      return false;
    }
  }
  return true;
}

// Сопоставление item со СПИСКОМ матчеров. Пустой список = false.
// Разные элементы = ИЛИ (OR).
function matchList(list, item, categories) {
  if (!Array.isArray(list) || list.length === 0) return false;
  return list.some((m) => matchMatcher(item, m, categories));
}

/**
 * Классификация доступа предмета по действию.
 * @returns {{status:'allowed'|'denied'|'conflict', layer:string}}
 */
export function classifyItemAccess(item, action, profile = {}, categories = {}) {
  const branch = getBranch(profile, action);
  const bf = matchList(ruleValue(branch, 'bypassForbidden'), item, categories);
  const ba = matchList(ruleValue(branch, 'bypassAllow'), item, categories);
  const allowArr = ruleValue(branch, 'allow');
  const allowExplicit = allowArr.length > 0;
  const am = allowExplicit && matchList(allowArr, item, categories);
  const fm = matchList(ruleValue(branch, 'forbidden'), item, categories);

  // Конфликты: где разрешающее и запрещающее правила одной силы пересеклись.
  if (bf && ba) return { status: 'conflict', layer: 'bypass' };
  if (am && fm) return { status: 'conflict', layer: 'allow∩forbidden' };

  // Детерминированный приоритет.
  if (bf) return { status: 'denied', layer: 'bypassForbidden' };
  if (ba) return { status: 'allowed', layer: 'bypassAllow' };
  if (allowExplicit && !am) return { status: 'denied', layer: 'not-in-allow' };
  if (fm) return { status: 'denied', layer: 'forbidden' };
  return { status: 'allowed', layer: 'default' };
}
