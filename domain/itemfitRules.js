// domain/itemfitRules.js
// Связка чистой механики (domain/itemfit.js) с данными сеттинга:
//   - профили fitProfile по characterType   — modules/fallout/data/origins/fitProfiles.json
//   - справочник категорий                  — modules/fallout/data/equipment/categories.json
// Читает их через реестр (единственная точка доступа к данным движка).
//
// Публичный API:
//   getFitProfile(character)         -> fitProfile (origin.fitProfile ?? type.fitProfile ?? {})
//   isItemAllowed(item, action, character)   -> boolean
//   classifyItemAccess(item, action, character) -> {status, layer}
//   getItemConflict(item, action, character) -> layer|null
//   canConsumeOnSelf(item, character)        -> boolean
//   canConsumeOnOther(item, character)       -> boolean

import { getFitProfileData, getCategories } from './registry';
import {
  ACTIONS,
  classifyItemAccess as classifyPure,
  getBranch,
} from './itemfit';

/**
 * Профиль для персонажа:
 *   origin.fitProfile (полный override) ?? fitProfile по characterType ?? {}
 */
export function getFitProfile(character) {
  const origin = character?.origin || {};
  if (origin.fitProfile) return origin.fitProfile;
  const type = origin.characterType || 'human';
  return getFitProfileData()[type] ?? {};
}

/** Полный доступ (слой + статус). */
export function classifyItemAccess(item, action = ACTIONS.EQUIP, character) {
  return classifyPure(item, action, getFitProfile(character), getCategories());
}

/** Бул: разрешено ли действие над предметом. */
export function isItemAllowed(item, action = ACTIONS.EQUIP, character) {
  return classifyItemAccess(item, action, character).status === 'allowed';
}

/** Слой конфликта, либо null, если конфликта нет. Для алерта. */
export function getItemConflict(item, action = ACTIONS.EQUIP, character) {
  const result = classifyItemAccess(item, action, character);
  return result.status === 'conflict' ? result.layer : null;
}

export function canConsumeOnSelf(item, character) {
  return isItemAllowed(item, ACTIONS.CONSUME_SELF, character);
}

export function canConsumeOnOther(item, character) {
  return isItemAllowed(item, ACTIONS.CONSUME_OTHER, character);
}

// Re-export вспомогательного для удобства (если понадобится ветка напрямую).
export { getBranch, ACTIONS };
