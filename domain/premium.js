// domain/premium.js
//
// Движковый скелет премиум-доступа (задел, патч 193). UI пока нет — это
// фундамент для будущих премиум-фич (первая — кастомный аватар персонажа,
// см. docs/premium-and-avatar-design.md).
//
// Правила:
//   1. Реестр фич — единственная точка, где фича объявляется премиальной.
//      UI всегда спрашивает isFeatureAvailable(featureId) и ничего не знает
//      о способе проверки права.
//   2. Право (entitlement) — заменяемый источник: сейчас «open beta» (все
//      фичи доступны), позже его даст провайдер лицензий (оффлайн-ключи
//      Ed25519 или бэкенд — вариант решает владелец, см. дизайн-док).
//   3. Железное правило данных: окончание премиума НИКОГДА не удаляет данные
//      пользователя. Блокируется изменение, но не просмотр.
//   4. Модули сеттингов могут регистрировать свои фичи (registerFeatures),
//      движок — свои (ниже). В id — camelCase.

/** Идентификаторы движковых фич. */
export const FEATURE_IDS = Object.freeze({
  CUSTOM_AVATAR: 'customAvatar',
});

const featuresById = new Map();

/**
 * Зарегистрировать фичи (движок или модуль сеттинга).
 * Повторная регистрация того же id перезаписывает — так тесты и модули
 * могут уточнять описание.
 *
 * @param {Array<{id: string, premium?: boolean, moduleId?: string, titleKey?: string}>} list
 */
export function registerFeatures(list) {
  if (!Array.isArray(list)) return;
  for (const feature of list) {
    if (!feature?.id || typeof feature.id !== 'string') continue;
    featuresById.set(feature.id, { premium: false, moduleId: null, ...feature });
  }
}

/** Описание фичи или null. */
export function getFeature(featureId) {
  return featuresById.get(featureId) ?? null;
}

/** Все зарегистрированные фичи (для экрана «О премиуме» в будущем). */
export function listFeatures() {
  return Array.from(featuresById.values());
}

// Текущее право доступа. До подключения провайдера лицензий — открытый
// доступ (open beta): фича обкатывается массово, включение платности
// станет заменой этого объекта, не авралом с кодом (этап 3 дизайна).
let entitlement = Object.freeze({
  plan: 'open-beta',
  allFeatures: true,
  features: null,
  expiresAt: null,
});

/** Текущее право (иммутабельное). */
export function getEntitlement() {
  return entitlement;
}

/**
 * Заменить право (вызовет будущий провайдер лицензий; тесты — тоже).
 * null/undefined возвращает open-beta.
 */
export function setEntitlement(next) {
  entitlement = next
    ? Object.freeze({ plan: 'unknown', allFeatures: false, features: null, expiresAt: null, ...next })
    : Object.freeze({ plan: 'open-beta', allFeatures: true, features: null, expiresAt: null });
}

/**
 * Доступна ли фича. Неизвестная фича недоступна — опечатка в id не должна
 * молча открывать премию.
 *
 * @param {string} featureId
 * @returns {boolean}
 */
export function isFeatureAvailable(featureId) {
  const feature = featuresById.get(featureId);
  if (!feature) return false;
  if (!feature.premium) return true;
  const e = entitlement;
  if (e.allFeatures) return true;
  if (e.expiresAt != null && Number(e.expiresAt) < Date.now()) return false;
  return Array.isArray(e.features) && e.features.includes(featureId);
}

// Движковая регистрация: кастомный аватар — первая премиум-фича.
// UI (кнопка на фото, пикер) появится позже; синк и кэш уже в коде
// (components/cloudSync/avatarSync.js, db/avatarCache.js).
registerFeatures([
  { id: FEATURE_IDS.CUSTOM_AVATAR, premium: true },
]);
