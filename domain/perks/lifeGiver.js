// domain/perks/lifeGiver.js
// +ВЫН к максимальным ОЗ за каждый ранг перка.
// Ранг 1–5, за каждый ранг прибавляется значение ВЫН персонажа.

import { buildAttributeValueMap } from '../perks';

export const lifeGiverPerk = {
  id: 'lifeGiver',
  apply(ctx) {
    const rank = ctx.state.rank || 1;
    const attrMap = buildAttributeValueMap(ctx.state.attributes || {});
    const end = attrMap['END'] || 0;
    return { maxHealthBonus: end * rank };
  },
};
