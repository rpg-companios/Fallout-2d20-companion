// domain/perks/oldWorldGourmet.js
// Гурман старого мира (референс владельца, 403; автоматизация 404):
// упакованная/консервированная (preserved) еда — +2 ОЗ к лечению и −1
// к её радиации (до минимума 0). Механика живёт в resolveConsumableVitalChanges
// (domain/effects.js): перк кладёт параметры, конвейер употребления применяет.

export const OLD_WORLD_GOURMET_HP_BONUS = 2;
export const OLD_WORLD_GOURMET_RADIATION_REDUCTION = 1;

export const oldWorldGourmetPerk = {
  id: 'oldWorldGourmet',
  apply() {
    return {
      oldWorldGourmet: {
        hpBonus: OLD_WORLD_GOURMET_HP_BONUS,
        radiationReduction: OLD_WORLD_GOURMET_RADIATION_REDUCTION,
      },
    };
  },
};
