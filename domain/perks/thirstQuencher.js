// domain/perks/thirstQuencher.js
// Грязная вода (drink_dirty_water) не вызывает бросок болезни.

export const DIRTY_WATER_ID = 'drink_dirty_water';

export const thirstQuencherPerk = {
  id: 'thirstQuencher',
  apply() {
    return { dirtyWaterDiseaseImmune: true };
  },
};
