import { describe, expect, it } from 'vitest';
import {
  ACTIONS,
  classifyItemAccess,
  getBranch,
} from '../../domain/itemfit';

// Справочник категорий как в данных сеттинга (модуль), чтобы тест не зависел от реестра.
const CATEGORIES = {
  robotEquipment: {
    any: [
      { item: 'robot_armor_*' },
      { item: 'robot_plating_*' },
      { item: 'robot_frame_*' },
      { item: 'robot_body_*' },
      { item: 'robot_head_*' },
      { item: 'robot_arm_*' },
      { item: 'robot_legs_*' },
      { item: 'robot_weapon_*' },
    ],
  },
  robotArmor: {
    any: [
      { item: 'robot_armor_*' },
      { item: 'robot_plating_*' },
      { item: 'robot_frame_*' },
    ],
  },
  robotConsumable: { itemType: 'robotConsumable' },
  humanArmor: { itemType: ['armor', 'powerArmor'] },
  powerArmor: { itemType: 'powerArmor' },
  humanClothing: { itemType: 'clothing' },
  raiderArmor: { item: 'armor_raider_*' },
  consumable: { itemType: ['food', 'drinks', 'chem'] },
};

// Профили как в fitProfiles.json.
const PROFILES = {
  human: {
    equip: { allow: [], forbidden: [{ category: 'robotEquipment' }] },
    consume: {
      self: { allow: [], forbidden: [{ category: 'robotConsumable' }] },
      other: {},
    },
  },
  mutant: {
    equip: {
      allow: [],
      forbidden: [
        { category: 'robotEquipment' },
        { category: 'humanArmor' },
        { category: 'powerArmor' },
      ],
      bypassAllow: [{ category: 'raiderArmor' }],
    },
    consume: {
      self: { forbidden: [{ category: 'robotConsumable' }] },
      other: {},
    },
  },
  robot: {
    equip: {
      allow: [],
      forbidden: [
        { category: 'humanArmor' },
        { category: 'humanClothing' },
        { category: 'powerArmor' },
      ],
      bypassAllow: [
        { category: 'robotArmor' },
        { item: 'headwear_casual_hat' },
        { item: 'headwear_fancy_hat' },
      ],
    },
    consume: {
      self: { forbidden: [{ category: 'consumable' }], bypassAllow: [{ category: 'robotConsumable' }] },
      other: {},
    },
  },
  cyborg: {
    equip: { allow: [], forbidden: [{ category: 'robotEquipment' }] },
    consume: {
      self: { forbidden: [{ category: 'consumable' }, { category: 'robotConsumable' }] },
      other: {},
    },
  },
};

const classify = (type, item, action = ACTIONS.EQUIP) =>
  classifyItemAccess(item, action, PROFILES[type] || {}, CATEGORIES);

const item = (id, itemType, extra = {}) => ({ id, itemType, ...extra });

describe('itemfit classification', () => {
  it('приоритет: bypassAllow перекрывает forbidden (мутант-рейдерская броня)', () => {
    expect(classify('mutant', item('armor_raider_chest_001', 'armor')).status).toBe('allowed');
    expect(classify('mutant', item('armor_leather_chest_001', 'armor')).status).toBe('denied');
  });

  it('мутанту нельзя силовую броню', () => {
    expect(classify('mutant', item('power_armor_raider_chest', 'powerArmor')).status).toBe('denied');
  });

  it('человек: всё можно, кроме робо-предметов', () => {
    expect(classify('human', item('armor_leather_chest_001', 'armor')).status).toBe('allowed');
    expect(classify('human', item('weapon_10mm_pistol', 'weapon')).status).toBe('allowed');
    expect(classify('human', item('robot_arm_001', 'robotArm')).status).toBe('denied');
    expect(classify('human', item('robot_weapon_manipulator', 'weapon')).status).toBe('denied');
  });

  it('человек не употребит ремкомплект на себя', () => {
    expect(classify('human', item('robot_item_repair_kit', 'robotConsumable', { healAmount: 6 }), ACTIONS.CONSUME_SELF).status).toBe('denied');
    expect(classify('human', item('food_bloatfly_meat', 'food'), ACTIONS.CONSUME_SELF).status).toBe('allowed');
  });

  it('робот: робо-броня и две шляпы можно, человеческая броня/одежда нельзя', () => {
    expect(classify('robot', item('robot_plating_standard_body', 'misc')).status).toBe('allowed');
    expect(classify('robot', item('armor_leather_chest_001', 'armor')).status).toBe('denied');
    expect(classify('robot', item('headwear_casual_hat', 'clothing')).status).toBe('allowed');
    expect(classify('robot', item('headwear_fancy_hat', 'clothing')).status).toBe('allowed');
    expect(classify('robot', item('headwear_military_helmet', 'clothing')).status).toBe('denied');
    expect(classify('robot', item('clothing_casual_clothes', 'clothing')).status).toBe('denied');
  });

  it('робот: не употребляет еду/воду/хим на себя, но ремкомплект — можно', () => {
    expect(classify('robot', item('food_bloatfly_meat', 'food'), ACTIONS.CONSUME_SELF).status).toBe('denied');
    expect(classify('robot', item('drink_nuka_cola', 'drinks'), ACTIONS.CONSUME_SELF).status).toBe('denied');
    expect(classify('robot', item('robot_item_repair_kit', 'robotConsumable', { healAmount: 6 }), ACTIONS.CONSUME_SELF).status).toBe('allowed');
  });

  it('киборг: экипировка как человек, но ничего на себя', () => {
    expect(classify('cyborg', item('armor_leather_chest_001', 'armor')).status).toBe('allowed');
    expect(classify('cyborg', item('robot_arm_001', 'robotArm')).status).toBe('denied');
    expect(classify('cyborg', item('food_bloatfly_meat', 'food'), ACTIONS.CONSUME_SELF).status).toBe('denied');
    expect(classify('cyborg', item('robot_item_repair_kit', 'robotConsumable', { healAmount: 6 }), ACTIONS.CONSUME_SELF).status).toBe('denied');
  });

  it('силовая броня: мутанту и роботу нельзя (явная категория powerArmor), человеку — можно', () => {
    expect(classify('mutant', item('power_armor_raider_chest', 'powerArmor')).status).toBe('denied');
    expect(classify('robot', item('power_armor_raider_chest', 'powerArmor')).status).toBe('denied');
    expect(classify('human', item('power_armor_raider_chest', 'powerArmor')).status).toBe('allowed');
  });

  it('гуль = как человек (нет профиля → {} → разрешено всё)', () => {
    expect(classify('ghoul', item('armor_leather_chest_001', 'armor')).status).toBe('allowed');
    expect(classify('ghoul', item('weapon_10mm_pistol', 'weapon')).status).toBe('allowed');
    expect(classify('ghoul', item('food_bloatfly_meat', 'food'), ACTIONS.CONSUME_SELF).status).toBe('allowed');
  });

  it('конфликт: bypassAllow ∩ bypassForbidden', () => {
    const profile = {
      equip: {
        allow: [],
        forbidden: [{ itemType: 'armor' }],
        bypassAllow: [{ item: 'armor_raider_chest_001' }],
        bypassForbidden: [{ item: 'armor_raider_chest_001' }],
      },
    };
    const res = classifyItemAccess(item('armor_raider_chest_001', 'armor'), ACTIONS.EQUIP, profile, CATEGORIES);
    expect(res.status).toBe('conflict');
  });

  it('getBranch возвращает нужную ветку', () => {
    const profile = { equip: { allow: [] }, consume: { self: { allow: ['x'] }, other: {} } };
    expect(getBranch(profile, ACTIONS.EQUIP)).toEqual({ allow: [] });
    expect(getBranch(profile, ACTIONS.CONSUME_SELF)).toEqual({ allow: ['x'] });
    expect(getBranch({}, ACTIONS.CONSUME_SELF)).toEqual({});
  });

  it('категория с несколькими префиксами через any', () => {
    expect(classify('robot', item('robot_armor_factory_body', 'armor')).status).toBe('allowed');
    expect(classify('robot', item('headwear_casual_hat', 'clothing')).status).toBe('allowed');
  });
});
