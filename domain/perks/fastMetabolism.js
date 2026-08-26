// domain/perks/fastMetabolism.js
// +1 ОЗ к каждому мгновенному восстановлению ОЗ за ранг перка (макс 3 ранга).
// Применяется при использовании еды, химии, алкоголя — любого расходника с hpHealed > 0.
// Восстановление через отдых в программе не реализовано — исключение не нужно.

export const fastMetabolismPerk = {
  id: 'fastMetabolism',
  apply(ctx) {
    const rank = ctx.state.rank || 1;
    return { hpHealBonus: rank };
  },
};
