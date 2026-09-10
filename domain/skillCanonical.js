// domain/skillCanonical.js
// Мост канонизации навыков при загрузке сейвов (переехал из CharacterContext,
// Шаг 5 подготовка: loadCharacter будет переписываться — мосту нужен
// тестируемый домен-дом).
//
// Зачем: legacy-сейвы хранят skills с РУССКИМИ отображаемыми именами в поле
// `name` (например «Ремонт»). После канонического рефакторинга идентичность
// навыка — ключ UPPER_SNAKE_CASE (REPAIR). Это НЕ про i18n: интерфейс и раньше
// рисовал названия из каталога переводов, но в сейве имя было
// персистентным идентификатором. Мост запускается только на загрузке;
// новые сейвы уже пишут ключи, для них операция — no-op.

import ruCharacterScreen from '../i18n/ru-RU/screens/character/screen.json';
import ruSettingCharacterScreen from '../modules/fallout/i18n/ru-RU/screens/character/screen.json';
import { ALL_SKILL_KEYS } from './characterCreation';
import { deepMerge } from '../i18n/mergeDicts';

// ВАЖНО: каталог навыков живёт в СЛОЕ СЕТТИНГА (modules/fallout/i18n), а не в
// движковом screen.json. Мост обязан читать СКЛЕННЫЙ словарь (движок + сеттинг,
// как tCharacterScreen): раньше тут читался только движковый, где skillsCatalog
// отсутствует — карта была пуста, мост тихо не работал (поймано фикстурой
// грязного сейва, __tests__/saves/dirty-save-v18.test.js).
const RU_SKILL_NAME_TO_KEY = Object.entries(
  deepMerge(ruCharacterScreen, ruSettingCharacterScreen)?.skillsCatalog || {},
).reduce(
  (acc, [key, ruName]) => { acc[ruName] = key; return acc; },
  {},
);

/**
 * Канонизировать имена навыков в загружаемом сейве.
 * @param {*} rawSkills — массив [{name, value}] из сейва или не-массив.
 * @returns {Array|null} — канонизированный массив; null для не-массива.
 */
export const migrateSkillsToCanonical = (rawSkills) => {
  if (!Array.isArray(rawSkills)) return null;
  return rawSkills.map((s) => {
    if (!s || typeof s.name !== 'string') return s;
    if (ALL_SKILL_KEYS.includes(s.name)) return s;             // already canonical
    const canonical = RU_SKILL_NAME_TO_KEY[s.name];            // legacy Russian
    return canonical ? { ...s, name: canonical } : s;
  });
};
