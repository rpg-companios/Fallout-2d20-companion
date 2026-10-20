// Fallout-owned catalog identity rules and persisted inventory key format.

const generateId = () => `id_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

/**
 * Канонический id предмета (Шаг 8а, часть 3): ключ модификаций в сейве
 * (modifiedItems) и вообще «какой это предмет». Порядок проверок — прежний
 * (была локальная функция CharacterContext): уникальный id экземпляра
 * важнее канонического кода; Name (с заглавной) — легаси-поле старых сейвов.
 */
export const getItemId = (item = {}) => {
  if (item.uniqueId) return item.uniqueId;
  return item.weaponId || item.code || item.id || item.Name;
};

/**
 * Канонический код каталога, в отличие от идентификатора экземпляра/строки.
 *
 * `getItemId` намеренно сохраняет исторический приоритет `uniqueId`: он нужен
 * там, где ключом является конкретный экземпляр (например, старый альбом
 * модификаций). В UI инвентаря `uniqueId` может быть синтетическим ключом
 * отображаемого стека (`inv-stack-…`), поэтому для поиска предмета в каталоге
 * его использовать нельзя. Этот резолвер предназначен именно для правил,
 * привязанных к каталожной записи (разбор, состав материалов и т. п.).
 */
export const getCanonicalItemId = (item = {}) =>
  item.weaponId || item.itemId || item.armorId || item.clothingId || item.code || item.id || item.Name;

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
 * Setting-owned item types whose identity depends on extra payload fields can
 * provide their own stack key through the active inventory capability.
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


/** Generate an instance identifier from a package item payload. */
export const generateItemIdForItem = (item = {}, { identityId } = {}) => {
  if (item.uniqueId) return item.uniqueId;
  const catalogId = identityId
    || item.weaponId
    || item.id
    || item.name
    || item.code
    || item.itemId
    || item.armorId
    || item.clothingId
    || item.Name;
  return generateItemId(
    catalogId,
    item.appliedMods || {},
    item.baseName || '',
    item.durabilityTracked ? item.durability : undefined,
    item.uniqQualities,
  );
};

/** Generate a stack key from package-owned identity-bearing item state. */
export const generateStackKeyForItem = (item = {}, { identityId } = {}) => {
  if (item.stackKey) return item.stackKey;
  const catalogId = identityId
    || item.weaponId
    || item.id
    || item.name
    || item.code
    || item.itemId
    || item.armorId
    || item.clothingId
    || item.Name;
  return generateStackKey(
    catalogId,
    item.appliedMods || {},
    item.baseName || '',
    item.durabilityTracked ? item.durability : undefined,
    item.uniqQualities,
  );
};


/** Compose the legacy UI stack signature for a Fallout weapon. */
export const getFalloutWeaponDisplayStackKey = (item = {}) => {
  const modIds = Object.values(item.appliedMods || {}).filter(Boolean).sort();
  const modSignature = modIds.length ? modIds.join('|') : 'none';
  const storeKey = item.stackKey || generateStackKeyForItem(item);
  return `weapon:${storeKey}:mods:${modSignature}`;
};

/** Match a legacy display signature against package-owned item fields. */
export const findFalloutUnequippedItemByDisplayStackKey = (items = [], stackKey) => {
  if (!stackKey || !Array.isArray(items)) return undefined;
  const match = String(stackKey).match(/^[^:]+:(.+?):mods:/);
  const catalogId = match ? match[1] : null;
  if (!catalogId) return undefined;
  const byStackKey = items.find((item) => item?.stackKey === catalogId && !item.equipped);
  if (byStackKey) return byStackKey;
  return items.find((item) => (item?.weaponId || item?.id) === catalogId && !item.equipped);
};
