import { describe, it, expect } from 'vitest';
import { getEquipmentCatalog } from '../../i18n/equipmentCatalog.js';
import { findCatalogEntry, resolveItem } from '../../domain/resolveItem.js';

const catalog = getEquipmentCatalog('ru-RU');

describe('resolveItem: robotConsumable', () => {
  it('findCatalogEntry находит ремкомплект по itemType robotConsumable', () => {
    const entry = findCatalogEntry(catalog, 'robot_item_repair_kit', 'robotConsumable');
    expect(entry).toBeTruthy();
    expect(entry.itemType).toBe('robotConsumable');
  });

  it('resolveItem обогащает новый ремкомплект (robotConsumable) каталожными полями', () => {
    const instance = { id: 'K1', weaponId: 'robot_item_repair_kit', itemType: 'robotConsumable', healAmount: 6 };
    const res = resolveItem(instance, catalog);
    expect(res).toBeTruthy();
    expect(res.itemType).toBe('robotConsumable');
    // Каталожные поля подтянулись (не undefined) — значит не потеряно имя/вес/цена.
    expect(res.name).toBeTruthy();
  });

  it('старый инстанс ремкомплекта (itemType chem) не ломается и сохраняет state-поля', () => {
    const instance = { id: 'K1', weaponId: 'robot_item_repair_kit', itemType: 'chem', robotOnly: true, healAmount: 6 };
    const res = resolveItem(instance, catalog);
    expect(res).toBeTruthy();
    expect(res.healAmount).toBe(6);
  });
});
