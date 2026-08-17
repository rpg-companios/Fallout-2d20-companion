/**
 * Комплекты Омерты и Белой перчатки (полные составы) + новые предметы:
 * 10-мм ПП (вариант ПП), маска Общества, фишка «Гоморры», авто-переброс
 * (rerollUntil: алкоголь/мясо).
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';

vi.mock('../../db/Database', async () => {
  const catalog = await import('../../db/catalogSource');
  return {
    getWeaponById: async (id) => catalog.catalogGetWeaponById(id),
    getWeaponModById: async (id) => catalog.catalogGetWeaponModById(id),
    getAmmoById: async (id) => catalog.catalogGetAmmoById(id),
    getItemByName: async (name) => catalog.catalogGetItemByName(name),
  };
});

import { getEquipmentCatalogForLocale } from '../../domain/registry';
import { resolveKitItems, resolveWeaponItem } from '../../domain/kitResolver';
import { catalogGetWeaponMods } from '../../db/catalogSource';
import { setCurrentLocale, setCurrentModuleLocale } from '../../i18n/locale';
import useCharacterStore from '../../src/store/characterStore';

beforeAll(() => {
  setCurrentLocale('ru-RU');
  setCurrentModuleLocale('ru-RU');
});

describe('Новые предметы модуля', () => {
  it('10-мм пистолет-пулемёт — отдельное оружие со статами из книги', () => {
    const catalog = getEquipmentCatalogForLocale('ru-RU');
    const smg = catalog.weapons.find((w) => w.id === 'weapon_10mm_smg');
    expect(smg).toBeDefined();
    expect(smg.name).toBe('10-мм пистолет-пулемёт');
    expect(smg.trueItemId).toBeUndefined(); // не вариант — своё оружие
    expect(smg.damage).toBe(4); // урон 4 {/CD}
    expect(smg.fireRate).toBe(3);
    expect(smg.range).toBe('C');
    expect(smg.weight).toBe('10');
    expect(smg.cost).toBe(129);
    expect(smg.rarity).toBe(1);
    expect(smg.ammoId).toBe('ammo_10mm'); // 10-мм патроны
    expect(smg.qualities).toEqual([{ qualityId: 'quality_inaccurate' }]);
    expect(smg.effects).toEqual([{ effectId: 'effect_burst' }]);
    expect(smg.mainSkill).toBe('SMALL_GUNS');
  });

  it('10-мм ПП принимает тот же набор модов, что и ПП (явно в applies_to_ids)', () => {
    const mods = catalogGetWeaponMods('weapon_10mm_smg');
    // набор модов ПП целиком доступен 10-мм ПП
    const smgModIds = new Set(catalogGetWeaponMods('weapon_submachine_gun').map((m) => m.id));
    const smgModIdsFor10mm = new Set(mods.map((m) => m.id));
    for (const id of smgModIds) {
      expect(smgModIdsFor10mm.has(id), id).toBe(true);
    }
    // у ПП при этом ничего не отобрали
    expect(smgModIds.size).toBeGreaterThanOrEqual(14);
  });

  it('выдача 10-мм ПП: своё оружие (weaponId = weapon_10mm_smg)', async () => {
    const item = await resolveWeaponItem({
      type: 'fixed',
      weaponId: 'weapon_10mm_smg',
      itemType: 'weapon',
    });
    expect(item.weaponId).toBe('weapon_10mm_smg');
    expect(item.variantId).toBeUndefined();
    expect(item.baseName).toBeUndefined();
    expect(item.name).toBe('10-мм пистолет-пулемёт');
    expect(item._weapon.damage).toBe(4);
    expect(item.ammoId).toBe('ammo_10mm');
  });

  it('маска Общества «Белая перчатка» в каталоге одежды', () => {
    const catalog = getEquipmentCatalogForLocale('ru-RU');
    const mask = (catalog.clothes?.clothes || [])
      .flatMap((g) => g.items || [])
      .find((i) => i.id === 'headwear_white_glove_mask');
    expect(mask).toBeDefined();
    expect(mask.name).toBe('Маска Общества «Белая перчатка»');
    expect(mask.clothingType).toBe('headwear');
    expect(mask.protectedAreas).toEqual(['Head']);
  });

  it('фишка казино «Гоморра» — value 50', () => {
    const catalog = getEquipmentCatalogForLocale('ru-RU');
    const chip = catalog.generalGoods.find((i) => i.id === 'CasinoGomorrahChip');
    expect(chip).toBeDefined();
    expect(chip.value).toBe(50);
    expect(chip.name).toBe('Фишка казино «Гоморра»');
  });
});

describe('Комплект Омерты', () => {
  it('полный состав: дерзкая одежда, выбор нож/кастеты, фишка, безделушка, 2 хим-броска, алкоголь', async () => {
    const catalog = getEquipmentCatalogForLocale('ru-RU');
    const kit = catalog.equipmentKits.treefamilies_omerta;
    const resolved = await resolveKitItems({ id: 'treefamilies_omerta', items: kit.items });

    const clothes = resolved.items.find((i) => i.clothingId === 'clothing_fancy_clothes');
    expect(clothes.uniqQualities).toEqual(['dashing']);
    expect(clothes.name).toBe('Дерзкая Формальная одежда');

    const choice = resolved.items.find((i) => i.type === 'choice');
    expect(choice.items.map((o) => o.weaponId)).toEqual(['weapon_combat_knife', 'weapon_knuckles']);

    const chip = resolved.items.find((i) => i.id === 'CasinoGomorrahChip');
    expect(chip).toBeDefined();

    // личная безделушка (бросок по oddity)
    const trinket = resolved.items.find((i) => i.itemType === 'misc' && i.id !== 'CasinoGomorrahChip');
    expect(trinket).toBeDefined();

    // два броска по таблице препаратов (в таблице есть и грязная вода —
    // roll 20–22, как в книге: бросок может вернуть напиток, это нормально)
    const chemRollItems = resolved.items.filter((i) => i.itemType === 'chem' || i.id === 'drink_dirty_water');
    expect(chemRollItems.length).toBe(2);

    // один бросок по таблице напитков с авто-перебросом: результат — алкоголь
    // (единственный алкогольный предмет в выдаче)
    const alcoholic = resolved.items.filter((i) => i.isAlcohol === true);
    expect(alcoholic.length).toBe(1);
  });
});

describe('Комплект Общества «Белая перчатка»', () => {
  it('полный состав: изысканная одежда, маска, выбор трость/нож, огнемёт, безделушка, мясо, выбор обрез/10-мм ПП', async () => {
    const catalog = getEquipmentCatalogForLocale('ru-RU');
    const kit = catalog.equipmentKits.treefamilies_white_glove;
    const resolved = await resolveKitItems({ id: 'treefamilies_white_glove', items: kit.items });

    const clothes = resolved.items.find((i) => i.clothingId === 'clothing_fancy_clothes');
    expect(clothes.uniqQualities).toEqual(['refined']);
    expect(clothes.name).toBe('Изысканная Формальная одежда');

    const mask = resolved.items.find((i) => i.clothingId === 'headwear_white_glove_mask');
    expect(mask).toBeDefined();
    expect(mask.name).toBe('Маска Общества «Белая перчатка»');

    const choices = resolved.items.filter((i) => i.type === 'choice');
    const caneChoice = choices.find((c) => c.items.some((o) => o.weaponId === 'weapon_walking_cane'));
    expect(caneChoice.items.map((o) => o.weaponId)).toEqual(['weapon_walking_cane', 'weapon_combat_knife']);

    // огнемёт с топливом 12+6 CD
    const flamer = resolved.items.find((i) => i.weaponId === 'weapon_flamer');
    expect(flamer).toBeDefined();
    expect(flamer.resolvedAmmunition.id).toBe('ammo_flamer_fuel');
    expect(flamer.resolvedAmmunition.quantity).toBeGreaterThanOrEqual(12);
    expect(flamer.resolvedAmmunition.quantity).toBeLessThanOrEqual(24);

    // три броска по таблице еды (переброс «до мяса» — см. вопрос по данным:
    // в таблице еды data/loot/food.json пока нет ни одной мясной позиции)
    const foodItems = resolved.items.filter((i) => i.itemType === 'food' || (i.id || '').startsWith('food_'));
    expect(foodItems.length).toBe(3);

    // выбор: обрез (дробовик + сверхкороткий ствол) или 10-мм ПП
    const weaponChoice = choices.find((c) => c.items.some((o) => o.modIds?.includes('mod_020')));
    expect(weaponChoice).toBeDefined();
    const sawedOff = weaponChoice.items.find((o) => o.weaponId === 'weapon_double_barrel_shotgun');
    expect(sawedOff.modIds).toEqual(['mod_020']);
    expect(sawedOff.appliedMods).toEqual({ Barrel: 'mod_020' });
    expect(sawedOff.resolvedAmmunition.id).toBe('ammo_shotgun_shell');
    expect(sawedOff.resolvedAmmunition.quantity).toBeGreaterThanOrEqual(6);
    expect(sawedOff.resolvedAmmunition.quantity).toBeLessThanOrEqual(12);
    const smgOption = weaponChoice.items.find((o) => o.weaponId === 'weapon_10mm_smg');
    expect(smgOption).toBeDefined();
    expect(smgOption.resolvedAmmunition.id).toBe('ammo_10mm');
    expect(smgOption.resolvedAmmunition.quantity).toBeGreaterThanOrEqual(16);
    expect(smgOption.resolvedAmmunition.quantity).toBeLessThanOrEqual(24);
  });
});

describe('Дубль предметов из комплекта', () => {
  it('резолв комплекта Омерты не содержит дублей (по одному каждого)', async () => {
    const catalog = getEquipmentCatalogForLocale('ru-RU');
    const kit = catalog.equipmentKits.treefamilies_omerta;
    const resolved = await resolveKitItems({ id: 'treefamilies_omerta', items: kit.items });
    const flat = resolved.items.flatMap((i) => [i, ...(i._extraItems || [])]);
    const counts = {};
    flat.forEach((i) => {
      const key = i.weaponId || i.id || i.itemId || i.clothingId || i.tableId || i.name;
      counts[key] = (counts[key] || 0) + 1;
    });
    expect(counts['clothing_fancy_clothes']).toBe(1); // одежда — одна
    expect(counts['CasinoGomorrahChip']).toBe(1); // фишка — одна
    // выбор «нож или кастеты» — одна запись choice с двумя опциями (по одной)
    const choice = resolved.items.find((i) => i.type === 'choice');
    expect(choice.items.map((o) => o.weaponId)).toEqual(['weapon_combat_knife', 'weapon_knuckles']);
  });

  it('повторная выдача того же комплекта после сброса — один комплект, не два', () => {
    const store = useCharacterStore;
    store.setState({ items: {} });
    // первый проход (как handleSelectKit после патча 72: при equipment — сброс)
    const grant = (name) => {
      store.getState().addNewItem({ weaponId: 'clothing_fancy_clothes', itemType: 'clothing', name, uniqQualities: ['dashing'], equipped: false, locked: false });
      store.getState().addNewItem({ weaponId: 'CasinoGomorrahChip', itemType: 'misc', name: 'Фишка', equipped: false, locked: false });
    };
    grant('Дерзкая Формальная одежда');
    // повторный проход: сброс инвентаря (resetKitAndRewards очищает items), затем выдача
    store.setState({ items: {} });
    grant('Дерзкая Формальная одежда');
    const items = store.getState().items;
    const clothes = Object.values(items).find((i) => i.weaponId === 'clothing_fancy_clothes');
    const chip = Object.values(items).find((i) => i.weaponId === 'CasinoGomorrahChip');
    expect(clothes.quantity).toBe(1);
    expect(chip.quantity).toBe(1);
    expect(Object.keys(items)).toHaveLength(2);
  });
});

describe('rerollUntil: защита от пустых таблиц', () => {
  it('таблица без подходящих позиций завершается и возвращает результат как есть', async () => {
    // oddity не имеет поля isAlcohol — переброс исчерпает попытки и вернёт бросок.
    const catalog = getEquipmentCatalogForLocale('ru-RU');
    const resolved = await resolveKitItems({
      id: 'reroll_guard_test',
      items: [
        { type: 'rollTable', tableId: 'oddity', roll: { rollType: 'D20', count: 1, mode: 'separate' },
          rerollUntil: { isAlcohol: true } },
      ],
    });
    expect(resolved.items.length).toBe(1);
    expect(resolved.items[0].id).toBeTruthy();
  });
});
