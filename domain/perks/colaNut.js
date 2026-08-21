// domain/perks/colaNut.js
// Лечение ×2 только у этих id. Без разбора названия.

export const COLA_NUT_DRINK_IDS = [
  'drink_nuka_cola',
  'drink_nuka_cherry',
  'drink_nuka_cola_quantum',
];

export const colaNutPerk = {
  id: 'colaNut',
  apply() {
    return {
      colaNutDrinkIds: COLA_NUT_DRINK_IDS,
      colaNutHealMultiplier: 2,
    };
  },
};
