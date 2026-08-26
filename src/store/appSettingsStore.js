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
  getRegisteredModuleIds,
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
const MODULE_ID = getActiveModuleId();

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

const buildDefaults = () => {
  const defaults = { [ENGINE_KEY]: {}, [MODULE_ID]: {} };
  ENGINE_SETTINGS.forEach((setting) => {
    defaults[ENGINE_KEY][setting.id] = setting.defaultValue;
  });
  getModuleSettings(MODULE_ID).forEach((setting) => {
    defaults[MODULE_ID][setting.id] = setting.defaultValue;
  });
  return defaults;
};

const syncRuntimeLocales = (values, moduleLocales = {}) => {
  const engineLocale = setCurrentLocale(values?.[ENGINE_KEY]?.language);
  const moduleLocale = resolveModuleLocale({
    moduleId: MODULE_ID,
    engineLocale,
    manualLocale: moduleLocales[MODULE_ID] ?? null,
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
  const previousValues = persistedState.values || {};
  const previousEngine = previousValues[ENGINE_KEY] || {};
  const previousModule = previousValues[MODULE_ID] || {};
  const engine = { ...defaults[ENGINE_KEY], ...previousEngine };
  const fallout = { ...defaults[MODULE_ID], ...previousModule };

  const previousLanguage = previousEngine.language ?? previousModule.language;
  engine.language = SUPPORTED_LOCALES.includes(previousLanguage)
    ? previousLanguage
    : defaults[ENGINE_KEY].language;

  const previousDisplayMode = previousModule.weaponCardsDisplayMode
    ?? previousEngine.weaponCardsDisplayMode;
  fallout.weaponCardsDisplayMode = ['cards', 'spoilers'].includes(previousDisplayMode)
    ? previousDisplayMode
    : 'cards';

  // Эти настройки сменили владельца: язык относится к движку, а доступные
  // способы показа оружия объявляет Fallout.
  delete engine.weaponCardsDisplayMode;
  delete fallout.language;

  const moduleLocales = {};
  for (const moduleId of getRegisteredModuleIds()) {
    const previousManualLocale = persistedState.moduleLocales?.[moduleId];
    if (getModuleLocales(moduleId).includes(previousManualLocale)) {
      moduleLocales[moduleId] = previousManualLocale;
    }
  }

  return {
    ...persistedState,
    values: { [ENGINE_KEY]: engine, [MODULE_ID]: fallout },
    moduleLocales,
  };
};

const migrateFlatState = (persistedState) => {
  const defaults = buildDefaults();
  const fallout = { ...defaults[MODULE_ID] };
  const engine = { ...defaults[ENGINE_KEY] };
  const old = persistedState || {};
  const qualityEnabled = old.randomWeaponQualityEnabled
    ?? old.randomWeaponDurabilityEnabled
    ?? false;

  if (old.randomWeaponDurabilityEnabled !== undefined) {
    fallout.randomWeaponQualityEnabled = Boolean(old.randomWeaponDurabilityEnabled);
    fallout.weaponDurabilityLossEnabled = false;
  } else {
    fallout.weaponDurabilityLossEnabled = old.weaponDurabilityLossEnabled ?? false;
    fallout.randomWeaponQualityEnabled = Boolean(qualityEnabled);
  }

  fallout.weaponDurabilityLossPer10Shots = old.weaponDurabilityLossPer10Shots ?? 1;
  fallout.unarmedAttackVisible = old.unarmedAttackVisible ?? true;
  fallout.weaponCardsDisplayMode = ['cards', 'spoilers'].includes(old.weaponCardsDisplayMode)
    ? old.weaponCardsDisplayMode
    : 'cards';
  engine.characterFoldersEnabled = old.characterFoldersEnabled ?? false;
  engine.characterDeleteActionPlacement = ['menu', 'card'].includes(old.characterDeleteActionPlacement)
    ? old.characterDeleteActionPlacement
    : 'menu';
  engine.language = SUPPORTED_LOCALES.includes(old.language)
    ? old.language
    : defaults[ENGINE_KEY].language;

  return { values: { [ENGINE_KEY]: engine, [MODULE_ID]: fallout }, moduleLocales: {} };
};

const useAppSettingsStore = create(
  persist(
    (set, get) => ({
      values: initial,
      moduleLocales: {},
      settingsHydrated: false,

      finishSettingsHydration: () => set({ settingsHydrated: true }),

      getValue: (settingId) => {
        const setting = getSettingById(settingId);
        if (!setting) throw new Error(`[appSettingsStore] Неизвестная настройка "${settingId}"`);
        const scope = isEngineSetting(settingId) ? ENGINE_KEY : MODULE_ID;
        const current = get().values[scope]?.[settingId];
        return current !== undefined ? current : getSettingDefault(settingId);
      },

      setValue: (settingId, value) => {
        const setting = getSettingById(settingId);
        if (!setting) throw new Error(`[appSettingsStore] Неизвестная настройка "${settingId}"`);
        const scope = isEngineSetting(settingId) ? ENGINE_KEY : MODULE_ID;
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

      getModuleLocale: (moduleId = MODULE_ID) => resolveModuleLocale({
        moduleId,
        engineLocale: get().getValue('language'),
        manualLocale: get().moduleLocales[moduleId] ?? null,
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
      setWeaponCardsDisplayMode: (value) => get().setValue('weaponCardsDisplayMode', value),
      setWeaponDurabilityLossEnabled: (value) => get().setValue('weaponDurabilityLossEnabled', value),
      setWeaponDurabilityLossPer10Shots: (value) => get().setValue('weaponDurabilityLossPer10Shots', value),
      setRandomWeaponQualityEnabled: (value) => get().setValue('randomWeaponQualityEnabled', value),
      setUnarmedAttackVisible: (value) => get().setValue('unarmedAttackVisible', value),
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
      version: 2,
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
export const selectSettingsHydrated = (state) => state.settingsHydrated;
export const selectLanguage = (state) => state.getSettingValue('language');
export const selectWeaponCardsDisplayMode = (state) => state.getSettingValue('weaponCardsDisplayMode');
export const selectWeaponDurabilityLossEnabled = (state) => state.getSettingValue('weaponDurabilityLossEnabled');
export const selectWeaponDurabilityLossPer10Shots = (state) => state.getSettingValue('weaponDurabilityLossPer10Shots');
export const selectRandomWeaponQualityEnabled = (state) => state.getSettingValue('randomWeaponQualityEnabled');
export const selectUnarmedAttackVisible = (state) => state.getSettingValue('unarmedAttackVisible');
