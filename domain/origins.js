// domain/origins.js
// Single source of truth for origins:
//  - characterType (archetype) and derived rules (armor policy, body plan)
//  - i18n name lookup
//  - raw + enriched loaders (the latter for UI: adds image + equipmentKits)
//
// Per docs/schema/01-origins.md (zustand-robot branch):
//  - characterType ∈ {human, mutant, robot, cyborg, ghoul}
//  - Профиль экипировки/использования теперь задаётся fitProfile
//    (см. domain/itemfit.js + domain/itemfitRules.js + модульные данные
//    modules/fallout/data/origins/fitProfiles.json). Прежняя цепочка
//    armorPolicy → getArmorPolicy → canEquip* удалена.
//  - No type-derived immunities (user decision: immunities are explicit lists per origin/trait)
//
import { getOrigins, getOriginI18n } from './registry';
import { getEquipmentCatalog } from '../i18n/equipmentCatalog';
import { getCurrentModuleLocale } from '../i18n/locale';
import { getOriginImage } from '../modules/fallout/originImages';

// ---------------------------------------------------------------------------
// Public constants
// ---------------------------------------------------------------------------

export const CHARACTER_TYPES = Object.freeze({
  HUMAN: 'human',
  MUTANT: 'mutant',
  ROBOT: 'robot',
  CYBORG: 'cyborg',
  GHOUL: 'ghoul',
});

const ORIGIN_DICTIONARIES = { 'ru-RU': getOriginI18n('ru-RU'), 'en-EN': getOriginI18n('en-EN') };

// ---------------------------------------------------------------------------
// Pure archetype logic
// ---------------------------------------------------------------------------

/**
 * Returns the character's archetype. Reads from `origin.characterType`.
 * Falls back to HUMAN when origin/characterType is absent.
 */
export function getCharacterType(character) {
  const type = character?.origin?.characterType;
  return type ?? CHARACTER_TYPES.HUMAN;
}

export const isHumanCharacter  = (character) => getCharacterType(character) === CHARACTER_TYPES.HUMAN;
export const isMutantCharacter = (character) => getCharacterType(character) === CHARACTER_TYPES.MUTANT;
export const isRobotCharacter  = (character) => getCharacterType(character) === CHARACTER_TYPES.ROBOT;
export const isCyborgCharacter = (character) => getCharacterType(character) === CHARACTER_TYPES.CYBORG;
export const isGhoulCharacter  = (character) => getCharacterType(character) === CHARACTER_TYPES.GHOUL;

/**
 * Returns the body plan.
 * - For robot origins: origin.bodyPlan (mandatory in data).
 * - Otherwise: 'humanoid'.
 */
export function getBodyPlan(character) {
  if (isRobotCharacter(character)) {
    return character?.origin?.bodyPlan ?? null;
  }
  return 'humanoid';
}

// ---------------------------------------------------------------------------
// Builtin base weapon (unarmed)
// ---------------------------------------------------------------------------

/**
 * Returns the character's built-in unarmed weapon, determined by archetype.
 * - Non-robots (human, mutant, ghoul, cyborg) always have fists (`unarmed_human`).
 * - Robots have no built-in unarmed weapon here: their melee comes from a
 *   manipulator/limb (`robot_weapon_manipulator`) chosen via the equipment kit,
 *   so nothing is injected automatically.
 *
 * @returns {{ id: string, isBuiltin: true, itemType: 'weapon' } | null}
 */
export function getBuiltinBaseWeapon(character) {
  if (isRobotCharacter(character)) return null;
  // Имя берём из каталога i18n (как у прочего оружия), чтобы кулаки везде
  // отображались как «Кулаки»/«Fists», а не сырым id. origins.js уже имеет
  // доступ к catalog/locale (см. заголовок файла).
  const base = (getEquipmentCatalog(getCurrentModuleLocale())?.weapons || [])
    .find((w) => w.id === 'unarmed_human');
  if (!base?.name) {
    throw new Error('[origins] Для встроенного оружия "unarmed_human" нет перевода');
  }
  return {
    id: 'unarmed_human',
    isBuiltin: true,
    itemType: 'weapon',
    name: base.name,
  };
}

// ---------------------------------------------------------------------------
// i18n
// ---------------------------------------------------------------------------

/**
 * Returns the localized display name for an origin by its id.
 */
export function tOrigin(id) {
  if (!id) return '';
  const locale = getCurrentModuleLocale();
  const dict = ORIGIN_DICTIONARIES[locale];
  if (!dict) {
    throw new Error(`[origins] Для языка сеттинга "${locale}" нет словаря ориджинов`);
  }
  const translated = dict[id];
  if (typeof translated !== 'string' || translated.length === 0) {
    throw new Error(`[origins] Для ориджина "${id}" нет перевода`);
  }
  return translated;
}

// ---------------------------------------------------------------------------
// Loaders (raw + enriched)
// ---------------------------------------------------------------------------

/**
 * Returns the raw origins array from data/origins/origins.json.
 * Synchronous; JSON is bundled at build time.
 */
export function loadOriginsData() {
  return getOrigins();
}

/**
 * Enriched origins for UI: id + name + image + characterType + traitIds +
 * equipmentKitIds + resolved equipmentKits (from equipmentCatalog).
 */
/**
 * Комплекты, помеченные в данных как `universal: true`, доступны КАЖДОМУ
 * ориджину — существующему и будущему. Ориджин их не перечисляет: иначе при
 * добавлении нового мира/ориджина о них пришлось бы вспоминать вручную, а
 * забытая строка выглядела бы как «у этого ориджина такого комплекта нет».
 *
 * Признак живёт в данных сеттинга, движок только читает флаг.
 */
function getUniversalKitIds(kitGroups) {
  return Object.keys(kitGroups).filter((kitId) => kitGroups[kitId]?.universal === true);
}

export function loadEnrichedOrigins() {
  const { equipmentKits: kitGroups } = getEquipmentCatalog();
  const universalKitIds = getUniversalKitIds(kitGroups);
  return getOrigins().map((origin) => {
    const ownKitIds = origin.equipmentKitIds || [];
    // Универсальные добавляем в конец и не дублируем, если ориджин уже
    // перечислил такой комплект явно.
    const kitIds = [...ownKitIds, ...universalKitIds.filter((id) => !ownKitIds.includes(id))];
    const equipmentKits = kitIds.map((kitId) => {
      const kit = kitGroups[kitId];
      if (!kit || !Array.isArray(kit.items)) {
        throw new Error(`[origins] Для комплекта "${kitId}" ориджина "${origin.id}" нет локализованных данных`);
      }
      return { id: kitId, ...kit };
    });
    return {
      id: origin.id,
      characterType: origin.characterType,
      name: tOrigin(origin.id),
      image: getOriginImage(origin.id),
      traitIds: origin.traitIds || [],
      equipmentKitIds: kitIds,
      equipmentKits,
      bodyPlan: origin.bodyPlan ?? null,
    };
  });
}

/**
 * Returns the enriched origin object for a given id, or null if not found.
 */
export function findEnrichedOrigin(originId) {
  if (!originId) return null;
  return loadEnrichedOrigins().find((o) => o.id === originId) || null;
}
