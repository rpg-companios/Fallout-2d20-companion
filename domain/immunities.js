// domain/immunities.js
// Pure helpers for immunity checks.
//
// Immunities are an explicit list per character. No type-derived base.
// Sources checked (in order):
//   - character.origin.immunities (optional; if present, list)
//   - character.trait.immunities (optional; if present, list)
// Future: equipment / consumables / perks (out of scope here).

import { isRobotCharacter } from './origins';

/**
 * Returns the list of immunities granted by a trait.
 * @returns {string[]} e.g. ['radiation', 'poison']
 */
export const getTraitImmunities = (trait) => (
  Array.isArray(trait?.modifiers?.immunities) ? trait.modifiers.immunities : []
);

/**
 * Returns the list of immunities declared on an origin (if any).
 */
export const getOriginImmunities = (origin) => (
  Array.isArray(origin?.immunities) ? origin.immunities : []
);

export const hasDamageImmunity = (character, immunityType) => {
  if (!immunityType) return false;
  if (getOriginImmunities(character?.origin).includes(immunityType)) return true;
  if (getTraitImmunities(character?.trait).includes(immunityType)) return true;
  return false;
};

export const hasRadiationImmunity = (character) => hasDamageImmunity(character, 'radiation');

export const hasPoisonImmunity = (character) => hasDamageImmunity(character, 'poison');
