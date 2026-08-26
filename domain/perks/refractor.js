// domain/perks/refractor.js
// +1 энергетическое СУ во всех частях тела за каждый ранг (максимум 2 ранга).

export const refractorPerk = {
  id: 'refractor',
  apply(ctx) {
    const rank = ctx.state.rank || 1;
    return { damageResistance: { energy: rank } };
  },
};
