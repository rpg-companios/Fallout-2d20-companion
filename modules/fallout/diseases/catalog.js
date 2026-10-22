import { getActiveSettingRuntime } from 'engine:src/engine/settings/activeSettingRuntime';
import { getSettingData, getSettingNames } from 'engine:domain/registry';
import { getCurrentModuleLocale } from 'engine:i18n/locale';

const EMPTY_ARRAY = Object.freeze([]);

/** Resolve Fallout's disease rows with their active-locale labels. */
export const getFalloutDiseaseCatalog = (locale = getCurrentModuleLocale()) => {
  const runtime = getActiveSettingRuntime();
  if (!runtime) return EMPTY_ARRAY;

  const supportedLocales = runtime.manifest?.locales ?? Object.keys(runtime.setting?.names ?? {});
  if (!supportedLocales.includes(locale)) {
    throw new Error(`[fallout:diseases] Setting "${runtime.id}" has no disease catalogue for "${locale}"`);
  }

  const data = getSettingData('conditions', 'diseases') ?? EMPTY_ARRAY;
  const localized = getSettingNames(locale)?.conditions?.diseases ?? EMPTY_ARRAY;
  const localizedById = new Map(localized.map((item) => [item.id, item]));
  return data.map((dataItem) => {
    const localizedItem = localizedById.get(dataItem.id);
    if (!localizedItem?.name) {
      throw new Error(`[fallout:diseases] Missing disease name for id: ${dataItem.id}`);
    }
    return { ...dataItem, ...localizedItem, name: localizedItem.name };
  });
};

/** Read the Fallout disease exposure rule without changing its orchestration semantics. */
export const getFalloutSceneRiskRules = () => {
  const rule = getSettingData('rules', 'diseaseExposure');
  return rule ? [rule] : EMPTY_ARRAY;
};
