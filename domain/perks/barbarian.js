// domain/perks/barbarian.js
// Физическое СУ по полосе СИЛ: СИЛ 7–8 → +1, СИЛ 9–10 → +2, СИЛ 11+ → +3.
// Не действует, если персонаж в силовой броне.

import { buildAttributeValueMap } from '../perks';

export const barbarianPerk = {
  id: 'barbarian',
  apply(ctx) {
    // Силовая броня блокирует перк
    const equipmentState = ctx.state._characterContext?.equipmentState || {};
    const inPowerArmor = Boolean(equipmentState.powerArmorFrameId);
    if (inPowerArmor) return { damageResistance: { physical: 0 } };

    const attrMap = buildAttributeValueMap(ctx.state.attributes || {});
    const str = attrMap['STR'] || 0;

    let bonus = 0;
    if (str >= 11) bonus = 3;
    else if (str >= 9) bonus = 2;
    else if (str >= 7) bonus = 1;

    return { damageResistance: { physical: bonus } };
  },
};
