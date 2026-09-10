// Перки — модуль сеттинга Fallout (патч 220).
//
// Регистрирует сеттинговую миграцию v25 -> v26: починка завышенных баз
// атрибутов из старых сейвов. Дефект патча 219 (до починки) задваивал
// прибавку очков перков: два ранга «Интенсивных тренировок» давали +1 и +2,
// и атрибут уезжал выше потолка (ловкость 11 при лимите 10).
//
// Миграция клампит базу атрибута к потолку черты из ДАННЫХ (лимиты черт
// traits.json — единый источник, та же логика, что в domain/characterCreation
// getAttributeLimits), не трогая значения в пределах лимитов. Идемпотентна:
// повторный прогон ничего не меняет, атрибуты без превышения проходят как
// есть. Неизвестная черта в сейве — ничего не додумываем, состояние
// сохраняется без изменений.
//
// Импорт этого модуля — side-effect регистрации (App.js импортирует его
// до монтирования CharacterProvider, рядом с modules/fallout/diseases/migration).

import traitsFile from '../data/traits/traits.json';
import { registerStateMigration } from '../../../src/store/stateExtensions';

const DEFAULT_ATTRIBUTE_MAX = 10;

const TRAITS = Array.isArray(traitsFile) ? traitsFile : [];

const byId = new Map(TRAITS.map((trait) => [trait.id, trait]));

// Потолок атрибута для черты: явный per-attribute лимит (modifiers.attributes)
// сильнее словаря maxLimits; без явных лимитов — общий потолок 10.
const attributeMaxForTrait = (trait, attributeCode) => {
  const modifiers = trait?.modifiers || {};
  const attrEntry = modifiers.attributes?.[attributeCode];
  if (attrEntry && Number.isFinite(attrEntry.max)) return attrEntry.max;
  const maxLimit = modifiers.maxLimits?.[attributeCode];
  if (Number.isFinite(maxLimit)) return maxLimit;
  return DEFAULT_ATTRIBUTE_MAX;
};

/**
 * v25 -> v26: базы атрибутов выше потолка черты клампятся к потолку.
 * Идемпотентна; изменяет только value у превысивших атрибутов.
 */
export const migrateAttributeCaps = (state) => {
  if (!state || typeof state !== 'object') return state;
  if (!Array.isArray(state.attributes)) return state;

  const trait = state.trait;
  const primaryId = typeof trait === 'string' ? trait : trait?.id ?? trait?.ids?.[0];
  const traitRecord = primaryId ? byId.get(primaryId) : null;
  if (!traitRecord) return state; // черту не знаем — лимиты неизвестны, не трогаем

  let changed = false;
  const attributes = state.attributes.map((attr) => {
    if (!attr || typeof attr !== 'object') return attr;
    if (typeof attr.name !== 'string' || !attr.name) return attr;
    if (!Number.isFinite(attr.value)) return attr;
    const max = attributeMaxForTrait(traitRecord, attr.name);
    if (attr.value <= max) return attr;
    changed = true;
    return { ...attr, value: max };
  });
  return changed ? { ...state, attributes } : state;
};

// Переход v25 -> v26: место в цепочке — как в патче 215 (MIGRATIONS[25]).
registerStateMigration(migrateAttributeCaps, 25);
