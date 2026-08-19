import { describe, expect, it } from 'vitest';
import perksData from '../../modules/fallout/data/perks/perks.json';
import {
  annotatePerks,
  applyPerkSelection,
  calculatePerkEffects,
  canSelectPerk,
  collapseSelectedPerks,
  getPerkSelectionCount,
  getRequiredLevelForRank,
  meetsPerkRequirements,
  removeSelectedPerkAt,
  trimSelectedPerksToMaxRanks,
  withAssignedPerkRanks,
} from '../../domain/perks';

const perkById = (id) => perksData.find((perk) => perk.id === id);

const attributes = [
  { name: 'STR', value: 8 },
  { name: 'PER', value: 8 },
  { name: 'END', value: 8 },
  { name: 'CHA', value: 8 },
  { name: 'INT', value: 8 },
  { name: 'AGI', value: 8 },
  { name: 'LCK', value: 8 },
];

describe('perk selection ranks', () => {
  it('does not allow taking a rank 1 perk twice', () => {
    const junktownVendor = perkById('junktownVendor');
    expect(junktownVendor.maxRanks).toBe(1);

    const first = applyPerkSelection([], junktownVendor);
    expect(first.ok).toBe(true);
    expect(first.selectedPerks).toEqual([expect.objectContaining({ id: 'junktownVendor', rank: 1 })]);

    const second = applyPerkSelection(first.selectedPerks, junktownVendor);
    expect(second.ok).toBe(false);
    expect(second.reason).toBe('max-rank');
    expect(second.selectedPerks).toHaveLength(1);
    expect(canSelectPerk(junktownVendor, first.selectedPerks)).toBe(false);
  });

  it('allows a multi-rank perk up to maxRanks and then blocks it', () => {
    const strongBack = perkById('strongBack');
    expect(strongBack.maxRanks).toBe(3);

    const rank1 = applyPerkSelection([], strongBack);
    const rank2 = applyPerkSelection(rank1.selectedPerks, strongBack);
    const rank3 = applyPerkSelection(rank2.selectedPerks, strongBack);
    const rank4 = applyPerkSelection(rank3.selectedPerks, strongBack);

    expect(rank1.ok && rank2.ok && rank3.ok).toBe(true);
    expect(rank3.selectedPerks.map((perk) => perk.rank)).toEqual([1, 2, 3]);
    expect(rank4.ok).toBe(false);
    expect(getPerkSelectionCount(rank3.selectedPerks, 'strongBack')).toBe(3);
  });

  it('lets a confirmed duplicate perk be replaced or removed without scrapping the sheet', () => {
    const junktownVendor = perkById('junktownVendor');
    const snakeater = perkById('snakeater');
    const stuck = withAssignedPerkRanks([junktownVendor, junktownVendor]);

    expect(stuck).toHaveLength(2);
    expect(canSelectPerk(junktownVendor, stuck)).toBe(false);

    const replaced = applyPerkSelection(stuck, snakeater, { replaceIndex: 1 });
    expect(replaced.ok).toBe(true);
    expect(replaced.selectedPerks.map((perk) => perk.id)).toEqual(['junktownVendor', 'snakeater']);
    expect(getPerkSelectionCount(replaced.selectedPerks, 'junktownVendor')).toBe(1);

    const removed = removeSelectedPerkAt(stuck, 1);
    expect(removed).toHaveLength(1);
    expect(removed[0]).toMatchObject({ id: 'junktownVendor', rank: 1 });
    expect(canSelectPerk(junktownVendor, removed)).toBe(false);
    expect(canSelectPerk(snakeater, removed)).toBe(true);
  });

  it('reassigns sequential ranks after a middle pick is removed', () => {
    const strongBack = perkById('strongBack');
    const junktownVendor = perkById('junktownVendor');
    const selected = withAssignedPerkRanks([strongBack, junktownVendor, strongBack]);

    const removed = removeSelectedPerkAt(selected, 0);
    expect(removed.map((perk) => ({ id: perk.id, rank: perk.rank }))).toEqual([
      { id: 'junktownVendor', rank: 1 },
      { id: 'strongBack', rank: 1 },
    ]);
  });
});

describe('perk availability annotation', () => {
  it('marks a maxed rank-1 perk unavailable and still annotates the rest', () => {
    const junktownVendor = perkById('junktownVendor');
    const selected = [{ id: 'junktownVendor', rank: 1 }];
    const annotated = annotatePerks([junktownVendor, perkById('snakeater')], attributes, 1, selected);
    const vendor = annotated.find((entry) => entry.perk.id === 'junktownVendor');
    const snakeater = annotated.find((entry) => entry.perk.id === 'snakeater');

    expect(vendor.available).toBe(false);
    expect(vendor.unmet.maxRank).toEqual({ current: 1, max: 1 });
    expect(snakeater.available).toBe(true);
  });

  it('ignores the slot being replaced when checking max rank', () => {
    const junktownVendor = perkById('junktownVendor');
    const selected = [{ id: 'junktownVendor', rank: 1 }];

    expect(meetsPerkRequirements(junktownVendor, attributes, 1, selected)).toBe(false);
    expect(meetsPerkRequirements(junktownVendor, attributes, 1, selected, { replaceIndex: 0 })).toBe(true);
  });

  it('requires the next rank level for a multi-rank perk', () => {
    const strongBack = perkById('strongBack');
    expect(getRequiredLevelForRank(strongBack, 1)).toBe(1);
    expect(getRequiredLevelForRank(strongBack, 2)).toBe(3);

    const selected = [{ id: 'strongBack', rank: 1 }];
    expect(meetsPerkRequirements(strongBack, attributes, 1, selected)).toBe(false);
    expect(meetsPerkRequirements(strongBack, attributes, 3, selected)).toBe(true);
  });

  it('blocks mutually exclusive perks', () => {
    const daringNature = perkById('daringNature');
    const cautiousNature = perkById('cautiousNature');
    const selected = [{ id: 'daringNature', rank: 1 }];

    expect(meetsPerkRequirements(cautiousNature, attributes, 1, selected)).toBe(false);
    const annotated = annotatePerks([cautiousNature], attributes, 1, selected);
    expect(annotated[0].unmet.excluded.perkIds).toEqual(['daringNature']);
  });
});

describe('trim extra perk ranks', () => {
  it('removes picks beyond maxRanks and keeps the first valid ranks', () => {
    const junktownVendor = perkById('junktownVendor');
    const snakeater = perkById('snakeater');
    const { selectedPerks, removed } = trimSelectedPerksToMaxRanks(
      [junktownVendor, junktownVendor, snakeater],
      perksData,
    );

    expect(removed).toHaveLength(1);
    expect(selectedPerks.map((perk) => perk.id)).toEqual(['junktownVendor', 'snakeater']);
    expect(selectedPerks.map((perk) => perk.rank)).toEqual([1, 1]);
  });

  it('does not invent a max rank when the catalog and save have no maxRanks', () => {
    const orphan = { id: 'unknownCustomPerk' };
    const { selectedPerks, removed } = trimSelectedPerksToMaxRanks([orphan, orphan], []);

    expect(removed).toHaveLength(0);
    expect(selectedPerks).toHaveLength(2);
  });
});

describe('perk effect aggregation', () => {
  it('counts one rank-scaled bonus even when the same perk was picked twice', () => {
    const strongBack = perkById('strongBack');
    const selected = [
      { id: 'strongBack', rank: 1, effect: 'strongBack' },
      { id: 'strongBack', rank: 2, effect: 'strongBack' },
    ];

    expect(collapseSelectedPerks(selected)).toEqual([
      expect.objectContaining({ id: 'strongBack', rank: 2 }),
    ]);
    expect(calculatePerkEffects([strongBack], selected).bonuses.carryWeightBonus).toBe(50);
  });
});
