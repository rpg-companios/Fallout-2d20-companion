import { describe, it, expect } from 'vitest';
import { isUnarmedAttack, applyUnarmedVisibility } from '../../domain/meleeSlot';

const fists = { id: 'unarmed_human', weaponType: 'Unarmed', isBuiltin: true };
const robotManipulator = { id: 'robot_weapon_manipulator', weapon_type: 'Unarmed', isBuiltin: true };
const knife = { id: 'weapon_knife', weaponType: 'Melee', isBuiltin: false };
const pistol = { id: 'weapon_pistol', weaponType: 'Light', isBuiltin: false };
// не-встроенная Unarmed-защита от дурака: в каталоге таких нет, но фильтр
// должен скрывать ТОЛЬКО виртуальную встроенную атаку.
const weirdUnarmedItem = { id: 'weapon_weird', weaponType: 'Unarmed', isBuiltin: false };

describe('meleeSlot — виртуальная рукопашная атака', () => {
  it('isUnarmedAttack распознаёт кулаки и манипулятор по типу Unarmed + isBuiltin', () => {
    expect(isUnarmedAttack(fists)).toBe(true);
    expect(isUnarmedAttack(robotManipulator)).toBe(true);
  });

  it('не считает рукопашной Melee-оружие и обычное стрелковое', () => {
    expect(isUnarmedAttack(knife)).toBe(false);
    expect(isUnarmedAttack(pistol)).toBe(false);
  });

  it('Unarmed без флага isBuiltin не скрывается (это предмет, а не виртуальная атака)', () => {
    expect(isUnarmedAttack(weirdUnarmedItem)).toBe(false);
  });

  it('visible=true — список не меняется', () => {
    const list = [fists, knife, pistol];
    expect(applyUnarmedVisibility(list, true)).toBe(list);
  });

  it('visible=false — кулаки/манипулятор убираются, первый слот занимает оружие', () => {
    const list = [fists, robotManipulator, knife, pistol];
    expect(applyUnarmedVisibility(list, false)).toEqual([knife, pistol]);
  });

  it('visible=false сохраняет Melee-оружие (это предмет, его скрывать нельзя)', () => {
    const list = [fists, knife];
    expect(applyUnarmedVisibility(list, false)).toEqual([knife]);
  });

  it('пустой/отсутствующий список — пустой результат', () => {
    expect(applyUnarmedVisibility([], false)).toEqual([]);
    expect(applyUnarmedVisibility(undefined, false)).toEqual([]);
  });
});
