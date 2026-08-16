/**
 * Разделение движок/сеттинг (патч 116): награды за навыки перенесены
 * в модуль с канонизацией itemType ('chems' → 'chem'). data/skillRewards.json
 * — пустая движковая база ({}).
 */
import { describe, it, expect } from 'vitest';
import moduleSkillRewards from '../../modules/fallout/data/skillRewards.json';
import dataSkillRewards from '../../data/skillRewards.json';

describe('Награды навыков в модуле (сеттинг), data/ — пустой движок', () => {
  it('модуль содержит награды для всех навыков, itemType каноничен', () => {
    expect(Object.keys(moduleSkillRewards).length).toBe(17);
    for (const [skill, rec] of Object.entries(moduleSkillRewards)) {
      expect(Array.isArray(rec.items), skill).toBe(true);
      for (const item of rec.items) {
        expect(item.itemType, `${skill}.${item.itemId}`).not.toBe('chems');
      }
    }
  });

  it('data/ пуст', () => {
    expect(dataSkillRewards).toEqual({});
  });
});
