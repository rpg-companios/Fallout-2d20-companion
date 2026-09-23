// ПРИЁМОЧНЫЙ (патч 342): слова владельца о модах брони.
//   1) «Мод универсальный, на любую часть тела, если не указано иное»:
//      материал (Вываренная кожа) ставится на любой предмет своего семейства;
//   2) «МАТЕРИАЛ БРОНИ ≠ МОДИФИКАЦИЯ БРОНИ»: броня принимает 1 материал
//      + 1 модификацию (два независимых слота);
//   3) настройка «Требовать мод в сумке»: выключена (по умолчанию) — установка
//      свободна; включена — только моды, созданные/найденные (есть в сумке).
import { describe, expect, it } from 'vitest';

import settingsJson from '../../modules/fallout/settings.json';
import ruSettings from '../../modules/fallout/i18n/ru-RU/data/system/settings.json';
import enSettings from '../../modules/fallout/i18n/en-EN/data/system/settings.json';
import ruScreen from '../../i18n/ru-RU/screens/weaponsAndArmor/screen.json';
import enScreen from '../../i18n/en-EN/screens/weaponsAndArmor/screen.json';
import { filterModsByInventory } from '../../domain/modsEquip';
import { readFileSync } from 'node:fs';

const ROOT = new URL('../../', import.meta.url).pathname;
const modalSource = () => readFileSync(
  `${ROOT}modules/fallout/screens/WeaponsAndArmorScreen/modal/ArmorModificationModal.js`, 'utf8');

const syntheticCatalog = {
  armorRaw: {
    leatherArmor: {
      allowedModCategories: ['standardMods'],
      allowedUniqueModCategories: ['leatherUniqueMods'],
    },
  },
  armorMods: [
    { id: 'mod_std_dense', modCategory: 'standardMods', protectedAreas: ['Body'] },
    { id: 'mod_std_melee', modCategory: 'standardMods', protectedAreas: ['Hand'] },
  ],
  uniqArmorMods: [
    { id: 'uniq_leather_boiled', modCategory: 'leatherUniqueMods', protectedAreas: ['Body', 'Hand', 'Leg'] },
    { id: 'uniq_metal_painted', modCategory: 'metalUniqueMods', protectedAreas: ['Body', 'Hand', 'Leg'] },
  ],
};
const leatherItem = { itemType: 'armor', armorCategoryKey: 'leatherArmor', protectedAreas: ['Body', 'Hand', 'Leg'] };

describe('патч 342: универсальный мод, 1 материал + 1 мод, гейт сумки', () => {
  it('материал семейства подходит любой части брони семейства (универсальность)', async () => {
    const { getAvailableArmorMods } = await import('../../domain/modsEquip');
    const { standardMods, uniqueMods } = getAvailableArmorMods(leatherItem, syntheticCatalog);
    // универсальный материал кожаного семейства — доступен (зоны пересекаются)
    expect(uniqueMods.map((m) => m.id)).toContain('uniq_leather_boiled');
    // чужое семейство не просачивается
    expect(uniqueMods.map((m) => m.id)).not.toContain('uniq_metal_painted');
    // зонные моды — по пересечению зон
    expect(standardMods.map((m) => m.id)).toContain('mod_std_dense');
    expect(standardMods.map((m) => m.id)).toContain('mod_std_melee');
  });

  it('настройка объявлена, по умолчанию ВЫКЛ (свободная установка), i18n на месте', () => {
    const entry = settingsJson.find((s) => s.id === 'modsRequireInventoryItem');
    expect(entry, 'настройка в settings.json').toBeTruthy();
    expect(entry.sectionKey).toBe('crafting');
    expect(entry.defaultValue).toBe(false); // выключена: установка свободна
    expect(ruSettings.modsRequireInventoryTitle).toContain('сумке');
    expect(enSettings.modsRequireInventoryTitle).toContain('bag');
  });

  it('гейт фильтрует по сумке: есть мод — виден, нет — скрыт с пометкой', () => {
    const mods = syntheticCatalog.armorMods;
    const owned = new Set(['mod_std_dense']);
    expect(filterModsByInventory(mods, null).length).toBe(2); // гейт выключен — все
    expect(filterModsByInventory(mods, owned).map((m) => m.id)).toEqual(['mod_std_dense']);
    expect(filterModsByInventory(mods, new Set()).length).toBe(0);
  });

  it('окно установки подключено: настройка, фильтр, пометка, названия разделов', () => {
    const src = modalSource();
    expect(src).toContain("getSettingValue('modsRequireInventoryItem')");
    expect(src).toContain('filterModsByInventory');
    expect(src).toContain('modsNotInInventory');
    // материал vs модификация — словами владельца, не «стандартные/уникальные»
    expect(ruScreen.modals.standard).toBe('Модификации');
    expect(ruScreen.modals.unique).toBe('Материал брони');
    expect(enScreen.modals.standard).toBe('Modifications');
    expect(enScreen.modals.unique).toBe('Armor material');
  });
});
