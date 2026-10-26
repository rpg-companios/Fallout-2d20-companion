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

import { AUDIENCE_CHARACTER_TYPES } from '../src/itempack/contract';

/** Полный доступ (слой + статус). */
export function classifyItemAccess(item, action = ACTIONS.EQUIP, character) {
  const result = classifyPure(item, action, getFitProfile(character), getCategories());
  // Аудитория пакетных предметов (прототип P): 'all' пропускаем, иначе
  // characterType персонажа обязан попасть в разрешённую группу
  // ('human' покрывает human/ghoul/cyborg). Точечный патч — единственный
  // заход прототипа в правила движка; остальное — данные.
  if (result.status !== 'allowed') return result;
  const audience = item?.audience;
  if (!audience || audience === 'all') return result;
  const allowed = Array.isArray(audience) ? audience : [audience];
  const type = character?.origin?.characterType || 'human';
  const permitted = allowed.some((a) => (AUDIENCE_CHARACTER_TYPES[a] ?? []).includes(type));
  return permitted ? result : { status: 'denied', layer: 'audience' };
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
