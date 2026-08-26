// domain/perks/pharmaFarmer.js
// Добыча препарата: +1 случайный препарат из всего каталога.
// Введённое количество того же препарата не увеличивается.

export const pharmaFarmerPerk = {
  id: 'pharmaFarmer',
  apply() {
    return {
      foundItemBonuses: [{
        perkId: 'pharmaFarmer',
        itemType: 'chem',
        extra: 1,
        extraRandom: true,
      }],
    };
  },
};
