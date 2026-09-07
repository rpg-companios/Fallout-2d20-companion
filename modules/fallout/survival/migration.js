// Миграция поля survival (v22 -> v23) — модуль сеттинга Fallout.
//
// Раньше жила в движке (src/store/migrations.js, патч 198); патчем 207
// переехала в модуль вместе с правилами. В цепочку движка встраивается
// регистрацией: registerStateMigration(migrateSurvivalField, 22) — переход
// v22 -> v23, на то же место, что и раньше. Номер схемы и поведение
// старых сейвов не меняются.

import originsFile from '../data/origins/origins.json';
import { createSurvivalState } from './survival';

// Тип персонажа для инициализации выживания: ориджин в сейве может быть
// «худым» ({id}) или «толстым» (объект с characterType); остальное — каталог.
const ORIGINS_BY_ID = new Map(
  (Array.isArray(originsFile) ? originsFile : []).map((entry) => [entry.id, entry]),
);

const survivalCharacterType = (origin) => {
  if (origin && typeof origin === 'object' && origin.characterType) {
    return origin.characterType;
  }
  const id = typeof origin === 'string' ? origin : origin?.id;
  return (id && ORIGINS_BY_ID.get(id)?.characterType) || 'human';
};

/**
 * v22 -> v23: выживание. Всем сейвам добавляется поле survival:
 * органики получают начальное состояние (все шкалы на максимуме,
 * усталости нет), роботы и киборги — null. Существующее поле не
 * перезаписывается (идемпотентна). Правила — docs/survival-system-design.md.
 */
export const migrateSurvivalField = (state) => {
  if (!state || typeof state !== 'object') return state;
  if (state.survival !== undefined) return state;
  return {
    ...state,
    survival: createSurvivalState(survivalCharacterType(state.origin)),
  };
};
