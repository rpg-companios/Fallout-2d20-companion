import { describe, it, expect } from 'vitest';
import dataArmor from '../../data/equipment/armor.json';
import dataArmorMods from '../../data/equipment/armor_mods.json';
import dataUniqArmorMods from '../../data/equipment/uniq_armor_mods.json';
import {
  getAvailableArmorMods,
  resolveArmorCategoryKey,
  isUniqueModAllowedForArmor,
  applyArmorMods,
} from '../../domain/modsEquip';

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

  it('броня с неизвестной/несуществующей категорией НЕ получает уникальные моды (fail-closed)', () => {
    // Сценарий из бага: «Доспехи писца Братства» — предмет, которого нет в каталоге брони.
    const orphanItem = { id: 'armor_bos_scribe_worn', protectedAreas: ['Body', 'Hand', 'Leg'] };
    const { uniqueMods, standardMods } = getAvailableArmorMods(orphanItem, catalog);
    expect(uniqueMods).toEqual([]);
    // стандартные моды универсальны — остаются доступны
    expect(standardMods.length).toBeGreaterThan(0);
  });

  it('категория определяется по префиксу id, если armorCategoryKey отсутствует', () => {
    expect(resolveArmorCategoryKey({ id: 'armor_leather_chest_001' }, catalog)).toBe('leatherArmor');
    expect(resolveArmorCategoryKey({ id: 'armor_metal_head_003' }, catalog)).toBe('metalArmor');
    expect(resolveArmorCategoryKey({ id: 'armor_vault_fullbody_001' }, catalog)).toBe('vaultSecurityArmor');
    expect(resolveArmorCategoryKey({ id: 'armor_unknown_x' }, catalog)).toBeNull();
  });

  it('у старого сохранённого предмета без armorCategoryKey — свои моды определяются по id', () => {
    const legacy = { id: 'armor_raider_chest_001', protectedAreas: ['Body'] };
    const { uniqueMods } = getAvailableArmorMods(legacy, catalog);
    expect(uniqueMods.length).toBeGreaterThan(0);
    expect(new Set(uniqueMods.map((m) => m.modCategory))).toEqual(new Set(['raiderUniqueMods']));
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
