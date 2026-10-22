import { hasDamageImmunity } from 'engine:domain/immunities';

/** Fallout's origin/trait immunity rules. */
export const getTraitImmunities = (trait) => (
  Array.isArray(trait?.modifiers?.immunities) ? trait.modifiers.immunities : []
);

export const getOriginImmunities = (origin) => (
  Array.isArray(origin?.immunities) ? origin.immunities : []
);

export const hasRadiationImmunity = (character) => hasDamageImmunity(character, 'radiation');
export const hasPoisonImmunity = (character) => hasDamageImmunity(character, 'poison');
