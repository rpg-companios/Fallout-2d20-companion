import ruPerksData from '../../i18n/ru-RU/data/perks/perks.json';
import enPerksData from '../../i18n/en-EN/data/perks/perks.json';
import { getCurrentModuleLocale } from '../../../../i18n/locale';

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

const getRankEffects = (localized) => {
  if (localized.rankEffects == null) return null;
  if (!Array.isArray(localized.rankEffects) || localized.rankEffects.length === 0) {
    throw new Error(`[perksDisplay] У перка "${localized.id}" rankEffects должен быть непустым массивом`);
  }
  return localized.rankEffects;
};

const requireRankText = (localized, rank) => {
  const rankEffects = getRankEffects(localized);
  if (!rankEffects) return localized.effect;
  const requested = Number(rank);
  if (!Number.isFinite(requested) || requested < 1) {
    throw new Error(`[perksDisplay] Для перка "${localized.id}" нужен номер ранга`);
  }
  const text = rankEffects[requested - 1];
  if (typeof text !== 'string' || text.length === 0) {
    throw new Error(`[perksDisplay] У перка "${localized.id}" нет текста ранга ${requested}`);
  }
  return text;
};

const requireTakenRankTexts = (localized, rank) => {
  const rankEffects = getRankEffects(localized);
  if (!rankEffects) return localized.effect;
  const requested = Number(rank);
  if (!Number.isFinite(requested) || requested < 1) {
    throw new Error(`[perksDisplay] Для перка "${localized.id}" нужен номер ранга`);
  }
  const taken = [];
  for (let index = 1; index <= requested; index += 1) {
    taken.push(requireRankText(localized, index));
  }
  return taken.join('\n\n');
};

const requireRemainingRankTexts = (localized, taken) => {
  const rankEffects = getRankEffects(localized);
  if (!rankEffects) return localized.effect;
  const start = Number(taken);
  if (!Number.isFinite(start) || start < 0) {
    throw new Error(`[perksDisplay] Для перка "${localized.id}" нужно число взятых рангов`);
  }
  if (start >= rankEffects.length) {
    throw new Error(`[perksDisplay] У перка "${localized.id}" нет оставшихся рангов`);
  }
  const remaining = [];
  for (let rank = start + 1; rank <= rankEffects.length; rank += 1) {
    remaining.push(requireRankText(localized, rank));
  }
  return remaining.join('\n\n');
};

export const getPerkDisplay = (perk, { rank } = {}) => {
  if (!perk) return { name: '', description: '' };
  if (!perk.id) throw new Error('[perksDisplay] Перк без id');
  const localized = getLocaleMap().get(perk.id);
  if (!localized) {
    throw new Error(`[perksDisplay] Для перка "${perk.id}" нет перевода`);
  }

  return {
    name: localized.name,
    description: rank == null ? localized.effect : requireRankText(localized, rank),
  };
};

export const getPerkModalDisplay = (perk, { taken = 0 } = {}) => {
  if (!perk) return { name: '', description: '' };
  if (!perk.id) throw new Error('[perksDisplay] Перк без id');
  const localized = getLocaleMap().get(perk.id);
  if (!localized) {
    throw new Error(`[perksDisplay] Для перка "${perk.id}" нет перевода`);
  }

  return {
    name: localized.name,
    description: requireRemainingRankTexts(localized, taken),
  };
};

export const getPerkSheetDisplay = (perk) => {
  const id = perk?.id || perk?.perkId;
  if (id) {
    const localized = getLocaleMap().get(id);
    if (localized?.name) {
      return {
        name: localized.name,
        description: requireTakenRankTexts(localized, perk?.rank ?? 1),
      };
    }
  }
  return {
    name: perk?.perk_name || perk?.name || perk?.nameKey || id || '',
    description: perk?.description || '',
  };
};
