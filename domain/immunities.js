// Generic immunity membership over data declared by a character or its origin/trait.
// This module deliberately does not name any setting-specific damage type.

export const getDeclaredImmunities = (source) => (
  Array.isArray(source?.immunities)
    ? source.immunities
    : Array.isArray(source?.modifiers?.immunities)
      ? source.modifiers.immunities
      : []
);

export const hasDamageImmunity = (character, immunityType) => {
  if (!immunityType) return false;
  return getDeclaredImmunities(character?.origin).includes(immunityType)
    || getDeclaredImmunities(character?.trait).includes(immunityType);
};
