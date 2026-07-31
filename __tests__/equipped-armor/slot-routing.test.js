import { describe, it, expect } from 'vitest';
import dataClothes from '../../data/equipment/clothes.json';
import {
  createEmptyEquippedArmor,
  resolveTargetLayer,
  blocksArmorOver,
} from '../../domain/equippedArmor';

// ПРАВИЛО ВЛАДЕЛЬЦА: слот armor — только броне, слот clothing — только одежде.
// Одежда, запрещающая броню поверх (outfit, allowsArmor: false), блокирует её
// ВЫЧИСЛЕНИЕМ (blocksArmorOver), а не переездом в чужой слот.
// ПРАВИЛО ВЛАДЕЛЬЦА (2026-07-31): никакого легаси, нормализаторов и фоллбэков.
const getClothing = (id) =>
  dataClothes.clothes
    .flatMap((g) => g.items.map((it) => ({ ...g, ...it, type: g.type })))
    .find((i) => i.id === id);

describe('createEmptyEquippedArmor — единая пустая карта слотов', () => {
  it('шесть ровных слотов, ни одного предмета', () => {
    const map = createEmptyEquippedArmor();
    expect(Object.keys(map).sort()).toEqual(['body', 'head', 'leftArm', 'leftLeg', 'rightArm', 'rightLeg']);
    Object.values(map).forEach((slot) => expect(slot).toEqual({ armor: null, clothing: null }));
  });

  it('каждый вызов — независимые объекты (нет общих ссылок)', () => {
    const a = createEmptyEquippedArmor();
    const b = createEmptyEquippedArmor();
    a.body.armor = { id: 'x' };
    expect(b.body.armor).toBeNull();
  });
});

describe('resolveTargetLayer — в какой слот класть предмет', () => {
  it('броня → armor (по itemType или семейному ключу из данных)', () => {
    expect(resolveTargetLayer({ id: 'armor_raider_chest_001', itemType: 'armor' })).toBe('armor');
    expect(resolveTargetLayer({ id: 'any', armorCategoryKey: 'leatherArmor' })).toBe('armor');
  });

  it('любая одежда → clothing: костюм, обмундирование, головной убор', () => {
    expect(resolveTargetLayer(getClothing('clothing_sturdy_clothes'))).toBe('clothing');
    expect(resolveTargetLayer(getClothing('clothing_nomad_outfit'))).toBe('clothing');
    expect(resolveTargetLayer(getClothing('headwear_gas_mask'))).toBe('clothing');
    expect(resolveTargetLayer({ id: 'x', itemType: 'outfit' })).toBe('clothing');
  });

  it('ПРАВИЛО: прочее → null (не экипируется; фоллбэков нет)', () => {
    expect(resolveTargetLayer({ id: 'misc_junk' })).toBeNull();
    expect(resolveTargetLayer(null)).toBeNull();
    // «броневой» id без явных полей вида — тоже null: префикс id — не основание
    expect(resolveTargetLayer({ id: 'armor_leather_chest_001' })).toBeNull();
  });
});

describe('blocksArmorOver — одежда, запрещающая броню поверх (реальные данные)', () => {
  it('обмундирование блокирует броню', () => {
    expect(blocksArmorOver(getClothing('clothing_nomad_outfit'))).toBe(true);
    expect(blocksArmorOver(getClothing('clothing_bos_scribe_armor'))).toBe(true);
  });

  it('костюм — нет (носится под бронёй)', () => {
    expect(blocksArmorOver(getClothing('clothing_sturdy_clothes'))).toBe(false);
  });

  it('головной убор блокирует шлем (allowsArmor: false в данных)', () => {
    expect(blocksArmorOver(getClothing('headwear_gas_mask'))).toBe(true);
  });

  it('броня и прочие предметы — никогда', () => {
    expect(blocksArmorOver({ id: 'armor_metal_chest_001', itemType: 'armor' })).toBe(false);
    expect(blocksArmorOver({ id: 'misc_junk' })).toBe(false);
    expect(blocksArmorOver(null)).toBe(false);
  });
});
