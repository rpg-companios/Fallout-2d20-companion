// @deprecated: logic moved to domain/traits.js
// Compatibility layer for legacy imports.

import {
  loadTraitsData,
  loadOriginsData,
  findTraitByName,
  findTraitById,
  getTraitModifiers,
  getTraitAttributeLimits,
  getTraitImmunities,
  getTraitSkillMaxValue,
  getTraitExtraSkills,
  getTraitDescriptionKey,
  getTraitNameKey,
  getTraitDisplayDescription,
} from '../../../../domain/traits';

export {
  loadTraitsData,
  loadOriginsData,
  findTraitByName,
  findTraitById,
  getTraitModifiers,
  getTraitAttributeLimits,
  getTraitImmunities,
  getTraitSkillMaxValue,
  getTraitExtraSkills,
  getTraitDescriptionKey,
  getTraitNameKey,
  getTraitDisplayDescription,
};

// Legacy map shape expected by multiple UI components:
// TRAITS[traitName] -> { description, descriptionKey, displayNameKey, modifiers, ... }
export const TRAITS = loadTraitsData().reduce((acc, trait) => {
  if (!trait?.cyrillicName) return acc;
  acc[trait.cyrillicName] = {
    id: trait.id,
    originId: trait.originId,
    description: trait.descriptionKey,
    descriptionKey: trait.descriptionKey,
    displayNameKey: trait.displayNameKey,
    modifiers: trait.modifiers || {},
  };
  return acc;
}, {});
