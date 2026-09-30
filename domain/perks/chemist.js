// domain/perks/chemist.js
// ХИМИК — вторая половина (406): созданные/употреблённые препараты
// действуют в два раза дольше (числовая длительность ×2; «lasting» =
// 1 сцена → 2 сцены). Первая половина (гейт рецептов) работала с 251.
// Множитель применяется в applyConsumableFull перед созданием эффектов.

export const chemistPerk = {
  id: 'chemist',
  apply() {
    return { chemDurationMultiplier: 2 };
  },
};
