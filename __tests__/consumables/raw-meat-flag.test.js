import { describe, expect, it } from 'vitest';
import food from '../../modules/fallout/data/consumables/food.json';

const RAW_MEAT_IDS = [
  'food_bloatfly_meat',
  'food_bloodbug_meat',
  'food_brahmin_meat',
  'food_deathclaw_meat',
  'food_mirelurk_meat',
  'food_mirelurk_queen_meat',
  'food_softshell_mirelurk_meat',
  'food_mole_rat_meat',
  'food_dog_meat',
  'food_mutant_hound_meat',
  'food_radroach_meat',
  'food_radscorpion_meat',
  'food_radstag_meat',
  'food_stingwing_meat',
  'food_yao_guai_meat',
];

describe('rawMeat flag', () => {
  it('marks only the listed raw meats', () => {
    const flagged = food.filter((item) => item.rawMeat === true).map((item) => item.id);
    expect(flagged.sort()).toEqual([...RAW_MEAT_IDS].sort());
    expect(food.find((item) => item.id === 'food_squirrel_bits').rawMeat).toBeUndefined();
    expect(food.find((item) => item.id === 'food_deathclaw_egg').rawMeat).toBeUndefined();
  });
});
