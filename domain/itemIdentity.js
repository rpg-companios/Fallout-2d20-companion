// Generic compatibility adapters for setting-owned item identity semantics.
import { getSettingService } from './registry.js';

const getIdentityService = () => getSettingService('inventory')?.itemIdentity ?? null;
const generateId = () => `id_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

/** Generic item-record identity fallback; packages may resolve legacy fields. */
export const getItemId = (item = {}) => {
  const resolve = getIdentityService()?.getItemId;
  return typeof resolve === 'function'
    ? resolve(item)
    : item.uniqueId || item.catalogId || item.id || null;
};

/** Generic catalog identity fallback; packages may resolve legacy fields. */
export const getCanonicalItemId = (item = {}) => {
  const resolve = getIdentityService()?.getCanonicalItemId;
  return typeof resolve === 'function'
    ? resolve(item)
    : item.catalogId || item.id || null;
};

/** Shared text normalization helper, with no catalog semantics. */
export const slugifyBaseName = (baseName = '') => String(baseName)
  .toLowerCase()
  .replace(/[^a-zа-яё0-9]+/gi, '_')
  .replace(/^_+|_+$/g, '')
  .slice(0, 40);

/** Forward legacy positional identity construction to the active package. */
export const generateItemId = (...args) => {
  const generate = getIdentityService()?.generateItemId;
  if (typeof generate === 'function') return generate(...args);
  const [identity] = args;
  return (typeof identity === 'string' && identity) || generateId();
};

/** Forward legacy positional stack-key construction to the active package. */
export const generateStackKey = (...args) => {
  const generate = getIdentityService()?.generateStackKey;
  if (typeof generate === 'function') return generate(...args);
  const [identity] = args;
  return (typeof identity === 'string' && identity) || generateId();
};

/** Create an item identifier without interpreting package-owned payload fields. */
export const generateItemIdForItem = (item, options = {}) => {
  const generate = getIdentityService()?.generateItemIdForItem;
  if (typeof generate === 'function') return generate(item, options);
  return item?.uniqueId || options.identityId || item?.catalogId || item?.id || generateId();
};

/** Create a stack signature without interpreting package-owned payload fields. */
export const generateStackKeyForItem = (item, options = {}) => {
  const generate = getIdentityService()?.generateStackKeyForItem;
  if (typeof generate === 'function') return generate(item, options);
  return item?.stackKey || options.identityId || item?.catalogId || item?.id || generateId();
};
