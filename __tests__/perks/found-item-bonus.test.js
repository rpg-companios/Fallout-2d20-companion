import { afterEach, describe, expect, it, vi } from 'vitest';
import { rollFoundItemBonuses, sumFoundItemBonus } from '../../domain/foundItemBonus';
import { calculatePerkEffects } from '../../domain/perks';
import perksData from '../../modules/fallout/data/perks/perks.json';

afterEach(() => {
  vi.restoreAllMocks();
});

const scrounger = perksData.find((perk) => perk.id === 'scrounger');
const fortuneFinder = perksData.find((perk) => perk.id === 'fortuneFinder');
const canOpener = perksData.find((perk) => perk.id === 'canOpener');
const butchersBounty = perksData.find((perk) => perk.id === 'butchersBounty');

describe('found item perk bonuses', () => {
  it('gives Scrounger extra ammo combat dice by rank', () => {
    const rank1 = calculatePerkEffects([scrounger], [{ id: 'scrounger', rank: 1 }]);
    const rank2 = calculatePerkEffects([scrounger], [{ id: 'scrounger', rank: 2 }]);
    const rank3 = calculatePerkEffects([scrounger], [{ id: 'scrounger', rank: 3 }]);
    expect(rank1.bonuses.foundItemBonuses).toEqual([
      { perkId: 'scrounger', itemType: 'ammo', combatDice: 3 },
    ]);
    expect(rank2.bonuses.foundItemBonuses).toEqual([
      { perkId: 'scrounger', itemType: 'ammo', combatDice: 6 },
    ]);
    expect(rank3.bonuses.foundItemBonuses).toEqual([
      { perkId: 'scrounger', itemType: 'ammo', combatDice: 10 },
    ]);
  });

  it('gives Fortune Finder extra caps combat dice by rank', () => {
    const rank1 = calculatePerkEffects([fortuneFinder], [{ id: 'fortuneFinder', rank: 1 }]);
    const rank2 = calculatePerkEffects([fortuneFinder], [{ id: 'fortuneFinder', rank: 2 }]);
    const rank3 = calculatePerkEffects([fortuneFinder], [{ id: 'fortuneFinder', rank: 3 }]);
    expect(rank1.bonuses.foundItemBonuses).toEqual([
      { perkId: 'fortuneFinder', itemType: 'caps', combatDice: 3 },
    ]);
    expect(rank2.bonuses.foundItemBonuses).toEqual([
      { perkId: 'fortuneFinder', itemType: 'caps', combatDice: 6 },
    ]);
    expect(rank3.bonuses.foundItemBonuses).toEqual([
      { perkId: 'fortuneFinder', itemType: 'caps', combatDice: 10 },
    ]);
  });

  it('gives Can Opener +1 cooked food', () => {
    const result = calculatePerkEffects([canOpener], [{ id: 'canOpener', rank: 1 }]);
    expect(result.bonuses.foundItemBonuses).toEqual([
      { perkId: 'canOpener', itemType: 'food', extra: 1, match: { state: 'cooked' } },
    ]);
  });

  it('gives Butcher\'s Bounty +1 raw meat', () => {
    const result = calculatePerkEffects([butchersBounty], [{ id: 'butchersBounty', rank: 1 }]);
    expect(result.bonuses.foundItemBonuses).toEqual([
      { perkId: 'butchersBounty', itemType: 'food', extra: 1, match: { rawMeat: true } },
    ]);
  });
});

describe('rollFoundItemBonuses', () => {
  it('adds the sum of matching combat dice and ignores other item types', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.2) // 2
      .mockReturnValueOnce(0.2) // 2
      .mockReturnValueOnce(0.2); // 2

    const bonuses = {
      foundItemBonuses: [
        { perkId: 'scrounger', itemType: 'ammo', combatDice: 3 },
        { perkId: 'fortuneFinder', itemType: 'caps', combatDice: 3 },
      ],
    };
    const ammoEvents = rollFoundItemBonuses(bonuses, 'ammo');
    expect(ammoEvents).toEqual([
      { perkId: 'scrounger', itemType: 'ammo', amount: 6 },
    ]);
    expect(sumFoundItemBonus(ammoEvents)).toBe(6);
    expect(rollFoundItemBonuses(bonuses, 'food')).toEqual([]);
  });

  it('puts the found item name on the event for the shared alert', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.2); // CD 2
    const bonuses = {
      foundItemBonuses: [
        { perkId: 'scrounger', itemType: 'ammo', combatDice: 1 },
        { perkId: 'canOpener', itemType: 'food', extra: 1, match: { state: 'cooked' } },
      ],
    };
    expect(rollFoundItemBonuses(bonuses, 'ammo', { name: '10-мм патрон' })).toEqual([
      { perkId: 'scrounger', itemType: 'ammo', amount: 2, itemName: '10-мм патрон' },
    ]);
    expect(rollFoundItemBonuses(bonuses, 'food', {
      state: 'cooked',
      name: 'Стейк солсбери',
    })).toEqual([
      {
        perkId: 'canOpener',
        itemType: 'food',
        amount: 1,
        itemName: 'Стейк солсбери',
      },
    ]);
    expect(rollFoundItemBonuses(bonuses, 'food', {
      state: 'raw',
      name: 'Мясо радтаракана',
    })).toEqual([]);
  });
});
