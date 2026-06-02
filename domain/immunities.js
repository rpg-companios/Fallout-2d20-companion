// domain/immunities.js
// Pure helpers for origin/trait immunity checks.

import { isRobotCharacter } from './robotEquip';

const ROBOT_IMMUNITIES = new Set(['disease', 'radiation', 'poison']);

export const getTraitImmunities = (trait) => (
  Array.isArray(trait?.modifiers?.immunities) ? trait.modifiers.immunities : []
);

export const hasDamageImmunity = (character, immunityType) => {
  if (!immunityType) return false;
  if (isRobotCharacter(character) && ROBOT_IMMUNITIES.has(immunityType)) return true;
  return getTraitImmunities(character?.trait).includes(immunityType);
};

export const hasRadiationImmunity = (character) => hasDamageImmunity(character, 'radiation');

export const hasPoisonImmunity = (character) => hasDamageImmunity(character, 'poison');
