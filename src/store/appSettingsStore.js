import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ENGINE_SETTINGS,
  getModuleSettings,
  getSettingDefault,
  getSettingById,
} from '../../domain/settingsCatalog';
import { getCurrentLocale, setCurrentLocale } from '../../i18n/locale';

// Стор настроек: значения сгруппированы ПО МОДУЛЯМ —
// { [moduleId]: { [settingId]: value } } + движковые настройки в ключе 'engine'.
// Переключение сеттинга не смешивает значения разных модулей.
//
// Движковые настройки (каталоги персонажей, вид карточек оружия) — в 'engine';
// настройки механик сеттинга — в 'fallout' (и будущих модулях).
const ENGINE_KEY = 'engine';
const MODULE_ID = 'fallout';

const clamp = (value, min, max) => Math.min(max, Math.max(min, Math.floor(Number(value) || min)));

const applySettingValue = (setting, value) => {
  if (setting?.type === 'number') {
    return clamp(value, setting.min ?? 0, setting.max ?? 100);
  }
  if (setting?.type === 'boolean') return Boolean(value);
  return value;
};

const buildDefaults = () => {
  const defaults = { [ENGINE_KEY]: {}, [MODULE_ID]: {} };
  ENGINE_SETTINGS.forEach((s) => { defaults[ENGINE_KEY][s.id] = s.defaultValue; });
  getModuleSettings(MODULE_ID).forEach((s) => { defaults[MODULE_ID][s.id] = s.defaultValue; });
  return defaults;
};

// Инициализация языка из настроек (если задан) — до первого рендера.
const initial = buildDefaults();
const persistedLanguage = null; // значение подтянется hydrate-ом (см. migrate/onRehydrate)

const useAppSettingsStore = create(
  persist(
    (set, get) => ({
      values: initial,

      getValue: (settingId) => {
        const setting = getSettingById(settingId);
        const scope = setting && ENGINE_SETTINGS.some((s) => s.id === settingId)
          ? ENGINE_KEY
          : MODULE_ID;
        const current = get().values[scope]?.[settingId];
        return current !== undefined ? current : getSettingDefault(settingId);
      },

      setValue: (settingId, value) => {
        const setting = getSettingById(settingId);
        const scope = setting && ENGINE_SETTINGS.some((s) => s.id === settingId)
          ? ENGINE_KEY
          : MODULE_ID;
        const normalized = applySettingValue(setting, value);
        set((state) => ({
          values: {
            ...state.values,
            [scope]: { ...(state.values[scope] || {}), [settingId]: normalized },
          },
        }));
        // Язык интерфейса — настройка сеттинга; применяется сразу.
        if (settingId === 'language' && typeof normalized === 'string') {
          setCurrentLocale(normalized);
        }
      },

      // Удобные функции-селекторы (подписываемые): значения с дефолтами.
      getSettingValue: (settingId) => get().getValue(settingId),

      setCharacterFoldersEnabled: (v) => get().setValue('characterFoldersEnabled', v),
      setCharacterDeleteActionPlacement: (v) => get().setValue('characterDeleteActionPlacement', v),
      setWeaponCardsDisplayMode: (v) => get().setValue('weaponCardsDisplayMode', v),
      setWeaponDurabilityLossEnabled: (v) => get().setValue('weaponDurabilityLossEnabled', v),
      setWeaponDurabilityLossPer10Shots: (v) => get().setValue('weaponDurabilityLossPer10Shots', v),
      setRandomWeaponQualityEnabled: (v) => get().setValue('randomWeaponQualityEnabled', v),
      setUnarmedAttackVisible: (v) => get().setValue('unarmedAttackVisible', v),
    }),
    {
      name: 'settings',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ values: state.values }),
      migrate: (persistedState) => {
        // Миграция со старого хранилища ('fallout2d20:settings', плоские ключи)
        // на новое: { [moduleId]: { [settingId]: value } }.
        const defaults = buildDefaults();
        if (persistedState?.values && typeof persistedState.values === 'object') {
          return persistedState; // уже новый формат
        }
        // старый формат: плоские ключи на верхнем уровне
        const fallout = { ...defaults[MODULE_ID] };
        const engine = { ...defaults[ENGINE_KEY] };
        const old = persistedState || {};
        // переименование v0->v1 старого формата
        const qualityEnabled = old.randomWeaponQualityEnabled ??
          old.randomWeaponDurabilityEnabled ?? false;
        if (old.randomWeaponDurabilityEnabled !== undefined) {
          fallout.randomWeaponQualityEnabled = Boolean(old.randomWeaponDurabilityEnabled);
          fallout.weaponDurabilityLossEnabled = false;
        } else {
          fallout.weaponDurabilityLossEnabled = old.weaponDurabilityLossEnabled ?? false;
          fallout.randomWeaponQualityEnabled = Boolean(qualityEnabled);
        }
        fallout.weaponDurabilityLossPer10Shots = old.weaponDurabilityLossPer10Shots ?? 1;
        fallout.unarmedAttackVisible = old.unarmedAttackVisible ?? true;
        engine.characterFoldersEnabled = old.characterFoldersEnabled ?? false;
        engine.weaponCardsDisplayMode = ['cards', 'spoilers', 'tabs'].includes(old.weaponCardsDisplayMode)
          ? old.weaponCardsDisplayMode
          : 'cards';
        return { values: { [ENGINE_KEY]: engine, [MODULE_ID]: fallout } };
      },
      version: 1,
      onRehydrateStorage: () => (state) => {
        // после восстановления применяем язык из настроек
        if (state?.values?.[MODULE_ID]?.language) {
          setCurrentLocale(state.values[MODULE_ID].language);
        }
      },
    },
  ),
);

export default useAppSettingsStore;

// Подписываемые селекторы (используются в компонентах вместо геттеров).
export const selectCharacterFoldersEnabled = (state) => state.getSettingValue('characterFoldersEnabled');
export const selectCharacterDeleteActionPlacement = (state) => state.getSettingValue('characterDeleteActionPlacement');
export const selectWeaponCardsDisplayMode = (state) => state.getSettingValue('weaponCardsDisplayMode');
export const selectWeaponDurabilityLossEnabled = (state) => state.getSettingValue('weaponDurabilityLossEnabled');
export const selectWeaponDurabilityLossPer10Shots = (state) => state.getSettingValue('weaponDurabilityLossPer10Shots');
export const selectRandomWeaponQualityEnabled = (state) => state.getSettingValue('randomWeaponQualityEnabled');
export const selectUnarmedAttackVisible = (state) => state.getSettingValue('unarmedAttackVisible');
