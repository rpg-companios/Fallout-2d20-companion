import { describe, expect, it } from 'vitest';

import {
  getCraftingCategories,
  getCraftingCategoryRuleRegistry,
  getCraftingCategoryRules,
} from '../../domain/registry';
import { CRAFT_RULES } from '../../modules/fallout/crafting/rules';

describe('реестр параметров категорий крафта', () => {
  it('хранит правило сгорания материалов для каждой объявленной категории', () => {
    const categories = getCraftingCategories();
    const registry = getCraftingCategoryRuleRegistry();

    expect(Object.keys(registry).sort()).toEqual([...categories].sort());
    for (const category of categories) {
      const rules = getCraftingCategoryRules(category);
      expect(rules).toEqual(registry[category]);
      expect(Array.isArray(rules.failBurnsMaterialsSkills)).toBe(true);
    }
    expect(getCraftingCategoryRules('unknown-category')).toBeNull();
  });

  it('пища и препараты сжигают материалы по правилам своей категории', () => {
    expect(getCraftingCategoryRules('food').failBurnsMaterialsSkills).toContain('SURVIVAL');
    expect(getCraftingCategoryRules('chems').failBurnsMaterialsSkills).toContain('SCIENCE');
    expect(CRAFT_RULES.failBurnsMaterialsSkills).toEqual(expect.arrayContaining([
      'SURVIVAL', 'SCIENCE', 'EXPLOSIVES',
    ]));
  });
});
