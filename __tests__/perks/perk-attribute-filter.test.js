import { describe, expect, it } from 'vitest';
import { perkMatchesAttributeFilters } from '../../domain/perks';
import perksData from '../../modules/fallout/data/perks/perks.json';

const byId = (id) => perksData.find((perk) => perk.id === id);

describe('perkMatchesAttributeFilters', () => {
  it('shows every perk when no attribute is selected', () => {
    expect(perkMatchesAttributeFilters(byId('strongBack'), [])).toBe(true);
    expect(perkMatchesAttributeFilters(byId('intenseTraining'), [])).toBe(true);
  });

  it('always shows perks without attribute requirements', () => {
    expect(perkMatchesAttributeFilters(byId('intenseTraining'), ['STR'])).toBe(true);
    expect(perkMatchesAttributeFilters(byId('scrapper'), ['STR', 'END'])).toBe(true);
  });

  it('keeps perks that require every selected attribute', () => {
    expect(perkMatchesAttributeFilters(byId('butchersBounty'), ['PER'])).toBe(true);
    expect(perkMatchesAttributeFilters(byId('butchersBounty'), ['STR'])).toBe(false);
    expect(perkMatchesAttributeFilters(byId('contractor'), ['CHA'])).toBe(true);
    expect(perkMatchesAttributeFilters(byId('contractor'), ['CHA', 'INT'])).toBe(true);
    expect(perkMatchesAttributeFilters(byId('contractor'), ['CHA', 'STR'])).toBe(false);
  });
});
