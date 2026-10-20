// Engine-side adapter for the active setting's character-creation capability.
// This module contains no attribute names, skill catalogue, defaults, or rules.
// With no active setting, collection accessors are empty and rule accessors
// report no capability rather than silently selecting a setting implementation.

import { getCharacterCreationLogic } from './registry.js';

export const getAllSkills = () => getCharacterCreationLogic()?.ALL_SKILLS ?? [];
export const getAllSkillKeys = () => getCharacterCreationLogic()?.ALL_SKILL_KEYS ?? [];
export const getCanonicalAttributeKeys = () => getCharacterCreationLogic()?.CANONICAL_ATTRIBUTE_KEYS ?? [];

export const createInitialAttributes = (...args) => (
  getCharacterCreationLogic()?.createInitialAttributes?.(...args) ?? []
);

export const getCanonicalAttributeKey = (...args) => (
  getCharacterCreationLogic()?.getCanonicalAttributeKey?.(...args) ?? null
);

export const getAttributeValue = (...args) => (
  getCharacterCreationLogic()?.getAttributeValue?.(...args) ?? null
);

export const getAttributeLimits = (...args) => (
  getCharacterCreationLogic()?.getAttributeLimits?.(...args) ?? null
);

export const getLuckPoints = (...args) => (
  getCharacterCreationLogic()?.getLuckPoints?.(...args) ?? 0
);

export const getEquipmentCarryWeightModifier = (...args) => (
  getCharacterCreationLogic()?.getEquipmentCarryWeightModifier?.(...args) ?? 0
);

export const getCarryWeightLimit = (...args) => (
  getCharacterCreationLogic()?.getCarryWeightLimit?.(...args) ?? null
);
