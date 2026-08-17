import ruPerksData from '../../../modules/fallout/i18n/ru-RU/data/perks/perks.json';
import enPerksData from '../../../modules/fallout/i18n/en-EN/data/perks/perks.json';
import { getCurrentModuleLocale } from '../../../i18n/locale';

const DICTIONARIES = {
  'ru-RU': ruPerksData,
  'en-EN': enPerksData,
};

const byId = (entries = []) => new Map(entries.map((entry) => [entry.id, entry]));
const PERKS_BY_LOCALE = Object.fromEntries(
  Object.entries(DICTIONARIES).map(([locale, entries]) => [locale, byId(entries)]),
);

const getLocaleMap = () => {
  const locale = getCurrentModuleLocale();
  const localizedPerks = PERKS_BY_LOCALE[locale];
  if (!localizedPerks) {
    throw new Error(`[perksDisplay] Для языка сеттинга "${locale}" нет каталога перков`);
  }
  return localizedPerks;
};

export const getPerkDisplay = (perk) => {
  if (!perk) return { name: '', description: '' };
  if (!perk.id) throw new Error('[perksDisplay] Перк без id');
  const localized = getLocaleMap().get(perk.id);
  if (!localized) {
    throw new Error(`[perksDisplay] Для перка "${perk.id}" нет перевода`);
  }

  return {
    name: localized.name,
    description: localized.effect,
  };
};

export const withPerkDisplay = (perk) => {
  const display = getPerkDisplay(perk);
  return {
    ...perk,
    perk_name: display.name,
    description: display.description,
  };
};
