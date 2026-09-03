import { describe, it, expect } from 'vitest';
import { isEquippableKitItem, resolveKitItemEquipState } from '../../domain/kitEquip';

const chem = { itemType: 'chem', itemId: 'chem_stimpak' };
const food = { itemType: 'food', itemId: 'food_snack' };
const ammo = { itemType: 'ammo', itemId: 'ammo_10mm' };
const weapon = { itemType: 'weapon', id: 'weapon_pistol' };
const armor = { itemType: 'armor', id: 'armor_leather_chest_001' };
const clothing = { itemType: 'clothing', id: 'clothing_sturdy_clothes' };

describe('isEquippableKitItem', () => {
  it('слот занимают оружие, броня, одежда, силовая броня', () => {
    expect(isEquippableKitItem(weapon)).toBe(true);
    expect(isEquippableKitItem(armor)).toBe(true);
    expect(isEquippableKitItem(clothing)).toBe(true);
    expect(isEquippableKitItem({ itemType: 'powerArmor' })).toBe(true);
  });

  it('расходники и хлам слот не занимают', () => {
    expect(isEquippableKitItem(chem)).toBe(false);
    expect(isEquippableKitItem(food)).toBe(false);
    expect(isEquippableKitItem(ammo)).toBe(false);
    expect(isEquippableKitItem({ itemType: 'junk' })).toBe(false);
    expect(isEquippableKitItem({ itemType: 'robotConsumable' })).toBe(false);
  });

  it('встроенные части робота считаются надеваемыми', () => {
    expect(isEquippableKitItem({ itemType: 'misc', isBuiltin: true })).toBe(true);
    expect(isEquippableKitItem({ itemType: 'misc', isManipulator: true })).toBe(true);
  });

  it('не падает на пустом входе', () => {
    expect(isEquippableKitItem(null)).toBe(false);
    expect(isEquippableKitItem(undefined)).toBe(false);
    expect(isEquippableKitItem('строка')).toBe(false);
  });
});

describe('resolveKitItemEquipState', () => {
  it('БАГ: робот больше не получает стимпак надетым и запертым', () => {
    expect(resolveKitItemEquipState(chem, true)).toEqual({ equipped: false, locked: false });
  });

  it('роботу надеваются только слотовые предметы', () => {
    expect(resolveKitItemEquipState(weapon, true)).toEqual({ equipped: true, locked: true });
    expect(resolveKitItemEquipState(armor, true)).toEqual({ equipped: true, locked: true });
    expect(resolveKitItemEquipState(food, true)).toEqual({ equipped: false, locked: false });
    expect(resolveKitItemEquipState(ammo, true)).toEqual({ equipped: false, locked: false });
  });

  it('человек не получает надетым ничего', () => {
    for (const item of [weapon, armor, clothing, chem, food, ammo]) {
      expect(resolveKitItemEquipState(item, false)).toEqual({ equipped: false, locked: false });
    }
  });

  it('equipped и locked всегда согласованы: запертым может быть только надетое', () => {
    for (const item of [weapon, armor, chem, food]) {
      for (const isRobot of [true, false]) {
        const { equipped, locked } = resolveKitItemEquipState(item, isRobot);
        expect(locked).toBe(equipped);
      }
    }
  });
});
