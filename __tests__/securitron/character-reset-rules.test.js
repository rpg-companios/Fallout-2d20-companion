/**
 * Правило владельца: смена ориджина/трейта/комплекта.
 *
 * - locked = attributesSaved || skillsSaved (после распределения).
 * - До locked: смена свободна, без подтверждения; комплект сбрасывается
 *   вместе с ориджином.
 * - После locked: смена ориджина/трейта — полный сброс персонажа; смена
 *   комплекта — сброс инвентаря, навыков и наград (атрибуты сохраняются).
 * - Просмотр списков свободен всегда.
 */
import { describe, it, expect } from 'vitest';
import { isCharacterLocked } from '../../domain/characterCreation';
import useCharacterStore from '../../src/store/characterStore';

describe('isCharacterLocked (точка невозврата)', () => {
  it('не зафиксирован, пока ничего не распределено', () => {
    expect(isCharacterLocked(false, false)).toBe(false);
  });

  it('зафиксирован после распределения атрибутов', () => {
    expect(isCharacterLocked(true, false)).toBe(true);
  });

  it('зафиксирован после распределения навыков', () => {
    expect(isCharacterLocked(false, true)).toBe(true);
  });

  it('зафиксирован при обоих', () => {
    expect(isCharacterLocked(true, true)).toBe(true);
  });
});

describe('resetKitAndRewards (сброс комплекта)', () => {
  it('очищает инвентарь/награды, сохраняя атрибуты и навыки стора', () => {
    // resetKitAndRewards в контексте вызывает resetCharacterStore с текущими
    // attributes/skills и rewardedSkills: []. Проверяем контракт resetCharacterStore.
    useCharacterStore.getState().resetCharacterStore({
      attributes: [{ name: 'STR', value: 7 }],
      skills: [{ name: 'SMALL_GUNS', value: 2 }],
      rewardedSkills: ['SMALL_GUNS'],
    });
    useCharacterStore.getState().addNewItem({ weaponId: 'weapon_10mm_pistol', itemType: 'weapon', name: 'x' });
    expect(Object.keys(useCharacterStore.getState().items)).toHaveLength(1);

    // Симуляция resetKitAndRewards: те же атрибуты/навыки, rewardedSkills: []
    useCharacterStore.getState().resetCharacterStore({
      attributes: [{ name: 'STR', value: useCharacterStore.getState().attributes.STR.base }],
      skills: [{ name: 'SMALL_GUNS', value: useCharacterStore.getState().skills.SMALL_GUNS.base }],
      rewardedSkills: [],
    });

    expect(Object.keys(useCharacterStore.getState().items)).toHaveLength(0);
    expect(useCharacterStore.getState().rewardedSkills).toEqual([]);
    expect(useCharacterStore.getState().attributes.STR.base).toBe(7);
    expect(useCharacterStore.getState().skills.SMALL_GUNS.base).toBe(2);
  });
});
