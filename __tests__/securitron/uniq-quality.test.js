/**
 * Уникальные качества (uniq qualities) — навешиваемые модификаторы экипировки.
 *
 * Модель: качество имеет id (учёт/механика) и имя (i18n, добавляется к имени
 * предмета: «дерзкая» + «форменная одежда» = «дерзкая форменная одежда»).
 * Качество НЕ вшито в предмет — крепится к экземпляру (поле uniqQualities),
 * участвует в стек-ключе (uniq_<id>): «элегантная» и «дерзкая» форменная
 * одежда — один базовый id, разные стеки.
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

import { getUniqQualities, getUniqQualityName } from '../../domain/registry';
import { composeNameWithUniqQualities } from '../../domain/uniqQuality';
import { generateStackKey, generateItemId } from '../../domain/itemIdentity';
import { resolveKitItems, resolveWeaponItem } from '../../domain/kitResolver';
import { setCurrentLocale, setCurrentModuleLocale } from '../../i18n/locale';
import { getEquipmentCatalogForLocale } from '../../domain/registry';
import { migrateCharacterState } from '../../src/store/migrations';
import useCharacterStore from '../../src/store/characterStore';

beforeAll(() => {
  setCurrentLocale('ru-RU');
  setCurrentModuleLocale('ru-RU');
});

const NAME_BY_ID = { dashing: 'Дерзкая', elegant: 'Элегантная', homemade: 'Кустарные' };
const nameById = (id) => NAME_BY_ID[id] || '';

describe('Каталог уникальных качеств (реестр)', () => {
  it('getUniqQualities читает модуль поверх базы', () => {
    const all = getUniqQualities();
    expect(all.some((q) => q.id === 'dashing')).toBe(true);
    expect(all.some((q) => q.id === 'elegant')).toBe(true);
  });

  it('getUniqQualityName — имя из i18n модуля; неизвестное — пустая строка', () => {
    expect(getUniqQualityName('dashing')).toBe('Дерзкая');
    expect(getUniqQualityName('elegant')).toBe('Элегантная');
    expect(getUniqQualityName('no_such_quality')).toBe('');
  });
});

describe('Композиция имени (чистая функция)', () => {
  it('«дерзкая» + «форменная одежда» = «Дерзкая форменная одежда»', () => {
    expect(composeNameWithUniqQualities('форменная одежда', ['dashing'], nameById))
      .toBe('Дерзкая форменная одежда');
    expect(composeNameWithUniqQualities('10 мм патроны', ['homemade'], nameById))
      .toBe('Кустарные 10 мм патроны');
  });

  it('без имён (нет в словаре) имя не меняется; несколько качеств — по порядку', () => {
    expect(composeNameWithUniqQualities('шляпа', ['no_name_quality'], nameById)).toBe('шляпа');
    expect(composeNameWithUniqQualities('шляпа', ['elegant', 'dashing'], nameById))
      .toBe('Элегантная Дерзкая шляпа');
    expect(composeNameWithUniqQualities('шляпа', [], nameById)).toBe('шляпа');
  });
});

describe('Учёт в стеке: uniq-качества — параметр стека', () => {
  it('элегантная ≠ дерзкая при одном базовом id; две дерзкие — один стек', () => {
    const base = generateStackKey('clothing_fancy_clothes');
    const elegant = generateStackKey('clothing_fancy_clothes', {}, '', undefined, ['elegant']);
    const dashing = generateStackKey('clothing_fancy_clothes', {}, '', undefined, ['dashing']);
    expect(base).toBe('clothing_fancy_clothes');
    expect(elegant).toBe('clothing_fancy_clothes_uniq_elegant');
    expect(dashing).toBe('clothing_fancy_clothes_uniq_dashing');
    expect(elegant).not.toBe(dashing); // разные качества → разные стеки
    expect(generateStackKey('clothing_fancy_clothes', {}, '', undefined, ['elegant'])).toBe(elegant);
    // порядок крепления не влияет на ключ
    expect(generateStackKey('clothing_fancy_clothes', {}, '', undefined, ['dashing', 'elegant']))
      .toBe(generateStackKey('clothing_fancy_clothes', {}, '', undefined, ['elegant', 'dashing']));
  });

  it('ключ с модами/прочностью/именем варианта + качество', () => {
    expect(generateStackKey('weapon_switchblade', { Uniques: 'mod_113' }, 'Опасная бритва', 50, ['dashing']))
      .toBe('weapon_switchblade_dur_50_mods_mod_113_uniq_dashing_опасная_бритва');
  });

  it('generateItemId учитывает качества', () => {
    expect(generateItemId('clothing_fancy_clothes', {}, '', undefined, ['dashing']))
      .toBe('clothing_fancy_clothes_uniq_dashing');
  });
});

describe('addNewItem: предметы с качествами', () => {
  it('одинаковые база+качество — один стек; разные качества — разные стеки; поле сохраняется', () => {
    const store = useCharacterStore;
    store.setState({ items: {} });
    const clothes = { clothingId: 'clothing_fancy_clothes', itemType: 'clothing', name: 'Форменная одежда' };
    store.getState().addNewItem({ ...clothes, uniqQualities: ['elegant'], name: 'Элегантная форменная одежда' });
    store.getState().addNewItem({ ...clothes, uniqQualities: ['elegant'], name: 'Элегантная форменная одежда' });
    let items = store.getState().items;
    expect(Object.keys(items)).toHaveLength(1);
    expect(Object.values(items)[0].quantity).toBe(2);
    expect(Object.values(items)[0].uniqQualities).toEqual(['elegant']);

    store.getState().addNewItem({ ...clothes, uniqQualities: ['dashing'], name: 'Дерзкая форменная одежда' });
    items = store.getState().items;
    expect(Object.keys(items)).toHaveLength(2); // элегантная и дерзкая — разные стеки
  });
});

describe('Комплект: крепление качества данными', () => {
  it('запись комплекта с uniqQualities → предмет с качеством и составным именем', async () => {
    const catalog = getEquipmentCatalogForLocale('ru-RU');
    const kit = catalog.equipmentKits.treefamilies_chairmen;
    const resolved = await resolveKitItems({
      id: 'treefamilies_chairmen',
      items: [
        ...kit.items,
        { type: 'fixed', clothingId: 'headwear_fancy_hat', itemType: 'clothing', uniqQualities: ['dashing'] },
      ],
    });
    // в комплекте уже есть шляпа без качества — ищем именно экземпляр с качеством
    const hat = resolved.items.find((i) => i.clothingId === 'headwear_fancy_hat' && i.uniqQualities?.includes('dashing'));
    expect(hat).toBeDefined();
    expect(hat.uniqQualities).toEqual(['dashing']);
    expect(hat.name).toBe('Дерзкая Формальная шляпа');
  });

  it('комплект Председателей: одежда и шляпа с качеством elegant в названии', async () => {
    const catalog = getEquipmentCatalogForLocale('ru-RU');
    const kit = catalog.equipmentKits.treefamilies_chairmen;
    const resolved = await resolveKitItems({ id: 'treefamilies_chairmen', items: kit.items });
    const clothes = resolved.items.find((i) => i.clothingId === 'clothing_fancy_clothes');
    const hat = resolved.items.find((i) => i.clothingId === 'headwear_fancy_hat');
    expect(clothes.uniqQualities).toEqual(['elegant']);
    expect(clothes.name).toBe('Элегантная Формальная одежда');
    expect(hat.uniqQualities).toEqual(['elegant']);
    expect(hat.name).toBe('Элегантная Формальная шляпа');
  });

  it('полный путь выдачи (как applyKitById): одежда с качеством попадает в стор', async () => {
    const catalog = getEquipmentCatalogForLocale('ru-RU');
    const kit = catalog.equipmentKits.treefamilies_chairmen;
    const resolved = await resolveKitItems({ id: 'treefamilies_chairmen', items: kit.items });
    const store = useCharacterStore;
    store.setState({ items: {} });
    resolved.items.forEach((item) => {
      if (item.itemType === 'currency' || item.itemType === 'loot') return;
      store.getState().addNewItem({ ...item, equipped: false, locked: false });
    });
    const items = store.getState().items;
    const clothes = Object.values(items).find((i) => i.weaponId === 'clothing_fancy_clothes');
    const hat = Object.values(items).find((i) => i.weaponId === 'headwear_fancy_hat');
    expect(clothes.uniqQualities).toEqual(['elegant']);
    expect(clothes.name).toBe('Элегантная Формальная одежда');
    expect(clothes.stackKey).toBe('clothing_fancy_clothes_uniq_elegant');
    expect(hat.uniqQualities).toEqual(['elegant']);
    expect(hat.name).toBe('Элегантная Формальная шляпа');
  });

  it('оружие с качеством: имя = [моды, качества, имя]', async () => {
    const item = await resolveWeaponItem({
      type: 'fixed',
      weaponId: 'weapon_switchblade',
      itemType: 'weapon',
      uniqQualities: ['dashing'],
      modIds: ['mod_113'],
    });
    expect(item.uniqQualities).toEqual(['dashing']);
    expect(item.name).toBe('Зазубренное лезвие Дерзкая Складной нож');
    expect(item.weaponId).toBe('weapon_switchblade');
  });
});

describe('Миграция v7 → v8 (старые сейвы Председателей)', () => {
  it('одежда/шляпа без качества получают elegant, ключи и имя пересобраны', () => {
    const v7 = {
      schemaVersion: 7,
      origin: { id: 'TreeFamilies', name: 'x' },
      trait: { id: 'treefamilies-chairmen', ids: ['treefamilies-chairmen'], name: 'Председатели' },
      equipment: {
        items: [
          {
            id: 'clothing_fancy_clothes',
            weaponId: 'clothing_fancy_clothes',
            name: 'Формальная одежда',
            itemType: 'clothing',
            stackKey: 'clothing_fancy_clothes',
            quantity: 1,
          },
          {
            id: 'headwear_fancy_hat',
            weaponId: 'headwear_fancy_hat',
            name: 'Формальная шляпа',
            itemType: 'clothing',
            stackKey: 'headwear_fancy_hat',
            quantity: 1,
          },
        ],
      },
      equippedWeapons: [],
    };
    const migrated = migrateCharacterState(v7);
    expect(migrated.schemaVersion).toBe(8);
    const clothes = migrated.equipment.items[0];
    expect(clothes.uniqQualities).toEqual(['elegant']);
    expect(clothes.name).toBe('Элегантная Формальная одежда');
    expect(clothes.id).toBe('clothing_fancy_clothes_uniq_elegant');
    expect(clothes.stackKey).toBe('clothing_fancy_clothes_uniq_elegant');
    const hat = migrated.equipment.items[1];
    expect(hat.uniqQualities).toEqual(['elegant']);
    expect(hat.name).toBe('Элегантная Формальная шляпа');
  });

  it('персонаж не из Председателей — одежда не трогается', () => {
    const v7 = {
      schemaVersion: 7,
      origin: { id: 'TreeFamilies', name: 'x' },
      trait: { id: 'treefamilies-omerta', ids: ['treefamilies-omerta'], name: 'Омерта' },
      equipment: {
        items: [
          {
            id: 'clothing_fancy_clothes',
            weaponId: 'clothing_fancy_clothes',
            name: 'Формальная одежда',
            itemType: 'clothing',
            stackKey: 'clothing_fancy_clothes',
            quantity: 1,
          },
        ],
      },
      equippedWeapons: [],
    };
    const migrated = migrateCharacterState(v7);
    expect(migrated.schemaVersion).toBe(8);
    expect(migrated.equipment.items[0].uniqQualities).toBeUndefined();
    expect(migrated.equipment.items[0].id).toBe('clothing_fancy_clothes');
  });

  it('уже с качеством (после 67) — не дублируется', () => {
    const v7 = {
      schemaVersion: 7,
      origin: { id: 'TreeFamilies', name: 'x' },
      trait: { id: 'treefamilies-chairmen', ids: ['treefamilies-chairmen'], name: 'Председатели' },
      equipment: {
        items: [
          {
            id: 'clothing_fancy_clothes_uniq_elegant',
            weaponId: 'clothing_fancy_clothes',
            name: 'Элегантная Формальная одежда',
            uniqQualities: ['elegant'],
            itemType: 'clothing',
            stackKey: 'clothing_fancy_clothes_uniq_elegant',
            quantity: 1,
          },
        ],
      },
      equippedWeapons: [],
    };
    const migrated = migrateCharacterState(v7);
    expect(migrated.equipment.items[0].name).toBe('Элегантная Формальная одежда');
    expect(migrated.equipment.items[0].uniqQualities).toEqual(['elegant']);
  });
});
