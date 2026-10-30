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
  // Раздел Мастера («Админ») и все его механики:
  ADMIN_ACCESS: 'adminAccess',
  GM_CAMPAIGNS: 'gmCampaigns',
  GM_LOOT_TRADE: 'gmLootTrade',
});

/** Все премиальные фичи раздела «Админ», открываемые лицензией Мастера. */
export const ADMIN_FEATURE_IDS = Object.freeze([
  FEATURE_IDS.ADMIN_ACCESS,
  FEATURE_IDS.GM_CAMPAIGNS,
  FEATURE_IDS.GM_LOOT_TRADE,
]);

/** Код ошибки при попытке вызвать механику Мастера без активной лицензии. */
export const ADMIN_LICENSE_ERROR = 'ADMIN_LICENSE_REQUIRED';

/**
 * Единственный рубильник режима по умолчанию:
 * - true  (сейчас, открытый доступ): без введённой лицензии активен план 'open-beta' и доступно всё;
 * - false (будущий платный режим): без лицензии активен план 'free', а раздел «Админ» ждёт лицензию.
 */
export const OPEN_BETA_BY_DEFAULT = true;

const featuresById = new Map();
const entitlementListeners = new Set();

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

const makeDefaultEntitlement = () => (
  OPEN_BETA_BY_DEFAULT
    ? Object.freeze({
        plan: 'open-beta',
        allFeatures: true,
        features: null,
        expiresAt: null,
      })
    : Object.freeze({
        plan: 'free',
        allFeatures: false,
        features: Object.freeze([]),
        expiresAt: null,
      })
);

// Текущее право доступа. До подключения провайдера лицензий — открытый
// доступ (open beta): фича обкатывается массово, включение платности
// станет заменой OPEN_BETA_BY_DEFAULT / вызовом setEntitlement, не авралом с кодом.
let entitlement = makeDefaultEntitlement();

const notifyEntitlementListeners = () => {
  entitlementListeners.forEach((listener) => {
    try {
      listener(entitlement);
    } catch {
      // ошибка подписчика не должна ломать смену права
    }
  });
};

/** Подписка на изменение права доступа (возвращает функцию отписки). */
export function subscribeEntitlement(listener) {
  if (typeof listener !== 'function') return () => {};
  entitlementListeners.add(listener);
  return () => {
    entitlementListeners.delete(listener);
  };
}

/** Текущее право (иммутабельное). */
export function getEntitlement() {
  return entitlement;
}

/**
 * Заменить право (вызовет будущий провайдер лицензий; тесты — тоже).
 * null/undefined возвращает дефолтное право (open-beta при OPEN_BETA_BY_DEFAULT = true).
 */
export function setEntitlement(next) {
  entitlement = next
    ? Object.freeze({ plan: 'unknown', allFeatures: false, features: null, expiresAt: null, ...next })
    : makeDefaultEntitlement();
  notifyEntitlementListeners();
}

/** Сбрасывает право доступа к дефолтному состоянию движка (open-beta при OPEN_BETA_BY_DEFAULT = true). */
export function resetEntitlementToDefault() {
  setEntitlement(null);
}

/**
 * Удобный хелпер активации бессрочной лицензии Мастера (1 лицензия = 1 Google-аккаунт,
 * без ограничения по времени и числу устройств).
 */
export function activateAdminLicense({
  accountSubHash = null,
  keyId = null,
  extraFeatures = [FEATURE_IDS.CUSTOM_AVATAR],
} = {}) {
  const mergedFeatures = Array.from(new Set([
    ...ADMIN_FEATURE_IDS,
    ...(Array.isArray(extraFeatures) ? extraFeatures : []),
  ]));
  setEntitlement({
    plan: 'licensed',
    allFeatures: false,
    features: Object.freeze(mergedFeatures),
    expiresAt: null,
    accountSubHash,
    keyId,
  });
  return entitlement;
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

// Движковая регистрация: кастомный аватар + раздел Мастера («Админ»).
registerFeatures([
  { id: FEATURE_IDS.CUSTOM_AVATAR, premium: true },
  { id: FEATURE_IDS.ADMIN_ACCESS, premium: true, group: 'admin' },
  { id: FEATURE_IDS.GM_CAMPAIGNS, premium: true, group: 'admin' },
  { id: FEATURE_IDS.GM_LOOT_TRADE, premium: true, group: 'admin' },
]);

/** Доступен ли сам вход в раздел Мастера («Админ»). */
export function isAdminLicensed() {
  return isFeatureAvailable(FEATURE_IDS.ADMIN_ACCESS);
}

/** Доступно ли управление комнатами кампаний Мастера («Список кампаний»). */
export function isGmCampaignsLicensed() {
  return isAdminLicensed() && isFeatureAvailable(FEATURE_IDS.GM_CAMPAIGNS);
}

/** Доступен ли раздел «Добыча/Торговля» и выдача локаций/сундуков/торговцев. */
export function isGmLootTradeLicensed() {
  return isAdminLicensed() && isFeatureAvailable(FEATURE_IDS.GM_LOOT_TRADE);
}

/**
 * Создаёт типизированную ошибку отсутствия лицензии Мастера.
 *
 * @param {string} [featureId]
 * @returns {Error & { code: string, featureId: string }}
 */
export function createAdminLicenseError(featureId) {
  const resolvedFeatureId = featureId || FEATURE_IDS.ADMIN_ACCESS;
  const err = /** @type {Error & { code: string, featureId: string }} */ (new Error(ADMIN_LICENSE_ERROR));
  err.code = ADMIN_LICENSE_ERROR;
  err.featureId = resolvedFeatureId;
  return err;
}

/**
 * Жёсткая проверка для сторов и сервисов Мастера: бросает ADMIN_LICENSE_REQUIRED,
 * если раздел Мастера или указанная фича сейчас не открыты лицензией.
 *
 * @param {string} [featureId]
 */
export function assertAdminFeature(featureId) {
  const resolvedFeatureId = featureId || FEATURE_IDS.ADMIN_ACCESS;
  if (!isAdminLicensed() || !isFeatureAvailable(resolvedFeatureId)) {
    throw createAdminLicenseError(resolvedFeatureId);
  }
}
