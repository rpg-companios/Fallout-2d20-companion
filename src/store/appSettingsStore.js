import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ENGINE_SETTINGS,
  getModuleSettings,
  getSettingDefault,
  getSettingById,
} from '../../domain/settingsCatalog';
import {
  getActiveModuleId,
  getModuleLocales,
  resolveModuleLocale,
} from '../../domain/moduleLocale';
import {
  getCurrentLocale,
  setCurrentLocale,
  setCurrentModuleLocale,
  SUPPORTED_LOCALES,
} from '../../i18n/locale';

// Значения движка и каждого сеттинга хранятся раздельно:
// { engine: { ... }, [moduleId]: { ... } }.
// Ручной выбор языка контента также раздельный по сеттингам и не смешивается
// с языком интерфейса движка.
const ENGINE_KEY = 'engine';

const clamp = (value, min, max) => Math.min(max, Math.max(min, Math.floor(Number(value) || min)));

const applySettingValue = (setting, value) => {
  if (setting?.type === 'number') {
    return clamp(value, setting.min ?? 0, setting.max ?? 100);
  }
  if (setting?.type === 'boolean') return Boolean(value);
  if (setting?.type === 'select') {
    return setting.options.some((option) => option.value === value)
      ? value
      : setting.defaultValue;
  }
  return value;
};

const isEngineSetting = (settingId) =>
  ENGINE_SETTINGS.some((setting) => setting.id === settingId);

const ENGINE_SETTING_IDS = new Set(ENGINE_SETTINGS.map((setting) => setting.id));
const LEGACY_VALUES_KEY = '$legacySettings';
const getSettingLegacyKeys = (setting) => (
  Array.isArray(setting?.legacyKeys) && setting.legacyKeys.length > 0
    ? [...new Set(setting.legacyKeys.filter((key) => typeof key === 'string'))]
    : [setting?.id].filter(Boolean)
);

const findLegacySettingValue = (setting, sources = []) => {
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue;
    for (const key of getSettingLegacyKeys(setting)) {
      if (source[key] !== undefined && source[key] !== null) {
        return { found: true, key, value: source[key] };
      }
    }
  }
  return { found: false, key: null, value: undefined };
};

const buildDefaults = (moduleId = getActiveModuleId()) => {
  const defaults = { [ENGINE_KEY]: {} };
  ENGINE_SETTINGS.forEach((setting) => {
    defaults[ENGINE_KEY][setting.id] = setting.defaultValue;
  });
  if (moduleId) {
    defaults[moduleId] = {};
    getModuleSettings(moduleId).forEach((setting) => {
      defaults[moduleId][setting.id] = setting.defaultValue;
    });
  }
  return defaults;
};

const syncRuntimeLocales = (values, moduleLocales = {}) => {
  const engineLocale = setCurrentLocale(values?.[ENGINE_KEY]?.language);
  const moduleId = getActiveModuleId();
  const moduleLocale = resolveModuleLocale({
    moduleId,
    engineLocale,
    manualLocale: moduleId ? moduleLocales[moduleId] ?? null : null,
  });
  setCurrentModuleLocale(moduleLocale);
};

const initial = buildDefaults();
// До гидратации сохраняем определённый движком язык устройства, а не
// перетираем его статическим дефолтом каталога.
initial[ENGINE_KEY].language = getCurrentLocale();
syncRuntimeLocales(initial);

const migrateNestedState = (persistedState) => {
  const defaults = buildDefaults();
  const previousValues = persistedState?.values && typeof persistedState.values === 'object'
    ? persistedState.values
    : {};
  const previousEngine = previousValues[ENGINE_KEY] || {};
  const values = Object.fromEntries(
    Object.entries(previousValues).map(([scope, scopedValues]) => [
      scope,
      scopedValues && typeof scopedValues === 'object' ? { ...scopedValues } : scopedValues,
    ]),
  );
  const engine = { ...defaults[ENGINE_KEY], ...previousEngine };
  ENGINE_SETTINGS.forEach((setting) => {
    engine[setting.id] = applySettingValue(
      setting,
      previousEngine[setting.id] ?? setting.defaultValue,
    );
  });
  values[ENGINE_KEY] = engine;
  const activeModuleId = getActiveModuleId();
  const previousModuleValues = activeModuleId && values[activeModuleId]
    ? values[activeModuleId]
    : {};
  const previousLegacyValues = values[LEGACY_VALUES_KEY]
    && typeof values[LEGACY_VALUES_KEY] === 'object'
    ? values[LEGACY_VALUES_KEY]
    : {};
  for (const [key, value] of Object.entries(previousEngine)) {
    if (!ENGINE_SETTING_IDS.has(key)) {
      if (previousLegacyValues[key] === undefined) previousLegacyValues[key] = value;
      delete engine[key];
    }
  }
  const consumedLegacyKeys = new Set();
  const migratedEngineKeys = new Set();

  const previousLanguage = previousEngine.language
    ?? Object.entries(previousValues).find(([scope, value]) => (
      scope !== ENGINE_KEY
      && scope !== LEGACY_VALUES_KEY
      && value?.language
    ))?.[1]?.language;
  engine.language = SUPPORTED_LOCALES.includes(previousLanguage)
    ? previousLanguage
    : defaults[ENGINE_KEY].language;

  for (const [scope, scopedValues] of Object.entries(values)) {
    if (scope !== ENGINE_KEY && scopedValues && typeof scopedValues === 'object') {
      delete scopedValues.language;
    }
  }

  if (activeModuleId) {
    const moduleValues = {
      ...(defaults[activeModuleId] || {}),
      ...previousModuleValues,
    };
    const activeSettings = getModuleSettings(activeModuleId);
    for (const setting of activeSettings) {
      const legacy = findLegacySettingValue(setting, [previousLegacyValues, previousEngine]);
      const currentValue = previousModuleValues[setting.id];
      moduleValues[setting.id] = applySettingValue(
        setting,
        currentValue ?? legacy.value ?? setting.defaultValue,
      );
      for (const key of getSettingLegacyKeys(setting)) {
        if (Object.prototype.hasOwnProperty.call(previousLegacyValues, key)) {
          consumedLegacyKeys.add(key);
        }
        if (Object.prototype.hasOwnProperty.call(previousEngine, key) && !ENGINE_SETTING_IDS.has(key)) {
          migratedEngineKeys.add(key);
        }
      }
    }
    consumedLegacyKeys.forEach((key) => delete previousLegacyValues[key]);
    migratedEngineKeys.forEach((key) => delete engine[key]);
    values[activeModuleId] = moduleValues;
  }

  if (Object.keys(previousLegacyValues).length > 0) {
    values[LEGACY_VALUES_KEY] = previousLegacyValues;
  } else {
    delete values[LEGACY_VALUES_KEY];
  }

  const moduleLocales = Object.fromEntries(
    Object.entries(persistedState?.moduleLocales || {})
      .filter(([, locale]) => typeof locale === 'string'),
  );
  if (activeModuleId && !getModuleLocales(activeModuleId).includes(moduleLocales[activeModuleId])) {
    delete moduleLocales[activeModuleId];
  }

  return {
    ...persistedState,
    values,
    moduleLocales,
  };
};

const migrateFlatState = (persistedState) => {
  const defaults = buildDefaults();
  const old = persistedState && typeof persistedState === 'object' ? persistedState : {};
  const engine = { ...defaults[ENGINE_KEY] };
  ENGINE_SETTINGS.forEach((setting) => {
    engine[setting.id] = applySettingValue(
      setting,
      old[setting.id] ?? setting.defaultValue,
    );
  });

  const moduleId = getActiveModuleId();
  const moduleSettings = moduleId ? getModuleSettings(moduleId) : [];
  const moduleValues = {};
  const consumedLegacyKeys = new Set();
  moduleSettings.forEach((setting) => {
    const legacy = findLegacySettingValue(setting, [old]);
    moduleValues[setting.id] = applySettingValue(
      setting,
      legacy.value ?? setting.defaultValue,
    );
    if (legacy.found) consumedLegacyKeys.add(legacy.key);
  });

  const legacyValues = Object.fromEntries(
    Object.entries(old).filter(([key]) => (
      !ENGINE_SETTING_IDS.has(key)
      && !consumedLegacyKeys.has(key)
    )),
  );
  const values = { [ENGINE_KEY]: engine };
  if (moduleId) values[moduleId] = moduleValues;
  if (Object.keys(legacyValues).length > 0) values[LEGACY_VALUES_KEY] = legacyValues;

  return { values, moduleLocales: {} };
};

const useAppSettingsStore = create(
  persist(
    (set, get) => ({
      values: initial,
      moduleLocales: {},
      settingsHydrated: false,

      finishSettingsHydration: () => set({ settingsHydrated: true }),

      activateActiveModuleSettings: (moduleId = getActiveModuleId()) => {
        if (!moduleId) {
          syncRuntimeLocales(get().values, get().moduleLocales);
          return;
        }
        const state = get();
        const settings = getModuleSettings(moduleId);
        const existingValues = state.values[moduleId] || {};
        const engineValues = { ...(state.values[ENGINE_KEY] || {}) };
        const legacyValues = { ...(state.values[LEGACY_VALUES_KEY] || {}) };
        const moduleValues = { ...existingValues };
        const consumedLegacyKeys = new Set();
        const migratedEngineKeys = new Set();

        settings.forEach((setting) => {
          const legacy = findLegacySettingValue(setting, [legacyValues, engineValues]);
          moduleValues[setting.id] = applySettingValue(
            setting,
            existingValues[setting.id] ?? legacy.value ?? setting.defaultValue,
          );
          for (const key of getSettingLegacyKeys(setting)) {
            if (Object.prototype.hasOwnProperty.call(legacyValues, key)) {
              consumedLegacyKeys.add(key);
            }
            if (Object.prototype.hasOwnProperty.call(engineValues, key) && !ENGINE_SETTING_IDS.has(key)) {
              migratedEngineKeys.add(key);
            }
          }
        });
        consumedLegacyKeys.forEach((key) => delete legacyValues[key]);
        migratedEngineKeys.forEach((key) => delete engineValues[key]);

        const nextValues = {
          ...state.values,
          [ENGINE_KEY]: engineValues,
          [moduleId]: moduleValues,
        };
        if (Object.keys(legacyValues).length > 0) {
          nextValues[LEGACY_VALUES_KEY] = legacyValues;
        } else {
          delete nextValues[LEGACY_VALUES_KEY];
        }
        const moduleLocales = { ...state.moduleLocales };
        if (!getModuleLocales(moduleId).includes(moduleLocales[moduleId])) {
          delete moduleLocales[moduleId];
        }
        set({ values: nextValues, moduleLocales });
        syncRuntimeLocales(get().values, get().moduleLocales);
      },

      getValue: (settingId) => {
        const setting = getSettingById(settingId);
        const moduleId = getActiveModuleId();
        if (!setting) {
          if (!moduleId && !isEngineSetting(settingId)) return null;
          throw new Error(`[appSettingsStore] Неизвестная настройка "${settingId}"`);
        }
        const scope = isEngineSetting(settingId) ? ENGINE_KEY : moduleId;
        const current = get().values[scope]?.[settingId];
        return current !== undefined ? current : getSettingDefault(settingId);
      },

      setValue: (settingId, value) => {
        const setting = getSettingById(settingId);
        const moduleId = getActiveModuleId();
        if (!setting) throw new Error(`[appSettingsStore] Неизвестная настройка "${settingId}"`);
        const scope = isEngineSetting(settingId) ? ENGINE_KEY : moduleId;
        if (!scope) throw new Error(`[appSettingsStore] Нет активного сеттинга для настройки "${settingId}"`);
        const normalized = applySettingValue(setting, value);
        set((state) => ({
          values: {
            ...state.values,
            [scope]: { ...(state.values[scope] || {}), [settingId]: normalized },
          },
        }));
        if (settingId === 'language') {
          syncRuntimeLocales(get().values, get().moduleLocales);
        }
      },

      getSettingValue: (settingId) => get().getValue(settingId),

      getModuleLocale: (moduleId = getActiveModuleId()) => resolveModuleLocale({
        moduleId,
        engineLocale: get().getValue('language'),
        manualLocale: moduleId ? get().moduleLocales[moduleId] ?? null : null,
      }),

      setModuleLocale: (moduleId, locale) => {
        if (!getModuleLocales(moduleId).includes(locale)) {
          throw new Error(`[appSettingsStore] Язык "${locale}" отсутствует в модуле "${moduleId}"`);
        }
        set((state) => ({
          moduleLocales: { ...state.moduleLocales, [moduleId]: locale },
        }));
        syncRuntimeLocales(get().values, get().moduleLocales);
      },

      setCharacterFoldersEnabled: (value) => get().setValue('characterFoldersEnabled', value),
      setCharacterDeleteActionPlacement: (value) => get().setValue('characterDeleteActionPlacement', value),
      setLanguage: (value) => get().setValue('language', value),
    }),
    {
      name: 'settings',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ values: state.values, moduleLocales: state.moduleLocales }),
      migrate: (persistedState) => (
        persistedState?.values && typeof persistedState.values === 'object'
          ? migrateNestedState(persistedState)
          : migrateFlatState(persistedState)
      ),
      version: 3,
      onRehydrateStorage: () => (state) => {
        if (state) {
          syncRuntimeLocales(state.values, state.moduleLocales);
          state.finishSettingsHydration();
        }
      },
    },
  ),
);

export default useAppSettingsStore;

export const selectCharacterFoldersEnabled = (state) => state.getSettingValue('characterFoldersEnabled');
export const selectCharacterDeleteActionPlacement = (state) => state.getSettingValue('characterDeleteActionPlacement');
export const selectBootScreenEnabled = (state) => state.getSettingValue('bootScreenEnabled');
export const selectPwaInstallDiagnosticsEnabled = (state) => state.getSettingValue('pwaInstallDiagnostics');
export const selectSettingsHydrated = (state) => state.settingsHydrated;
export const selectLanguage = (state) => state.getSettingValue('language');
export const selectSettingValue = (settingId) => (state) => state.getSettingValue(settingId);
