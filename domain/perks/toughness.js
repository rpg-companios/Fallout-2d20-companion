// domain/perks/toughness.js
// +1 физическое СУ во всех частях тела за каждый ранг (максимум 2 ранга).

export const toughnessPerk = {
  id: 'toughness',
  apply(ctx) {
    const rank = ctx.state.rank || 1;
    return { damageResistance: { physical: rank } };
  },
};
