// domain/perks/educated.js
// «Тренированный»: +1 ранг к двум навыкам или +2 ранга к одному (макс 6).
// Перк ранговый (maxRanks 10): каждый ранг даёт свои +2 очка навыков, поэтому
// бонус считается по рангу. Очки складываются с пулом уровня и тратятся
// обычным распределением навыков (потолок ранга остаётся общим).

export const EDUCATED_SKILL_POINTS_PER_RANK = 2;

export const educatedPerk = {
  id: 'educated',
  // Ранг действующего выбора приходит в ctx.state.rank (см. calculatePerkEffects).
  apply(ctx = {}) {
    const rank = ctx?.state?.rank ?? ctx?.rank;
    const ranks = Math.max(1, Number(rank) || 1);
    return { skillPoints: EDUCATED_SKILL_POINTS_PER_RANK * ranks };
  },
};
