// ПРИЁМОЧНЫЙ (патч 551): «Тренированный» даёт очки навыков.
//
// Жалоба владельца: «не работает перк тренированный, он должен давать очки
// навыков». Механика книги: +1 ранг к двум навыкам или +2 ранга к одному
// (ни один навык не выше 6-го). Перк ранговый (maxRanks 10) — каждый ранг даёт
// свои +2 очка. Очки складываются с пулом уровня (INT + 9 + (level-1)) и
// тратятся обычным распределением навыков.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { calculatePerkEffects } from '../../domain/perks';
import { EDUCATED_SKILL_POINTS_PER_RANK } from '../../domain/perks/educated';
import {
  getSkillPoints,
  getSkillPointsAvailable,
} from '../../domain/characterCreation';
import useCharacterStore from '../../src/store/characterStore';
import catalog from '../../modules/fallout/data/perks/perks.json';

const state = () => useCharacterStore.getState();

beforeEach(() => {
  state().resetCharacterStore();
});

afterEach(async () => {
  state().resetCharacterStore();
  await useCharacterStore.persist.clearStorage();
});

// Книжный профиль: уровень 30 закрывает ранги (3 + 3·(ранг−1)).
const BOOK = {
  level: 30,
  attributes: { INT: { total: 6 } },
  isRobot: false,
};

// Legacy-массив атрибутов — вход формулы пула очков навыков.
const LEGACY_ATTRIBUTES = [
  { name: 'STR', value: 5 },
  { name: 'PER', value: 5 },
  { name: 'END', value: 5 },
  { name: 'CHA', value: 5 },
  { name: 'INT', value: 6 },
  { name: 'AGI', value: 5 },
  { name: 'LCK', value: 5 },
];

describe('Патч 551: «Тренированный» (educated) — очки навыков', () => {
  it('перк есть в книге: 10 рангов, эффект educated', () => {
    const perk = catalog.find((p) => p.id === 'educated');
    expect(perk).toBeTruthy();
    expect(perk.maxRanks).toBe(10);
    expect(perk.effect).toBe('educated');
  });

  it('бонус растёт с рангом: +2 очка за каждый ранг', () => {
    for (const rank of [1, 2, 3, 5, 10]) {
      const { bonuses, applied } = calculatePerkEffects(
        catalog,
        [{ id: 'educated', rank }],
        BOOK,
      );
      expect(bonuses.skillPoints).toBe(EDUCATED_SKILL_POINTS_PER_RANK * rank);
      expect(applied).toHaveLength(1);
      expect(applied[0].rank).toBe(rank);
    }
  });

  it('без перка пул навыков — только база уровня', () => {
    const base = getSkillPoints(LEGACY_ATTRIBUTES, 5);
    expect(base).toBe(6 + 9 + 4); // INT + 9 + (level-1)
    expect(getSkillPointsAvailable(LEGACY_ATTRIBUTES, 5, {})).toBe(base);
    expect(getSkillPointsAvailable(LEGACY_ATTRIBUTES, 5, { skillPoints: 0 })).toBe(base);
  });

  it('очки перка прибавляются к пулу уровня', () => {
    const bonus = calculatePerkEffects(catalog, [{ id: 'educated', rank: 2 }], BOOK)
      .bonuses.skillPoints;
    expect(bonus).toBe(4);
    expect(getSkillPointsAvailable(LEGACY_ATTRIBUTES, 5, { skillPoints: bonus }))
      .toBe(getSkillPoints(LEGACY_ATTRIBUTES, 5) + 4);
  });

  it('погасший перк очков не даёт: уровень ниже книжного', () => {
    // 1-й ранг «Тренированного» — с 3-го уровня.
    const { bonuses } = calculatePerkEffects(catalog, [{ id: 'educated' }], {
      ...BOOK,
      level: 2,
    });
    expect(bonuses.skillPoints).toBeUndefined();
  });

  it('стор: выбор двух рангов → perkBonuses.skillPoints = 4', () => {
    useCharacterStore.setState({
      level: 30,
      attributes: {
        STR: { total: 5 }, PER: { total: 5 }, END: { total: 5 }, CHA: { total: 5 },
        INT: { total: 6 }, AGI: { total: 5 }, LCK: { total: 5 },
      },
    });
    state().setSelectedPerks([{ id: 'educated' }, { id: 'educated' }]);
    expect(state().perkBonuses.skillPoints).toBe(4);
    expect(getSkillPointsAvailable(LEGACY_ATTRIBUTES, 30, state().perkBonuses))
      .toBe(getSkillPoints(LEGACY_ATTRIBUTES, 30) + 4);
  });

  it('снятие перка возвращает пул к базе', () => {
    useCharacterStore.setState({ level: 30 });
    state().setSelectedPerks([{ id: 'educated' }]);
    expect(state().perkBonuses.skillPoints).toBe(2);
    state().setSelectedPerks([]);
    expect(state().perkBonuses.skillPoints).toBeUndefined();
    expect(getSkillPointsAvailable(LEGACY_ATTRIBUTES, 30, state().perkBonuses))
      .toBe(getSkillPoints(LEGACY_ATTRIBUTES, 30));
  });
});
