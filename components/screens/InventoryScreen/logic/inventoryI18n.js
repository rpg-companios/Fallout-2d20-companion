import { getCurrentModuleLocale } from '../../../../i18n/locale';
import { getSettingScreenI18n } from '../../../../domain/registry';

/** Read the active setting's complete inventory locale bundle. */
export const getInventoryDictionary = (locale = getCurrentModuleLocale()) => (
  getSettingScreenI18n('inventory', locale)
);

const resolvePath = (source, path) => {
  let current = source;
  for (const part of String(path).split('.')) {
    current = current?.[part];
    if (current === undefined) return path;
  }
  return current;
};

export const tInventory = (path) => resolvePath(getInventoryDictionary(), path);

export const formatInventoryText = (template, params = {}) =>
  String(template).replace(/\{(\w+)\}/g, (_, key) => String(params[key] ?? `{${key}}`));
