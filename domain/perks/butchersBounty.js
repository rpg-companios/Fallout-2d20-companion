// domain/perks/butchersBounty.js
// Добыча еды с rawMeat: true — к введённому количеству +1.

export const butchersBountyPerk = {
  id: 'butchersBounty',
  apply() {
    return {
      foundItemBonuses: [{
        perkId: 'butchersBounty',
        itemType: 'food',
        extra: 1,
        match: { rawMeat: true },
      }],
    };
  },
};
