// Каталог состояний персонажа (болезни и т.п.).
// Болезни — не предметы инвентаря: у них нет веса/цены, есть куб d20 на определение
// болезни и длительность в стадиях восстановления (core rulebook, стр. 193).
// Механика наложения/трекинга проектируется отдельно; сейчас — только справочный каталог.
import { getCurrentLocale, normalizeLocale } from './locale';
import { mergeById } from './equipmentCatalog';

import ruDiseases from './ru-RU/data/conditions/diseases.json';
import enDiseases from './en-EN/data/conditions/diseases.json';
import dataDiseases from '../data/conditions/diseases.json';

const DISEASES_BY_LOCALE = {
  'ru-RU': ruDiseases,
  'en-EN': enDiseases,
};

/**
 * Возвращает каталог болезней с локализованными именами и описаниями эффектов.
 * Ключи механики (d20Roll, duration) берутся из data/, тексты — из i18n текущей локали.
 */
export const getDiseasesCatalog = (locale = getCurrentLocale()) =>
  mergeById(dataDiseases, DISEASES_BY_LOCALE[normalizeLocale(locale)]);
