// domain/settingsCatalog.js
// Каталог настроек: движковые + сеттинг (modules/<id>/settings.json).
//
// Модель (решения владельца, 2026-08-15):
//   - настройки МЕХАНИК сеттинга описываются в settings.json модуля
//     (данные, без логики): прочность оружия, случайное качество,
//     показ рукопашной атаки, язык интерфейса;
//   - движковые UI-настройки (каталоги персонажей, вид карточек оружия)
//     описаны встроенным списком ENGINE_SETTINGS — у движка они есть,
//     остальные настройки движок не знает;
//   - значения хранятся по модулям: { [moduleId]: { [settingId]: value } }.
//
// Формат записи settings.json (массив):
//   {
//     "id": "weaponDurabilityLossEnabled",
//     "type": "boolean" | "number" | "select",
//     "sectionKey": "survivalMode",           // ключ заголовка секции (i18n модуля)
//     "labelKey": "settings.durabilityTitle", // i18n-ключи текстов
//     "descriptionKey": "settings.durabilityDescription",
//     "defaultValue": false,
//     "min": 1, "max": 100,                   // для number
//     "options": [ { "value": "ru-RU", "labelKey": "settings.lang.ru" } ], // для select
//     "dependsOn": "weaponDurabilityLossEnabled"  // показывать только если включено
//   }

import moduleSettings from '../modules/fallout/settings.json';

/** Движковые настройки (UI-фичи, общие для любых сеттингов). */
export const ENGINE_SETTINGS = [
  {
    id: 'characterFoldersEnabled',
    type: 'boolean',
    sectionKey: 'appearance',
    labelKey: 'settings.foldersTitle',
    descriptionKey: 'settings.foldersDescription',
    defaultValue: false,
  },
  {
    id: 'weaponCardsDisplayMode',
    type: 'select',
    sectionKey: 'appearance',
    labelKey: 'settings.cardsTitle',
    descriptionKey: 'settings.cardsDescription',
    defaultValue: 'cards',
    options: [
      { value: 'cards', labelKey: 'settings.cards.cards' },
      { value: 'spoilers', labelKey: 'settings.cards.spoilers' },
      { value: 'tabs', labelKey: 'settings.cards.tabs' },
    ],
  },
];

const SUPPORTED_TYPES = ['boolean', 'number', 'select'];

const validateSettings = (settings, moduleId) => {
  if (!Array.isArray(settings)) {
    throw new Error(`[settingsCatalog] ${moduleId}/settings.json: ожидался массив`);
  }
  const seen = new Set();
  for (const s of settings) {
    if (!s?.id || typeof s.id !== 'string') {
      throw new Error(`[settingsCatalog] ${moduleId}: запись без id`);
    }
    if (seen.has(s.id)) {
      throw new Error(`[settingsCatalog] ${moduleId}: дубликат id "${s.id}"`);
    }
    seen.add(s.id);
    if (!SUPPORTED_TYPES.includes(s.type)) {
      throw new Error(`[settingsCatalog] ${moduleId}: "${s.id}" — неизвестный type "${s.type}"`);
    }
    if (s.type === 'select' && !Array.isArray(s.options)) {
      throw new Error(`[settingsCatalog] ${moduleId}: "${s.id}" (select) без options`);
    }
    if (s.dependsOn && !settings.some((x) => x.id === s.dependsOn)) {
      throw new Error(`[settingsCatalog] ${moduleId}: "${s.id}" dependsOn неизвестной "${s.dependsOn}"`);
    }
  }
  return settings;
};

/** Настройки сеттинга (после валидации). */
export const getModuleSettings = (moduleId = 'fallout') =>
  validateSettings(moduleSettings, moduleId);

/** Все настройки: движковые + сеттинга. */
export const getAllSettings = () => [...ENGINE_SETTINGS, ...getModuleSettings()];

/** Описание настройки по id. */
export const getSettingById = (id) => getAllSettings().find((s) => s.id === id) || null;

/** Дефолтное значение настройки. */
export const getSettingDefault = (id) => getSettingById(id)?.defaultValue ?? null;
