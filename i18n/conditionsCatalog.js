// Каталог состояний персонажа (болезни и т.п.).
// Болезни — не предметы инвентаря: у них нет веса/цены, есть куб d20 на определение
// болезни и длительность в стадиях восстановления (core rulebook, стр. 193).
// Механика наложения/трекинга проектируется отдельно; сейчас — только справочный каталог.
import { getCurrentLocale, normalizeLocale } from './locale';
import { mergeById } from './equipmentCatalog';

import moduleDiseases from '../modules/fallout/data/conditions/diseases.json';
import ruDiseases from '../modules/fallout/i18n/ru-RU/data/conditions/diseases.json';
import enDiseases from '../modules/fallout/i18n/en-EN/data/conditions/diseases.json';

const DISEASES_BY_LOCALE = {
  'ru-RU': ruDiseases,
  'en-EN': enDiseases,
};

/**
 * Возвращает каталог болезней с локализованными именами и описаниями эффектов.
 * Данные (d20Roll, duration) и переводы живут в модуле сеттинга
 * (modules/fallout/data/conditions/diseases.json + i18n модуля).
 * Нет перевода для id — дефект данных (mergeById бросает ошибку).
 */
export const getDiseasesCatalog = (locale = getCurrentLocale()) =>
  mergeById(moduleDiseases, DISEASES_BY_LOCALE[normalizeLocale(locale)]);
