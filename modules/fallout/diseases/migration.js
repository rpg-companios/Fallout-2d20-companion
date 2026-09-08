// Болезни — модуль сеттинга Fallout (патч 215).
//
// Регистрирует сеттинговую миграцию v24 -> v25: старые сейвы не несут ранг
// на эффекте болезни (поле rank) — миграция проставляет его из каталога
// (duration в conditions/diseases.json). Вставка на индекс 24 (переход
// v24 -> v25) идёт рядом с движковой identity-миграцией той же версии;
// старые сейвы совместимы: болезнь без ранга лечилась как ранг 1.
//
// Импорт этого модуля — side-effect регистрации (App.js импортирует его
// до монтирования CharacterProvider, рядом с modules/fallout/survival).

import diseasesFile from '../data/conditions/diseases.json';
import { registerStateMigration } from '../../../src/store/stateExtensions';

const DISEASE_RANK_BY_ID = new Map(
  (Array.isArray(diseasesFile) ? diseasesFile : []).map((entry) => [entry.id, entry.duration]),
);

/**
 * v24 -> v25: эффектам болезней в activeTimedEffects без поля rank
 * проставляется ранг из каталога. Идемпотентна: эффекты с rank не
 * переписываются, не-болезни и не-массивы проходят без изменений.
 */
export const migrateDiseaseRanks = (state) => {
  if (!state || typeof state !== 'object') return state;
  if (!Array.isArray(state.activeTimedEffects)) return state;
  const effects = state.activeTimedEffects.map((effect) => {
    if (!effect || effect.effectType !== 'disease') return effect;
    if (Number.isInteger(effect.rank) && effect.rank >= 1) return effect;
    const duration = DISEASE_RANK_BY_ID.get(effect.conditionId);
    if (!Number.isInteger(duration) || duration < 1) return effect; // неизвестная болезнь — не додумываем
    return { ...effect, rank: duration };
  });
  return { ...state, activeTimedEffects: effects };
};

// Переход v24 -> v25: место в цепочке — как в патче 212 (MIGRATIONS[24]).
registerStateMigration(migrateDiseaseRanks, 24);
