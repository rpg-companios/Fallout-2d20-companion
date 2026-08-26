// domain/perks/radResistant.js
// +1 радиационное СУ во всех частях тела за каждый ранг (максимум 2 ранга).

export const radResistantPerk = {
  id: 'radResistant',
  apply(ctx) {
    const rank = ctx.state.rank || 1;
    return { damageResistance: { radiation: rank } };
  },
};
