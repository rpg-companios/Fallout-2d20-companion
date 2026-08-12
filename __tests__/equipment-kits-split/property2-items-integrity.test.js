/**
 * Property 2: Целостность items комплектов в модуле (сеттинг)
 *
 * Каждый комплект в `modules/fallout/data/equipmentKits.json` (единый
 * источник, патч 74) имеет массив `items`; у каждого предмета есть тип и
 * идентификатор (weaponId/clothingId/itemId/armorId или type choice/rollTable).
 */

import { describe, it, expect } from 'vitest';
import moduleEquipmentKits from '../../modules/fallout/data/equipmentKits/index.js';

function loadModuleKits() {
  return moduleEquipmentKits || {};
}

describe('Property 2: Целостность items комплектов в модуле', () => {
  it('у каждого комплекта items — непустой массив', () => {
    const kits = loadModuleKits();
    expect(Object.keys(kits).length).toBeGreaterThan(0);
    for (const [kitId, kit] of Object.entries(kits)) {
      expect(Array.isArray(kit.items), `${kitId}: items — массив`).toBe(true);
      expect(kit.items.length, `${kitId}: items непустой`).toBeGreaterThan(0);
    }
  });

  it('каждая запись комплекта имеет тип и идентификатор', () => {
    const kits = loadModuleKits();
    const bad = [];
    for (const [kitId, kit] of Object.entries(kits)) {
      for (const entry of kit.items || []) {
        // choice/rollTable — структурные записи (идентификаторы у опций внутри);
        // fixed — конкретный предмет с id.
        if (entry?.type === 'choice' || entry?.type === 'pick') continue;
        if (entry?.type === 'rollTable') {
          if (!entry?.tableId) bad.push(`${kitId}: rollTable без tableId`);
          continue;
        }
        const hasId = entry?.weaponId || entry?.clothingId || entry?.itemId || entry?.armorId
          || entry?.itemType === 'currency' || entry?.itemType === 'currency_ncr';
        if (!hasId) bad.push(`${kitId}: ${JSON.stringify(entry).slice(0, 80)}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
