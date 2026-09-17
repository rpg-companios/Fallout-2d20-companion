// Видимость данных разбора (патч 260): каталог для окон добычи/покупки,
// реестровые геттеры, обвязка AddItemModal и i18n-ключи категории «Хлам».

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { getEquipmentCatalog } from '../../i18n/equipmentCatalog';
import { findCatalogEntry } from '../../domain/resolveItem';
import {
  getSalvageComposition,
  getScrapJunkItems,
  getScrapTableLabels,
  getScrapMaterials,
  getScrapTables,
} from '../../domain/registry';
import junkData from '../../modules/fallout/data/junk/junk.json';
import materialsData from '../../modules/fallout/data/junk/material.json';

const ROOT = new URL('../../', import.meta.url).pathname;
const readText = (rel) => readFileSync(ROOT + rel, 'utf8');

describe('каталог для окон (добыча/покупка)', () => {
  it('equipmentCatalog отдаёт списки хлама и материалов с именами', () => {
    for (const locale of ['ru-RU', 'en-EN']) {
      const catalog = getEquipmentCatalog(locale);
      expect(catalog.junk.length).toBe(junkData.length);
      expect(catalog.materials.length).toBe(materialsData.length);
      for (const item of [...catalog.junk, ...catalog.materials]) {
        expect(typeof item.name, item.id).toBe('string');
        expect(item.name.length, item.id).toBeGreaterThan(0);
      }
    }
  });

  it('находка окна покупки несёт цену (cost) из данных —BuyItemModal берёт её в расчёт', () => {
    const catalog = getEquipmentCatalog('ru-RU');
    const abraxo = catalog.junk.find((x) => x.id === 'abraxo_cleaner');
    expect(abraxo).toMatchObject({ cost: 10, weight: 1, itemType: 'junk' });
    expect(abraxo.name).toBe('Чистящее средство Абраксо');
    const steel = catalog.materials.find((x) => x.id === 'steel');
    expect(steel).toMatchObject({ cost: 1, weight: 0.2, rarity: 0 });
  });

  it('findCatalogEntry резолвит junk-тип и misc-фолбэк (материалы тоже видны)', () => {
    const catalog = getEquipmentCatalog('ru-RU');
    expect(findCatalogEntry(catalog, 'alarm_clock', 'junk')?.name).toBeTruthy();
    // стор подкинет таким стекам itemType misc — fallback обязан находить и хлам, и материалы
    expect(findCatalogEntry(catalog, 'alarm_clock', 'misc')).toBeTruthy();
    expect(findCatalogEntry(catalog, 'steel', 'misc')).toBeTruthy();
    expect(findCatalogEntry(catalog, 'item_common_materials', 'misc')).toBeTruthy();
  });
});

describe('листы групп данных (270): пути — в одном месте', () => {
  it('реестр и каталог не импортируют JSON хлама/рецептов сами — только лист группы', () => {
    for (const [rel, banned] of [
      ['domain/registry.js', ["data/junk/junk.json'", "data/junk/material.json'", "data/recipes/ammo.json'"]],
      ['i18n/equipmentCatalog.js', ["data/junk/junk.json'", "data/junk/material.json'"]],
    ]) {
      const source = readText(rel);
      for (const b of banned) expect(source, `${rel}: ${b}`).not.toContain(b);
      expect(source).toContain('data/junk/index.js');
    }
  });

  it('подписи таблиц отдаёт реестр (данные таблиц молчат)', () => {
    expect(getScrapTableLabels('ru-RU').mining).toBe('Шахты и раскопки');
    expect(getScrapTableLabels('en-EN').tables.animal).toBeTruthy();
  });
});

describe('реестровые геттеры разбора', () => {
  it('составы и таблицы доступны через реестр (не через пути к файлам)', () => {
    expect(getScrapJunkItems().length).toBe(junkData.length);
    expect(getScrapMaterials().length).toBe(materialsData.length);
    expect(getSalvageComposition('abraxo_cleaner').options[0]).toHaveLength(3);
    expect(getSalvageComposition('alarm_clock')).toBeTruthy();
    expect(getSalvageComposition('weapon_baseball_bat')).toBeNull();
    expect(getScrapTables().categories.faces['5']).toEqual({ table: 'household1' });
    expect(getScrapTables().mining.faces['13'].qty).toBe('3+4<cd>');
  });
});

describe('обвязка AddItemModal', () => {
  it('модалка использует списки каталога (не пустые заглушки) и ищет по хламу', () => {
    const source = readText('components/screens/InventoryScreen/modals/AddItemModal.js');
    expect(source).toContain('equipmentCatalog.junk');
    expect(source).toContain('equipmentCatalog.materials');
    expect(source).toContain("'materials', 'junk'"); // поиск по категориям включает хлам
    expect(source).toContain("junk: '🗑️'");
  });

  it('категория «Хлам» подписана в обеих локалях', () => {
    for (const [locale, expectedJunk] of [['ru-RU', 'Хлам'], ['en-EN', 'Junk']]) {
      const modal = JSON.parse(readText(`i18n/${locale}/screens/inventory/modals/addItemModal.json`));
      expect(modal.categories.junk).toBe(expectedJunk);
      expect(modal.itemTypes.junk).toBeTruthy();
      expect(modal.itemTypes.material).toBeTruthy();
    }
  });
});
