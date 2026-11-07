// ПРИЁМОЧНЫЙ (патч 552): очки «Тренированного» у старых сейвов и долг при снятии перка.
//
// Слово владельца (2026-11-07):
//   • «а что со старыми сейвами, где перк взят раньше и ничего не дал?» —
//     очки начисляются сразу при загрузке, распределение навыков открывается
//     заново, ждать нового уровня не надо;
//   • «если игрок снимает перк — забрать 2 очка, но с каких навыков?» —
//     выбирает игрок, суммарно не больше 2 (2 с одного или 1 с двух),
//     минимумы навыков соблюдаются (0 обычный, 2 тегированный);
//   • «моды» — поведение 551 не меняется (прицел не трогает дистанцию).
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import useCharacterStore from '../../src/store/characterStore';
import { ALL_SKILLS, getSkillPoints } from '../../domain/characterCreation';
import { selectPerkBonuses } from '../../domain/perks';
import {
  applySkillRefund,
  pendingSkillPoints,
  perkRemovalRefund,
  planPerkRemovalSkillRefund,
  shouldUnlockSkillDistribution,
  skillRefundCapacity,
  totalRefund,
} from '../../domain/skillPoints';
import catalog from '../../modules/fallout/data/perks/perks.json';

const state = () => useCharacterStore.getState();

beforeEach(() => {
  state().resetCharacterStore();
});

afterEach(async () => {
  state().resetCharacterStore();
  await useCharacterStore.persist.clearStorage();
});

const LEGACY_ATTRIBUTES = [
  { name: 'STR', value: 5 },
  { name: 'PER', value: 5 },
  { name: 'END', value: 5 },
  { name: 'CHA', value: 5 },
  { name: 'INT', value: 6 },
  { name: 'AGI', value: 5 },
  { name: 'LCK', value: 5 },
];

const LEVEL = 30; // книга: все ранги «Тренированного» доступны
const BASE = getSkillPoints(LEGACY_ATTRIBUTES, LEVEL); // INT + 9 + (level-1) = 44

/** Разложить очки по навыкам (потолок ранга 6) — валидное распределение. */
const spendPoints = (skills, amount) => {
  let left = Math.max(0, amount);
  return skills.map((skill) => {
    const add = Math.min(left, 6 - skill.value);
    left -= add;
    return { ...skill, value: skill.value + add };
  });
};

/** Завершённый персонаж 30-го уровня: навыки распределены на BASE очков. */
const primeSavedCharacter = ({ extraPoints = 0 } = {}) => {
  useCharacterStore.setState({
    level: LEVEL,
    attributesSaved: true,
    skillsSaved: true,
  });
  state().setBaseAttributes(LEGACY_ATTRIBUTES);
  const spread = spendPoints(ALL_SKILLS.map((s) => ({ ...s, value: 0 })), BASE + extraPoints);
  state().setBaseSkills(spread);
  return spread;
};

const pendingNow = () => pendingSkillPoints({
  attributes: LEGACY_ATTRIBUTES,
  level: state().level,
  perkBonuses: state().perkBonuses,
  skills: ALL_SKILLS.map((s) => ({ name: s.name, value: state().skills[s.name]?.base ?? 0 })),
  selectedSkills: state().selectedSkills,
  extraTaggedSkills: state().extraTaggedSkills,
});

describe('Патч 552: арифметика пула и долга', () => {
  it('pendingSkillPoints = пул (база + перки) минус потраченное', () => {
    const skills = spendPoints(ALL_SKILLS.map((s) => ({ ...s, value: 0 })), BASE - 3);
    expect(pendingSkillPoints({
      attributes: LEGACY_ATTRIBUTES,
      level: LEVEL,
      perkBonuses: {},
      skills,
    })).toBe(3);
    expect(pendingSkillPoints({
      attributes: LEGACY_ATTRIBUTES,
      level: LEVEL,
      perkBonuses: { skillPoints: 2 },
      skills,
    })).toBe(5);
  });

  it('распределение открывается только у завершённого персонажа с нераспределёнными очками', () => {
    expect(shouldUnlockSkillDistribution({ attributesSaved: true, skillsSaved: true, pending: 2 })).toBe(true);
    expect(shouldUnlockSkillDistribution({ attributesSaved: true, skillsSaved: false, pending: 2 })).toBe(false);
    expect(shouldUnlockSkillDistribution({ attributesSaved: false, skillsSaved: true, pending: 2 })).toBe(false);
    expect(shouldUnlockSkillDistribution({ attributesSaved: true, skillsSaved: true, pending: 0 })).toBe(false);
    expect(shouldUnlockSkillDistribution({ attributesSaved: true, skillsSaved: true, pending: -1 })).toBe(false);
  });

  it('снятие перка: сначала «съедаются» нераспределённые очки, с навыков — остаток', () => {
    expect(perkRemovalRefund({ grantedPoints: 2, pending: 0 })).toBe(2);
    expect(perkRemovalRefund({ grantedPoints: 2, pending: 1 })).toBe(1);
    expect(perkRemovalRefund({ grantedPoints: 2, pending: 2 })).toBe(0);
    expect(perkRemovalRefund({ grantedPoints: 2, pending: 5 })).toBe(0);
    expect(perkRemovalRefund({ grantedPoints: 0, pending: 0 })).toBe(0);
    // долг (навыки сверх пула): снимаем столько же, сколько дал перк
    expect(perkRemovalRefund({ grantedPoints: 2, pending: -3 })).toBe(2);
  });

  it('запас навыков считается до минимумов: 0 обычный, 2 тегированный', () => {
    const skills = [
      { name: 'SNEAK', value: 2 },
      { name: 'LOCKPICK', value: 1 },
      { name: 'REPAIR', value: 0 },
    ];
    expect(skillRefundCapacity(skills, ['SNEAK'])).toBe(1);
    expect(skillRefundCapacity(skills, [])).toBe(3);
  });

  it('план снятия невозможен, если у навыков нет запаса', () => {
    const skills = [{ name: 'SNEAK', value: 2 }, { name: 'REPAIR', value: 0 }];
    const plan = planPerkRemovalSkillRefund({
      grantedPoints: 2,
      pending: 0,
      skills,
      taggedSkills: ['SNEAK'],
    });
    expect(plan).toEqual({ refund: 2, capacity: 0, possible: false });
  });

  it('applySkillRefund не опускает ниже минимума и не трогает остальные навыки', () => {
    const skills = [
      { name: 'SNEAK', value: 4 },
      { name: 'LOCKPICK', value: 6 },
      { name: 'REPAIR', value: 3 },
    ];
    expect(applySkillRefund(skills, ['SNEAK'], { SNEAK: 1, LOCKPICK: 2 })).toEqual([
      { name: 'SNEAK', value: 3 },
      { name: 'LOCKPICK', value: 4 },
      { name: 'REPAIR', value: 3 },
    ]);
    expect(applySkillRefund(skills, ['SNEAK'], { SNEAK: 5 })[0].value).toBe(2);
    expect(applySkillRefund(skills, [], { REPAIR: 9 })[2].value).toBe(0);
    expect(totalRefund({ SNEAK: 1, LOCKPICK: 1 })).toBe(2);
  });
});

describe('Патч 552: старые сейвы получают очки сразу', () => {
  it('перк взят до 551: при загрузке распределение открывается, очки видны', () => {
    primeSavedCharacter();
    state().setSelectedPerks([{ id: 'educated', rank: 1 }]);
    expect(state().perkBonuses.skillPoints).toBe(2);
    expect(pendingNow()).toBe(2);
    expect(state().skillsSaved).toBe(true);

    const result = state().unlockSkillDistributionIfPointsPending();

    expect(result).toEqual({ unlocked: true, points: 2, pending: 2 });
    expect(state().skillsSaved).toBe(false);
    expect(pendingNow()).toBe(2); // навыки не тронуты, очки ждут распределения
  });

  it('повторная загрузка не открывает распределение второй раз (нет цикла)', () => {
    primeSavedCharacter();
    state().setSelectedPerks([{ id: 'educated', rank: 1 }]);
    state().unlockSkillDistributionIfPointsPending();
    expect(state().unlockSkillDistributionIfPointsPending()).toMatchObject({ unlocked: false });
    // игрок сохранил навыки, не потратив очки — сохранение не пропустит это,
    // но и тогда экран остаётся открытым, пока очки не распределены
    state().setSkillsSaved(true);
    expect(state().unlockSkillDistributionIfPointsPending()).toMatchObject({ unlocked: true });
  });

  it('очки распределены → распределение больше не открывается', () => {
    const spread = primeSavedCharacter();
    state().setSelectedPerks([{ id: 'educated', rank: 1 }]);
    state().unlockSkillDistributionIfPointsPending();

    state().setBaseSkills(spendPoints(spread, 2));
    state().setSkillsSaved(true);
    expect(pendingNow()).toBe(0);

    expect(state().unlockSkillDistributionIfPointsPending()).toMatchObject({
      unlocked: false,
      pending: 0,
    });
    expect(state().skillsSaved).toBe(true);
  });

  it('два ранга — 4 очка: распределение открывается на всю сумму', () => {
    primeSavedCharacter();
    state().setSelectedPerks([{ id: 'educated', rank: 1 }, { id: 'educated', rank: 2 }]);
    expect(state().perkBonuses.skillPoints).toBe(4);
    expect(state().unlockSkillDistributionIfPointsPending()).toMatchObject({ unlocked: true, points: 4 });
  });

  it('незавершённое создание персонажа не открывается принудительно', () => {
    primeSavedCharacter();
    state().setSelectedPerks([{ id: 'educated', rank: 1 }]);
    useCharacterStore.setState({ attributesSaved: false });
    expect(state().unlockSkillDistributionIfPointsPending()).toMatchObject({ unlocked: false });
    expect(state().skillsSaved).toBe(true);
  });
});

describe('Патч 552: снятие «Тренированного» возвращает его очки', () => {
  const removeEducated = (refunds) => {
    const skills = ALL_SKILLS.map((s) => ({ name: s.name, value: state().skills[s.name]?.base ?? 0 }));
    const tagged = [...state().selectedSkills, ...state().extraTaggedSkills];
    const nextBonuses = selectPerkBonuses({ ...state(), selectedPerks: [] }, catalog);
    const grantedPoints = (state().perkBonuses.skillPoints || 0) - (nextBonuses.skillPoints || 0);
    const plan = planPerkRemovalSkillRefund({
      grantedPoints,
      pending: pendingNow(),
      skills,
      taggedSkills: tagged,
    });
    if (plan.refund > 0) state().setBaseSkills(applySkillRefund(skills, tagged, refunds));
    state().setSelectedPerks([]);
    return plan;
  };

  it('очки потрачены: игрок снимает 2 с одного навыка, долга не остаётся', () => {
    const spread = primeSavedCharacter();
    state().setSelectedPerks([{ id: 'educated', rank: 1 }]);
    state().setBaseSkills(spendPoints(spread, 2));
    expect(pendingNow()).toBe(0);
    const before = state().skills.ATHLETICS.base;

    const plan = removeEducated({ ATHLETICS: 2 });

    expect(plan).toMatchObject({ refund: 2, possible: true });
    expect(state().skills.ATHLETICS.base).toBe(before - 2);
    expect(pendingNow()).toBe(0);
    expect(state().perkBonuses.skillPoints).toBeUndefined();
  });

  it('можно разложить на два навыка по 1 — суммарно 2', () => {
    const spread = primeSavedCharacter();
    state().setSelectedPerks([{ id: 'educated', rank: 1 }]);
    state().setBaseSkills(spendPoints(spread, 2));
    const beforeAthletics = state().skills.ATHLETICS.base;
    const beforeBarter = state().skills.BARTER.base;

    removeEducated({ ATHLETICS: 1, BARTER: 1 });

    expect(state().skills.ATHLETICS.base).toBe(beforeAthletics - 1);
    expect(state().skills.BARTER.base).toBe(beforeBarter - 1);
    expect(pendingNow()).toBe(0);
  });

  it('очки ещё в пуле: с навыков ничего не снимается', () => {
    const spread = primeSavedCharacter();
    state().setSelectedPerks([{ id: 'educated', rank: 1 }]);
    // перк дал 2, но они не потрачены
    expect(pendingNow()).toBe(2);
    const snapshot = JSON.stringify(state().skills);

    const plan = removeEducated({});

    expect(plan.refund).toBe(0);
    expect(JSON.stringify(state().skills)).toBe(snapshot);
    expect(pendingNow()).toBe(0);
  });

  it('микс: 1 очко в пуле + 1 с навыка', () => {
    const spread = primeSavedCharacter();
    state().setSelectedPerks([{ id: 'educated', rank: 1 }]);
    state().setBaseSkills(spendPoints(spread, 1));
    expect(pendingNow()).toBe(1);
    const beforeAthletics = state().skills.ATHLETICS.base;

    const plan = removeEducated({ ATHLETICS: 1 });

    expect(plan.refund).toBe(1);
    expect(state().skills.ATHLETICS.base).toBe(beforeAthletics - 1);
    expect(pendingNow()).toBe(0);
  });
});

describe('Патч 552: проводка в экранах', () => {
  it('загрузка сейва открывает распределение и объясняет очки', () => {
    const source = readFileSync('src/saves/characterSaves.js', 'utf8');
    expect(source).toContain('unlockSkillDistributionIfPointsPending');
    expect(source).toContain('skillPointsUnlockedMessage');
  });

  it('реидратация кэша тоже открывает распределение', () => {
    const source = readFileSync('src/store/characterStore.js', 'utf8');
    const rehydrate = source.slice(source.indexOf('onRehydrateStorage'));
    expect(rehydrate).toContain('unlockSkillDistributionIfPointsPending');
  });

  it('экран перков снимает очки через выбор игрока', () => {
    const source = readFileSync('modules/fallout/screens/PerksAndTraitsScreen/PerksAndTraitsScreen.js', 'utf8');
    expect(source).toContain('planPerkRemovalSkillRefund');
    expect(source).toContain('applySkillRefund');
    expect(source).toContain('SkillRefundModal');
  });

  it('строки модалки и алерта есть в обоих словарях', () => {
    for (const locale of ['ru-RU', 'en-EN']) {
      const dict = JSON.parse(readFileSync(
        `modules/fallout/i18n/${locale}/screens/perksAndTraits/screen.json`,
        'utf8',
      ));
      expect(dict.alerts.skillPointsUnlockedTitle).toBeTruthy();
      expect(dict.alerts.skillPointsUnlockedMessage).toContain('{points}');
      expect(dict.alerts.refundImpossibleMessage).toContain('{points}');
      for (const key of ['title', 'message', 'remaining', 'taggedHint', 'decrease', 'undo', 'cancel', 'confirm']) {
        expect(dict.refund[key]).toBeTruthy();
      }
    }
  });
});
