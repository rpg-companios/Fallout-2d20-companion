/**
 * Property 3: Формат KitData в модуле (сеттинг)
 *
 * Для каждого kit ID в `modules/fallout/data/equipmentKits.json`
 * объект должен содержать поле `items` (array) и не содержать поле `name`
 * (имена — в модульном i18n).
 */

import { describe, it, expect } from 'vitest';
import moduleEquipmentKits from '../../modules/fallout/data/equipmentKits/index.js';

function loadAllKitEntries() {
  return Object.entries(moduleEquipmentKits || {}).map(([kitId, kitData]) => ({ kitId, kitData }));
}

describe('Property 3: Формат KitData в модуле', () => {
  it('модульный индекс непуст', () => {
    expect(loadAllKitEntries().length).toBeGreaterThan(0);
  });

  it('каждый kit имеет items (array) и не имеет name', () => {
    const bad = [];
    for (const { kitId, kitData } of loadAllKitEntries()) {
      if (!Array.isArray(kitData.items)) bad.push(`${kitId}: items не массив`);
      if (Object.prototype.hasOwnProperty.call(kitData, 'name')) bad.push(`${kitId}: не должно быть name (имена — в i18n)`);
    }
    expect(bad).toEqual([]);
  });
});
