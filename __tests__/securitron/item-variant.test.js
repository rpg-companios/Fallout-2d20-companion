/**
 * Вариант предмета (trueItemId + modifiers): «Опасная бритва» — НЕ
 * самостоятельный предмет.
 *
 * Модель: запись читается как модификаторы —
 *   { id: weapon_straight_razor, trueItemId: weapon_switchblade,
 *     modifiers: { replaceOriginalNameTo: weapon_straight_razor } }
 * «истинный id предмета» (weapon_switchblade) даёт механику (статы, качество,
 * эффекты, моды); «перезаписать оригинальное имя» — имя из i18n-ключа.
 *
 * В инвентаре вариант живёт под ИСТИННЫМ id (для программы это нож), а стек
 * разделяется именем: бритва и нож — разные стеки, две бритвы — один стек.
 * Моды истинного предмета доступны варианту без всяких алиасов.
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

import { getEquipmentCatalogForLocale, getModuleWeapons } from '../../domain/registry';
import { expandTrueItems, applyVariantModifiers } from '../../domain/packMerge';
import { resolveWeaponItem } from '../../domain/kitResolver';
import { generateStackKey, generateItemId } from '../../domain/itemIdentity';
import { migrateCharacterState } from '../../src/store/migrations';
import { setCurrentLocale } from '../../i18n/locale';
import useCharacterStore from '../../src/store/characterStore';
import moduleWeapons from '../../modules/fallout/data/weapons.json';
import dataWeapons from '../../data/equipment/weapons.json';

beforeAll(() => {
  // catalogSource строит каталог по текущей локали (в CI Intl даёт en-EN).
  setCurrentLocale('ru-RU');
});

const switchbladeStats = {
  damage: 2,
  fireRate: 0,
  weight: '1',
  cost: 20,
  rarity: 0,
  ammoId: '',
  range: '',
  mainAttr: 'STR',
  mainSkill: 'MELEE_WEAPONS',
  hasStockVariant: false,
  damageType: 'physical',
  weaponType: 'Melee',
};

describe('Запись варианта в модуле (читается как модификаторы)', () => {
  it('бритва — тонкая запись: trueItemId + replaceOriginalNameTo, без статов и имени', () => {
    const razor = moduleWeapons.find((w) => w.id === 'weapon_straight_razor');
    expect(razor).toBeDefined();
    expect(razor.trueItemId).toBe('weapon_switchblade'); // истинный id предмета
    expect(razor.modifiers.replaceOriginalNameTo).toBe('weapon_straight_razor'); // перезапись имени
    expect(razor.damage).toBeUndefined(); // своих статов нет
    expect(razor.name).toBeUndefined(); // имя — только в i18n
  });
});

describe('Разворачивание варианта в каталоге', () => {
  it('механика ножа, id и имя (из i18n) — бритвы (ru)', () => {
    const catalog = getEquipmentCatalogForLocale('ru-RU');
    const razor = catalog.weapons.find((w) => w.id === 'weapon_straight_razor');
    expect(razor).toBeDefined();
    expect(razor.name).toBe('Опасная бритва'); // имя из i18n, не из данных
    expect(razor.trueItemId).toBe('weapon_switchblade');
    for (const [key, value] of Object.entries(switchbladeStats)) {
      expect(razor[key], key).toEqual(value);
    }
    expect(razor.qualities).toEqual([{ qualityId: 'quality_concealed' }]);
    expect(razor.effects).toEqual([{ effectId: 'effect_piercing_x' }]);
    // оригинальный нож на месте
    expect(catalog.weapons.find((w) => w.id === 'weapon_switchblade')).toBeDefined();
  });

  it('локаль EN: имя бритвы — Straight Razor (из i18n модуля)', () => {
    const catalog = getEquipmentCatalogForLocale('en-EN');
    expect(catalog.weapons.find((w) => w.id === 'weapon_straight_razor').name).toBe('Straight Razor');
  });

  it('getModuleWeapons разворачивает варианты', () => {
    const razor = getModuleWeapons().find((w) => w.id === 'weapon_straight_razor');
    expect(razor.trueItemId).toBe('weapon_switchblade');
    expect(razor.damage).toBe(2);
  });

  it('точечный модификатор стата: «быстрый нож» наследует нож, fireRate +1', () => {
    const fastKnife = expandTrueItems(
      [{ id: 'weapon_test_fast_knife', trueItemId: 'weapon_switchblade', modifiers: { fireRateModifier: { op: '+', value: 1 } } }],
      dataWeapons,
    )[0];
    expect(fastKnife.damage).toBe(2); // 90% параметров — от ножа
    expect(fastKnife.fireRate).toBe(1); // точечная правка
    expect(fastKnife.trueItemId).toBe('weapon_switchblade');
  });

  it('applyVariantModifiers: операции + − × ÷ и замена значением', () => {
    const base = { damage: 10, cost: 20 };
    expect(applyVariantModifiers(base, { damageModifier: { op: '-', value: 2 } }).damage).toBe(8);
    expect(applyVariantModifiers(base, { costModifier: { op: '*', value: 2 } }).cost).toBe(40);
    expect(applyVariantModifiers(base, { damageModifier: { op: '/', value: 2 } }).damage).toBe(5);
    expect(applyVariantModifiers(base, { damageModifier: 7 }).damage).toBe(7);
    // не-числовые ключи и неизвестные поля игнорируются
    expect(applyVariantModifiers(base, { replaceOriginalNameTo: 'x' })).toBe(base);
    expect(applyVariantModifiers(base, { somethingModifier: { op: '+', value: 1 } })).toBe(base);
  });
});

describe('Выдача варианта: для программы это истинный предмет', () => {
  it('бритва приходит как нож (weaponId weapon_switchblade) с baseName', async () => {
    const item = await resolveWeaponItem({
      type: 'fixed',
      weaponId: 'weapon_straight_razor',
      itemType: 'weapon',
    });
    expect(item.weaponId).toBe('weapon_switchblade'); // истинный id
    expect(item.baseName).toBe('Опасная бритва'); // оригинальное имя (для стека/модов)
    expect(item.name).toBe('Опасная бритва');
    expect(item.displayName).toBe('Опасная бритва');
    expect(item._weapon.damage).toBe(2); // механика — от ножа
  });

  it('мод ножа собирает имя от перезаписанного: «Зазубренное лезвие Опасная бритва»', async () => {
    const item = await resolveWeaponItem({
      type: 'fixed',
      weaponId: 'weapon_straight_razor',
      itemType: 'weapon',
      modIds: ['mod_113'],
    });
    expect(item.displayName).toBe('Зазубренное лезвие Опасная бритва');
    expect(item.weaponId).toBe('weapon_switchblade');
  });
});

describe('Стек в инвентаре = id + прочие параметры + имя', () => {
  it('ключи: бритва и нож разделены именем, две бритвы совпадают', () => {
    const knife = generateStackKey('weapon_switchblade', {});
    const razor = generateStackKey('weapon_switchblade', {}, 'Опасная бритва');
    expect(knife).toBe('weapon_switchblade');
    expect(razor).toBe('weapon_switchblade_опасная_бритва'); // id + имя, без маркеров
    expect(knife).not.toBe(razor); // имя не совпало → разделяем
    expect(generateStackKey('weapon_switchblade', {}, 'Опасная бритва')).toBe(razor); // имя совпало → склеиваем
    // моды — как у ножа, но стек всё равно свой (id + моды + имя)
    expect(generateStackKey('weapon_switchblade', { Uniques: 'mod_113' }, 'Опасная бритва'))
      .toBe('weapon_switchblade_mods_mod_113_опасная_бритва');
  });

  it('прочность — параметр стека (закон): 50 ≠ 100, но два меча 50 — один стек', () => {
    const sword50 = generateStackKey('weapon_sword', {}, '', 50);
    const sword100 = generateStackKey('weapon_sword', {}, '', 100);
    expect(sword50).toBe('weapon_sword_dur_50');
    expect(sword100).toBe('weapon_sword_dur_100');
    expect(sword50).not.toBe(sword100); // разная прочность → разные стеки
    expect(generateStackKey('weapon_sword', {}, '', 50)).toBe(sword50); // 100% идентичные → один стек
    // без прочности ключ как раньше
    expect(generateStackKey('weapon_sword', {}, '', undefined)).toBe('weapon_sword');
  });

  it('generateItemId учитывает имя варианта и прочность', () => {
    expect(generateItemId('weapon_switchblade', {}, 'Опасная бритва'))
      .toBe('weapon_switchblade_опасная_бритва');
    expect(generateItemId('weapon_switchblade', {}, 'Опасная бритва', 75))
      .toBe('weapon_switchblade_dur_75_опасная_бритва');
  });

  it('addNewItem: нож+нож — один стек; нож+бритва — разные стеки; бритва+бритва — один', () => {
    const store = useCharacterStore;
    store.setState({ items: {} });
    store.getState().addNewItem({ weaponId: 'weapon_switchblade', itemType: 'weapon', name: 'Выкидной нож' });
    store.getState().addNewItem({ weaponId: 'weapon_switchblade', itemType: 'weapon', name: 'Выкидной нож' });
    const items = store.getState().items;
    const knifeKeys = Object.keys(items).filter((k) => !String(k).includes('_опасная_бритва'));
    expect(knifeKeys).toHaveLength(1);
    expect(items[knifeKeys[0]].quantity).toBe(2);

    store.setState({ items: {} });
    store.getState().addNewItem({ weaponId: 'weapon_switchblade', itemType: 'weapon', name: 'Выкидной нож' });
    store.getState().addNewItem({ weaponId: 'weapon_switchblade', itemType: 'weapon', name: 'Опасная бритва', baseName: 'Опасная бритва' });
    store.getState().addNewItem({ weaponId: 'weapon_switchblade', itemType: 'weapon', name: 'Опасная бритва', baseName: 'Опасная бритва' });
    const items2 = store.getState().items;
    expect(Object.keys(items2)).toHaveLength(2); // нож и бритва — разные стеки
    const razorKey = Object.keys(items2).find((k) => String(k).endsWith('_опасная_бритва'));
    expect(items2[razorKey].quantity).toBe(2); // две бритвы склеились
  });

  it('addNewItem (закон): одинаковые пушки с одинаковой прочностью — один стек, разная прочность — разные', () => {
    const store = useCharacterStore;
    store.setState({ items: {} });
    // Две 100% идентичные пушки (та же прочность, без своего ключа) → один стек.
    store.getState().addNewItem({ weaponId: 'weapon_sword', itemType: 'weapon', name: 'Меч', durabilityTracked: true, durability: 50 });
    store.getState().addNewItem({ weaponId: 'weapon_sword', itemType: 'weapon', name: 'Меч', durabilityTracked: true, durability: 50 });
    let items = store.getState().items;
    expect(Object.keys(items)).toHaveLength(1);
    expect(Object.values(items)[0].quantity).toBe(2);

    // Меч 100 прочности — отдельный стек.
    store.getState().addNewItem({ weaponId: 'weapon_sword', itemType: 'weapon', name: 'Меч', durabilityTracked: true, durability: 100 });
    items = store.getState().items;
    expect(Object.keys(items)).toHaveLength(2);
    const keys = Object.keys(items);
    expect(keys.find((k) => String(k).includes('dur_50'))).toBeDefined();
    expect(keys.find((k) => String(k).includes('dur_100'))).toBeDefined();
  });
});

describe('Миграция v6 → v7 (старые сейвы с бритвой)', () => {
  it('weapon_straight_razor → истинный id + baseName + пересобранные ключи', () => {
    const v6 = {
      schemaVersion: 6,
      origin: { id: 'TreeFamilies', name: 'x' },
      equipment: {
        items: [
          {
            id: 'weapon_straight_razor',
            weaponId: 'weapon_straight_razor',
            name: 'Опасная бритва',
            itemType: 'weapon',
            stackKey: 'weapon_straight_razor',
            quantity: 1,
          },
        ],
      },
      equippedWeapons: [],
    };
    const migrated = migrateCharacterState(v6);
    expect(migrated.schemaVersion).toBe(8);
    const item = migrated.equipment.items[0];
    expect(item.weaponId).toBe('weapon_switchblade');
    expect(item.baseName).toBe('Опасная бритва');
    expect(item.id).toBe('weapon_switchblade_опасная_бритва');
    expect(item.stackKey).toBe('weapon_switchblade_опасная_бритва');
  });

  it('бритва с модом: имя очищается от префикса мода', () => {
    const v6 = {
      schemaVersion: 6,
      origin: { id: 'TreeFamilies', name: 'x' },
      equipment: {
        items: [
          {
            id: 'weapon_straight_razor_mods_mod_113',
            weaponId: 'weapon_straight_razor',
            name: 'Зазубренное лезвие Опасная бритва',
            itemType: 'weapon',
            appliedMods: { Uniques: 'mod_113' },
            stackKey: 'weapon_straight_razor_mods_mod_113',
            quantity: 1,
          },
        ],
      },
      equippedWeapons: [],
    };
    const migrated = migrateCharacterState(v6);
    const item = migrated.equipment.items[0];
    expect(item.baseName).toBe('Опасная бритва');
    expect(item.id).toBe('weapon_switchblade_mods_mod_113_опасная_бритва');
  });
});
