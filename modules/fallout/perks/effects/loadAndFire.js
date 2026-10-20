// Legacy Fallout perk registration consumed by modules/fallout/perks/effects/index.js.
// Inventory presentation is exposed by the active package service instead.

export const loadAndFireBonusByRank = (rank) => {
  const r = Math.max(1, Number(rank) || 1);
  return r >= 2 ? 2 : 1;
};

export const loadAndFirePerk = {
  id: 'loadAndFire',
  apply(ctx) {
    return { loadAndFireBonus: loadAndFireBonusByRank(ctx.state.rank || 1) };
  },
};
