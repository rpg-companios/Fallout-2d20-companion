// domain/perks/powerUser.js
// МОЩНЫЙ ПОЛЬЗОВАТЕЛЬ (канон, приоритет книги 410): энергоядра содержат
// больше зарядов — по рангам перка: +3 / +6 / +10.
// Складывается с «Физиком-ядерщиком» (+3) через mergePerkBonuses.

export const powerUserChargesByRank = (rank) => {
  const r = Math.max(1, Number(rank) || 1);
  return [3, 6, 10][Math.min(r, 3) - 1];
};

export const powerUserPerk = {
  id: 'powerUser',
  apply(ctx) {
    return { fusionCoreChargeBonus: powerUserChargesByRank(ctx.state.rank || 1) };
  },
};
