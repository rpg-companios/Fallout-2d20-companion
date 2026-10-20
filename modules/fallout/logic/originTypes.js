// Fallout character archetypes and archetype-derived body-plan defaults.
// These values are owned by the Fallout setting, not the generic origin model.

export const CHARACTER_TYPES = Object.freeze({
  HUMAN: 'human',
  MUTANT: 'mutant',
  ROBOT: 'robot',
  CYBORG: 'cyborg',
  GHOUL: 'ghoul',
});

/** Returns the Fallout archetype; legacy missing values default to human. */
export function getCharacterType(character) {
  const type = character?.origin?.characterType;
  return type ?? CHARACTER_TYPES.HUMAN;
}

export const isHumanCharacter = (character) => getCharacterType(character) === CHARACTER_TYPES.HUMAN;
export const isMutantCharacter = (character) => getCharacterType(character) === CHARACTER_TYPES.MUTANT;
export const isRobotCharacter = (character) => getCharacterType(character) === CHARACTER_TYPES.ROBOT;
export const isCyborgCharacter = (character) => getCharacterType(character) === CHARACTER_TYPES.CYBORG;
export const isGhoulCharacter = (character) => getCharacterType(character) === CHARACTER_TYPES.GHOUL;

/** Fallout robots use the body plan declared by their origin; other origins use humanoid. */
export function getBodyPlan(character) {
  if (isRobotCharacter(character)) {
    return character?.origin?.bodyPlan ?? null;
  }
  return 'humanoid';
}
