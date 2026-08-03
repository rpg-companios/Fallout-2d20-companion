// domain/perks/strongBack.js
// +25 фунтов переносимого веса за каждый ранг (максимум 3 ранга).

export const strongBackPerk = {
  id: 'strongBack',
  apply(ctx) {
    const rank = ctx.state.rank || 1;
    return { carryWeightBonus: 25 * rank };
  },
};
