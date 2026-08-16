import ruPerksData from '../../../modules/fallout/i18n/ru-RU/data/perks/perks.json';
import enPerksData from '../../../modules/fallout/i18n/en-EN/data/perks/perks.json';
import { getCurrentLocale } from '../../../i18n/locale';

const DICTIONARIES = {
  'ru-RU': ruPerksData,
  'en-EN': enPerksData,
};

const byId = (entries = []) => new Map(entries.map((entry) => [entry.id, entry]));
const RU_BY_ID = byId(ruPerksData);
const EN_BY_ID = byId(enPerksData);

const getLocaleMap = () => byId(DICTIONARIES[getCurrentLocale()] || ruPerksData);

export const getPerkDisplay = (perk) => {
  if (!perk) return { name: '', description: '' };
  const id = perk.id;
  const localized = id ? getLocaleMap().get(id) || RU_BY_ID.get(id) || EN_BY_ID.get(id) : null;

  return {
    name: localized?.name || perk.perk_name || perk.name || id || '',
    description: localized?.effect || perk.description || '',
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
