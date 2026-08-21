// domain/perks/leadBelly.js
// Облучённая еда и напитки (item.irradiated):
//   ранг 1 — если бросок радиации дал урон > 0, UI предлагает перебросить 1 CD;
//   ранг 2 — броска радиации нет, болезнь (sceneRisk) не трогаем.

export const leadBellyPerk = {
  id: 'leadBelly',
  apply(ctx) {
    const rank = ctx.state.rank || 1;
    if (rank >= 2) {
      return { irradiatedConsumableRadiationImmune: true };
    }
    return { irradiatedConsumableRadiationRerollIfDamage: 1 };
  },
};
