// domain/perks/chemResistant.js
// Ранг 1 — на 1 CD меньше в броске зависимости от препаратов (не ниже 0).
// Ранг 2 — зависимость от препаратов не наступает.

export const chemResistantPerk = {
  id: 'chemResistant',
  apply(ctx) {
    const rank = ctx.state.rank || 1;
    if (rank >= 2) {
      return { chemAddictionImmune: true };
    }
    return { chemAddictionDicePenalty: 1 };
  },
};
