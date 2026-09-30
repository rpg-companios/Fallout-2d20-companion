// domain/perks/pharmacist.js
// ФАРМАЦЕВТ (канон, приоритет книги 410): Антирадин, применённый вами,
// снимает больше радиации — по рангам перка: +2 / +3 / +4.
// Складывается с «Полевым хирургом» (+1) через mergePerkBonuses.

export const pharmacistAntiradBonusByRank = (rank) => {
  const r = Math.max(1, Number(rank) || 1);
  return [2, 3, 4][Math.min(r, 3) - 1];
};

export const pharmacistPerk = {
  id: 'pharmacist',
  apply(ctx) {
    return { antiradRadiationBonus: pharmacistAntiradBonusByRank(ctx.state.rank || 1) };
  },
};
