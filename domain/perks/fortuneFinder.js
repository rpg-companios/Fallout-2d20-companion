// domain/perks/fortuneFinder.js
// Внесение крышек: к введённому количеству добавляется сумма CD.
// Ранг 1 — 3 CD, ранг 2 — 6 CD, ранг 3 — 10 CD.

const COMBAT_DICE_BY_RANK = {
  1: 3,
  2: 6,
  3: 10,
};

export const fortuneFinderPerk = {
  id: 'fortuneFinder',
  apply(ctx) {
    const rank = Math.min(3, Math.max(1, ctx.state.rank || 1));
    return {
      foundItemBonuses: [{
        perkId: 'fortuneFinder',
        itemType: 'caps',
        combatDice: COMBAT_DICE_BY_RANK[rank],
      }],
    };
  },
};
