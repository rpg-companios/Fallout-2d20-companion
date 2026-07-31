import { describe, it, expect } from 'vitest';
import dataArmor from '../../data/equipment/armor.json';
import dataClothes from '../../data/equipment/clothes.json';
import dataArmorMods from '../../data/equipment/armor_mods.json';
import dataUniqArmorMods from '../../data/equipment/uniq_armor_mods.json';
import {
  getAvailableArmorMods,
  isUniqueModAllowedForArmor,
  applyArmorMods,
} from '../../domain/modsEquip';
import { getProtectionKind, resolveArmorCategoryKey, PROTECTION_KINDS } from '../../domain/protectionKind';

// Тест читает сырые JSON-данные напрямую (без react/db), собирая минимальный
// «каталог» в том же виде, в каком его отдаёт i18n/equipmentCatalog.
const catalog = {
  armorRaw: dataArmor,
  armorMods: dataArmorMods,
  uniqArmorMods: dataUniqArmorMods,
  armorEffects: {},
};

// ПРАВИЛО ВЛАДЕЛЬЦА: уникальные модификации брони — строго по типу брони.
// У каждой категории брони свой набор уникальных модов. Неизвестная категория →
// уникальных модов нет вообще, а не «все для всех».
const FAMILY = {
  raiderArmor: 'raiderUniqueMods',
  leatherArmor: 'leatherUniqueMods',
  metalArmor: 'metalUniqueMods',
  combatArmor: 'combatUniqueMods',
  synthArmor: 'synthUniqueMods',
  vaultSecurityArmor: 'vaultUniqueMods', // таких модов в данных пока нет
};

const onePiece = (categoryKey) => {
  const tiers = dataArmor[categoryKey]?.tiers || {};
  const pieces = Object.values(tiers).flatMap((t) => t.pieces || []);
  if (!pieces.length) throw new Error(`no pieces for ${categoryKey}`);
  return { ...pieces[0], armorCategoryKey: categoryKey };
};

describe('unique armor mods — строго по типу брони', () => {
  it('каждая категория показывает ТОЛЬКО свои уникальные моды', () => {
    for (const [categoryKey, modCategory] of Object.entries(FAMILY)) {
      const piece = onePiece(categoryKey);
      const { uniqueMods } = getAvailableArmorMods(piece, catalog);
      const expected = dataUniqArmorMods.filter((m) => m.modCategory === modCategory);
      expect(new Set(uniqueMods.map((m) => m.modCategory)), categoryKey)
        .toEqual(expected.length ? new Set([modCategory]) : new Set());
      expect(uniqueMods.length, categoryKey).toBe(expected.length);
    }
  });

  it('ни один уникальный мод не доступен чужой категории', () => {
    for (const mod of dataUniqArmorMods) {
      for (const categoryKey of Object.keys(FAMILY)) {
        const piece = onePiece(categoryKey);
        const allowed = isUniqueModAllowedForArmor(mod, piece, catalog);
        const shouldBeAllowed = FAMILY[categoryKey] === mod.modCategory;
        expect(allowed, `${mod.id} on ${categoryKey}`).toBe(shouldBeAllowed);
      }
    }
  });

  it('броня с неизвестной/несуществующей категорией НЕ получает модов вообще (fail-closed)', () => {
    // Сценарий из бага: «Доспехи писца Братства» — предмет, которого нет в каталоге брони.
    // ПРАВИЛО ВЛАДЕЛЬЦА (2026-07-31): нет явного семейства → модов нет, даже «универсальных».
    const orphanItem = { id: 'armor_bos_scribe_worn', protectedAreas: ['Body', 'Hand', 'Leg'] };
    const { uniqueMods, standardMods } = getAvailableArmorMods(orphanItem, catalog);
    expect(uniqueMods).toEqual([]);
    expect(standardMods).toEqual([]);
  });

  it('категория строго из armorCategoryKey — без угадывания по id (легаси-веток нет)', () => {
    expect(resolveArmorCategoryKey({ id: 'any', armorCategoryKey: 'leatherArmor' }, catalog)).toBe('leatherArmor');
    expect(resolveArmorCategoryKey({ id: 'armor_leather_chest_001' }, catalog)).toBeNull();
    expect(resolveArmorCategoryKey({ id: 'any', armorCategoryKey: 'unknownCategory' }, catalog)).toBeNull();
    expect(resolveArmorCategoryKey(null, catalog)).toBeNull();
  });

  it('броня без armorCategoryKey → модов нет вообще (ни уникальных, ни стандартных)', () => {
    const legacy = { id: 'armor_raider_chest_001', protectedAreas: ['Body'] };
    const { uniqueMods, standardMods } = getAvailableArmorMods(legacy, catalog);
    expect(uniqueMods).toEqual([]);
    expect(standardMods).toEqual([]);
  });

  it('applyArmorMods НЕ применяет уникальный мод чужой категории', () => {
    const metalChest = onePiece('metalArmor');
    const foreign = dataUniqArmorMods.find((m) => m.modCategory === 'leatherUniqueMods');
    const own = dataUniqArmorMods.find((m) => m.modCategory === 'metalUniqueMods');

    const withForeign = applyArmorMods({ ...metalChest, appliedUniqueArmorModId: foreign.id }, catalog);
    expect(withForeign.item.physicalDamageRating).toBe(metalChest.physicalDamageRating);
    expect(withForeign.item.appliedArmorModsMeta ?? []).toHaveLength(0);

    const withOwn = applyArmorMods({ ...metalChest, appliedUniqueArmorModId: own.id }, catalog);
    expect((withOwn.item.appliedArmorModsMeta ?? []).map((m) => m.id)).toEqual([own.id]);
  });

  it('данные неизменны: у каждой категории брони заявлен ровно один семейный набор уникальных модов', () => {
    for (const [categoryKey, modCategory] of Object.entries(FAMILY)) {
      expect(dataArmor[categoryKey].allowedUniqueModCategories).toEqual([modCategory]);
    }
  });
});

// ПРАВИЛО ВЛАДЕЛЬЦА: одежда (обмундирование, костюмы) — НЕ броня.
// Моды брони на одежду не ставятся и не действуют — даже если одежда
// экипирована в слот брони (outfit с allowsArmor:false) и имеет protectedAreas.
describe('одежда не является бронёй — моды брони недоступны', () => {
  const getClothing = (id) =>
    dataClothes.clothes.flatMap((g) => g.items).find((i) => i.id === id);

  it.each(['clothing_sturdy_clothes', 'clothing_nomad_outfit'])(
    '%s (обмундирование/костюм) не получает ни стандартных, ни уникальных модов',
    (id) => {
      const item = getClothing(id);
      expect(item).toBeTruthy();
      const { standardMods, uniqueMods } = getAvailableArmorMods(item, catalog);
      expect(uniqueMods).toEqual([]);
      expect(standardMods).toEqual([]);
    },
  );

  it('applyArmorMods не применяет никакие моды к одежде (даже записанные ранее)', () => {
    const suit = getClothing('clothing_sturdy_clothes');
    const std = dataArmorMods[0];
    const uniq = dataUniqArmorMods[0];
    const { item } = applyArmorMods(
      { ...suit, appliedArmorModId: std.id, appliedUniqueArmorModId: uniq.id },
      catalog,
    );
    expect(item.physicalDamageRating).toBe(suit.physicalDamageRating);
    expect(item.energyDamageRating).toBe(suit.energyDamageRating);
    expect(item.appliedArmorModsMeta ?? []).toHaveLength(0);
  });

  it('броня по-прежнему получает моды (контроль регресса)', () => {
    const metalChest = onePiece('metalArmor');
    const own = dataUniqArmorMods.find((m) => m.modCategory === 'metalUniqueMods');
    const { item } = applyArmorMods({ ...metalChest, appliedUniqueArmorModId: own.id }, catalog);
    expect(item.physicalDamageRating).not.toBe(metalChest.physicalDamageRating);
  });
});

// ПРАВИЛО ВЛАДЕЛЬЦА: вид защиты определяется только полями данных
// (itemType/clothingType/семейство брони) — НЕ названием и НЕ слотом,
// в котором предмет лежит. Неизвестный вид → null → модов нет.
describe('getProtectionKind — единый определитель вида защиты', () => {
  it('броня → armor: по itemType или по явному семейному ключу из данных', () => {
    expect(getProtectionKind({ id: 'armor_leather_chest_001', itemType: 'armor', armorCategoryKey: 'leatherArmor' }))
      .toBe(PROTECTION_KINDS.ARMOR);
    expect(getProtectionKind({ id: 'any', armorCategoryKey: 'vaultSecurityArmor' })).toBe(PROTECTION_KINDS.ARMOR);
    expect(getProtectionKind({ id: 'any', itemType: 'armor' })).toBe(PROTECTION_KINDS.ARMOR);
  });

  it('одежда → clothing: обмундирование, костюм, головной убор (реальные данные)', () => {
    const getClothing = (id) =>
      dataClothes.clothes.flatMap((g) => g.items).find((i) => i.id === id);
    expect(getProtectionKind(getClothing('clothing_nomad_outfit'))).toBe(PROTECTION_KINDS.CLOTHING);
    expect(getProtectionKind(getClothing('clothing_sturdy_clothes'))).toBe(PROTECTION_KINDS.CLOTHING);
    expect(getProtectionKind(getClothing('headwear_gas_mask'))).toBe(PROTECTION_KINDS.CLOTHING);
    expect(getProtectionKind({ id: 'x', itemType: 'outfit' })).toBe(PROTECTION_KINDS.CLOTHING);
  });

  it('силовая броня → powerArmor по itemType из данных (не по названию)', () => {
    expect(getProtectionKind({ id: 'power_armor_t45_chest', itemType: 'powerArmor' }))
      .toBe(PROTECTION_KINDS.POWER_ARMOR);
  });

  it('не защита / мусор / предмет без явных полей → null (угадывания нет)', () => {
    expect(getProtectionKind(null)).toBeNull();
    expect(getProtectionKind({})).toBeNull();
    expect(getProtectionKind({ id: 'chem_radaway', itemType: 'chem' })).toBeNull();
    // даже «броневой» id без явных полей вида — null: префиксов id больше нет
    expect(getProtectionKind({ id: 'armor_raider_chest_001' })).toBeNull();
  });

  it('ПРАВИЛО: название не влияет — «силовая броня» в имени не делает предмет силовой', () => {
    const tricky = { id: 'armor_combat_chest_001', itemType: 'armor', name: 'Силовая боевая броня' };
    expect(getProtectionKind(tricky)).toBe(PROTECTION_KINDS.ARMOR);
  });

  it('инвариант: моды брони доступны строго тогда, когда вид = armor', () => {
    const cases = [
      [{ ...onePiece('leatherArmor'), itemType: 'armor' }, true],
      [{ id: 'clothing_nomad_outfit', itemType: 'clothing', clothingType: 'outfit', protectedAreas: ['Body', 'Hand', 'Leg'] }, false],
      [{ id: 'power_armor_t45_chest', itemType: 'powerArmor', protectedAreas: ['Body'] }, false],
      [{ id: 'misc_junk' }, false],
    ];
    for (const [item, expectAvailable] of cases) {
      const { standardMods, uniqueMods } = getAvailableArmorMods(item, catalog);
      expect(standardMods.length + uniqueMods.length > 0, item.id).toBe(expectAvailable);
      expect(getProtectionKind(item) === PROTECTION_KINDS.ARMOR, item.id).toBe(expectAvailable);
    }
  });
});

