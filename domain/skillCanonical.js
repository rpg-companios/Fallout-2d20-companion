// Canonicalize legacy skill display names when loading saved characters.
// The active setting owns the localized names; the engine only translates them
// to its stable skill keys.
import { getAllSkillKeys } from './characterCreation';
import { getActiveSettingRuntime } from '../src/engine/settings/activeSettingRuntime';
import { getSettingScreenI18n } from './registry';

const getSkillNameToKey = () => {
  const runtime = getActiveSettingRuntime();
  const locales = runtime?.manifest?.locales ?? Object.keys(runtime?.setting?.names ?? {});
  return Object.fromEntries(locales.flatMap((locale) => {
    const skillNames = getSettingScreenI18n('character', locale)?.skillsCatalog ?? {};
    return Object.entries(skillNames).map(([key, name]) => [name, key]);
  }));
};

/**
 * Canonicalize names in a loaded legacy save.
 * @param {*} rawSkills — array [{name, value}] from a save, or a non-array.
 * @returns {Array|null} — canonicalized array; null for non-arrays.
 */
export const migrateSkillsToCanonical = (rawSkills) => {
  if (!Array.isArray(rawSkills)) return null;
  const skillNameToKey = getSkillNameToKey();
  return rawSkills.map((skill) => {
    if (!skill || typeof skill.name !== 'string') return skill;
    if (getAllSkillKeys().includes(skill.name)) return skill;
    const canonical = skillNameToKey[skill.name];
    return canonical ? { ...skill, name: canonical } : skill;
  });
};
