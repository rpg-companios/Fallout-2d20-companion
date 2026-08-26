// domain/perks/canOpener.js
// Добыча еды, кроме raw: к введённому количеству +1.
// В каталоге не-raw еда имеет state: 'cooked' (включая preserved).

export const canOpenerPerk = {
  id: 'canOpener',
  apply() {
    return {
      foundItemBonuses: [{
        perkId: 'canOpener',
        itemType: 'food',
        extra: 1,
        match: { state: 'cooked' },
      }],
    };
  },
};
