// domain/origins.js
// Single source of truth for origins:
//  - characterType (archetype) and derived rules (armor policy, body plan)
//  - i18n name lookup
//  - raw + enriched loaders (the latter for UI: adds image + equipmentKits)
//
// Per docs/schema/01-origins.md (zustand-robot branch):
//  - characterType ∈ {human, mutant, robot, cyborg, ghoul}
//  - armorPolicy defaults from characterType; origin.armorPolicy overrides only when different
//  - No type-derived immunities (user decision: immunities are explicit lists per origin/trait)
//
// Image assets stay snake_case (filenames), colocated here because require() cannot live in JSON.

import originsJson from '../data/origins/origins.json';
import ruOrigins from '../i18n/ru-RU/data/system/origins.json';
import enOrigins from '../i18n/en-EN/data/system/origins.json';
import { getEquipmentCatalog } from '../i18n/equipmentCatalog';
import { getCurrentLocale } from '../i18n/locale';

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

export const ARMOR_POLICIES = Object.freeze({
  STANDARD: 'standard',
  RAIDER_ONLY: 'raiderOnly',
  ROBOT_ONLY: 'robotOnly',
});

// Per-characterType default armor policy.
// Origin can override via origin.armorPolicy (rare; shadow doesn't anymore).
const DEFAULT_ARMOR_POLICY_BY_CHARACTER_TYPE = Object.freeze({
  [CHARACTER_TYPES.HUMAN]:  ARMOR_POLICIES.STANDARD,
  [CHARACTER_TYPES.MUTANT]: ARMOR_POLICIES.RAIDER_ONLY,
  [CHARACTER_TYPES.ROBOT]:  ARMOR_POLICIES.ROBOT_ONLY,
  [CHARACTER_TYPES.GHOUL]:  ARMOR_POLICIES.STANDARD,
  [CHARACTER_TYPES.CYBORG]: ARMOR_POLICIES.STANDARD,
});

const ORIGIN_DICTIONARIES = { 'ru-RU': ruOrigins, 'en-EN': enOrigins };

// ---------------------------------------------------------------------------
// Image assets (colocated with data, as require() cannot live in JSON)
// ---------------------------------------------------------------------------

const getOriginImage = (originId) => {
  switch (originId) {
    case 'brotherhood':         return require('../assets/origins/brotherhood_of_steel.png');
    case 'ncr':                 return require('../assets/origins/ncr_citizen.png');
    case 'minuteman':           return require('../assets/origins/minuteman.png');
    case 'childOfAtom':         return require('../assets/origins/child_of_atom.png');
    case 'vaultDweller':        return require('../assets/origins/vault_dweller.png');
    case 'protectron':          return require('../assets/origins/protectron.png');
    case 'survivor':            return require('../assets/origins/survivor.png');
    case 'securitron':          return require('../assets/origins/securitron.png');
    case 'ghoul':               return require('../assets/origins/ghoul.png');
    case 'assaultron':          return require('../assets/origins/assaultron.png');
    case 'superMutant':         return require('../assets/origins/super_mutant.png');
    case 'misterHandy':         return require('../assets/origins/mister_handy.png');
    case 'brotherhoodOutcast':  return require('../assets/origins/brotherhood_outcast.png');
    case 'shadow':              return require('../assets/origins/shadow.png');
    case 'synth':               return require('../assets/origins/synth.png');
    case 'robobrain':           return require('../assets/origins/robobrain.png');
    case 'savage':              return require('../assets/origins/savage.png');
    default:                    return null;
  }
};

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
 * Returns armor policy for a character.
 * Priority: origin.armorPolicy (if present) → characterType default.
 */
export function getArmorPolicy(character) {
  const override = character?.origin?.armorPolicy;
  if (override) return override;
  return DEFAULT_ARMOR_POLICY_BY_CHARACTER_TYPE[getCharacterType(character)]
    ?? ARMOR_POLICIES.STANDARD;
}

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
// i18n
// ---------------------------------------------------------------------------

/**
 * Returns the localized display name for an origin by its id.
 */
export function tOrigin(id) {
  if (!id) return '';
  const locale = getCurrentLocale();
  const dict = ORIGIN_DICTIONARIES[locale] || ruOrigins;
  return dict[id] || id;
}

// ---------------------------------------------------------------------------
// Loaders (raw + enriched)
// ---------------------------------------------------------------------------

/**
 * Returns the raw origins array from data/origins/origins.json.
 * Synchronous; JSON is bundled at build time.
 */
export function loadOriginsData() {
  return originsJson;
}

/**
 * Enriched origins for UI: id + name + image + characterType + traitIds +
 * equipmentKitIds + resolved equipmentKits (from equipmentCatalog).
 */
export function loadEnrichedOrigins() {
  const { equipmentKits: kitGroups } = getEquipmentCatalog();
  return originsJson.map((origin) => {
    const kitIds = origin.equipmentKitIds || [];
    const equipmentKits = kitIds
      .map((kitId) => ({ id: kitId, ...(kitGroups[kitId] || {}) }))
      .filter((kit) => Array.isArray(kit.items));
    return {
      id: origin.id,
      characterType: origin.characterType,
      name: tOrigin(origin.id),
      image: getOriginImage(origin.id),
      traitIds: origin.traitIds || [],
      equipmentKitIds: origin.equipmentKitIds || [],
      equipmentKits,
      bodyPlan: origin.bodyPlan ?? null,
      armorPolicy: origin.armorPolicy ?? null,
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
