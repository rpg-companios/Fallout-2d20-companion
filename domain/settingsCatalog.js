// domain/settingsCatalog.js
// Каталог настроек: движковые + настройки активного сеттинга.
//
// Настройка описывает не только тип и значение, но и экран управления:
//   settings   — общее окно «Настройки»;
//   characters — экран менеджера персонажей;
//   equipment  — экран экипировки;
//   inventory  — экран инвентаря.
//
// Движок владеет общими UI-настройками. Механики и доступные варианты
// конкретной игры описывает modules/<id>/settings.json. Например, движок умеет
// отрисовать режим tabs, но Fallout не объявляет этот вариант и потому не даёт
// его выбрать.

import moduleSettings from '../modules/fallout/settings.json';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '../i18n/locale';
import { getActiveModuleId } from './moduleLocale';

export const SETTING_CONTROL_SURFACES = Object.freeze({
  SETTINGS: 'settings',
  CHARACTERS: 'characters',
  EQUIPMENT: 'equipment',
  INVENTORY: 'inventory',
});

/** Движковые настройки (UI-фичи, общие для любых сеттингов). */
export const ENGINE_SETTINGS = [
  {
    id: 'characterFoldersEnabled',
    type: 'boolean',
    controlSurface: SETTING_CONTROL_SURFACES.SETTINGS,
    sectionKey: 'appearance',
    labelKey: 'settings.foldersTitle',
    descriptionKey: 'settings.foldersDescription',
    defaultValue: false,
  },
  {
    id: 'characterDeleteActionPlacement',
    type: 'select',
    controlSurface: SETTING_CONTROL_SURFACES.SETTINGS,
    sectionKey: 'appearance',
    labelKey: 'settings.characterDeleteActionPlacementTitle',
    descriptionKey: 'settings.characterDeleteActionPlacementDescription',
    defaultValue: 'menu',
    options: [
      { value: 'menu', labelKey: 'settings.characterDeleteActionPlacement.menu' },
      { value: 'card', labelKey: 'settings.characterDeleteActionPlacement.card' },
    ],
  },
  {
    id: 'bootScreenEnabled',
    type: 'boolean',
    controlSurface: SETTING_CONTROL_SURFACES.SETTINGS,
    sectionKey: 'appearance',
    labelKey: 'settings.bootScreenTitle',
    descriptionKey: 'settings.bootScreenDescription',
    defaultValue: false,
  },
  {
    id: 'language',
    type: 'select',
    controlSurface: SETTING_CONTROL_SURFACES.CHARACTERS,
    defaultValue: DEFAULT_LOCALE,
    options: SUPPORTED_LOCALES.map((value) => ({ value })),
  },
];

const SUPPORTED_TYPES = ['boolean', 'number', 'select'];
const SUPPORTED_SURFACES = Object.values(SETTING_CONTROL_SURFACES);

const validateSettings = (settings, moduleId) => {
  if (!Array.isArray(settings)) {
    throw new Error(`[settingsCatalog] ${moduleId}/settings.json: ожидался массив`);
  }
  const seen = new Set();
  for (const setting of settings) {
    if (!setting?.id || typeof setting.id !== 'string') {
      throw new Error(`[settingsCatalog] ${moduleId}: запись без id`);
    }
    if (seen.has(setting.id)) {
      throw new Error(`[settingsCatalog] ${moduleId}: дубликат id "${setting.id}"`);
    }
    seen.add(setting.id);
    if (!SUPPORTED_TYPES.includes(setting.type)) {
      throw new Error(`[settingsCatalog] ${moduleId}: "${setting.id}" — неизвестный type "${setting.type}"`);
    }
    if (!SUPPORTED_SURFACES.includes(setting.controlSurface)) {
      throw new Error(`[settingsCatalog] ${moduleId}: "${setting.id}" — неизвестный controlSurface "${setting.controlSurface}"`);
    }
    if (setting.type === 'select' && !Array.isArray(setting.options)) {
      throw new Error(`[settingsCatalog] ${moduleId}: "${setting.id}" (select) без options`);
    }
    if (setting.dependsOn && !settings.some((candidate) => candidate.id === setting.dependsOn)) {
      throw new Error(`[settingsCatalog] ${moduleId}: "${setting.id}" dependsOn неизвестной "${setting.dependsOn}"`);
    }
  }
  return settings;
};

/** Настройки сеттинга (после валидации). */
export const getModuleSettings = (moduleId = getActiveModuleId()) => {
  if (moduleId !== getActiveModuleId()) {
    throw new Error(`[settingsCatalog] модуль "${moduleId}" не зарегистрирован`);
  }
  return validateSettings(moduleSettings, moduleId);
};

/** Все настройки: движковые + настройки активного сеттинга. */
export const getAllSettings = () => [
  ...ENGINE_SETTINGS,
  ...getModuleSettings(getActiveModuleId()),
];

/** Настройки, которыми управляет конкретный экран. */
export const getSettingsForSurface = (controlSurface) => {
  if (!SUPPORTED_SURFACES.includes(controlSurface)) {
    throw new Error(`[settingsCatalog] неизвестный controlSurface "${controlSurface}"`);
  }
  return getAllSettings().filter((setting) => setting.controlSurface === controlSurface);
};

/** Описание настройки по id. */
export const getSettingById = (id) => getAllSettings().find((setting) => setting.id === id) || null;

/** Дефолтное значение настройки. */
export const getSettingDefault = (id) => getSettingById(id)?.defaultValue ?? null;
