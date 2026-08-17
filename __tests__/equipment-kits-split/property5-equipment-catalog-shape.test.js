/**
 * Property 5: Форма equipmentKits в getEquipmentCatalog()
 *
 * Для каждого kit ID в `modules/fallout/data/equipmentKits.json`
 * результат `getEquipmentCatalog().equipmentKits[kitId]` должен содержать
 * поле `name` типа string (из модульного i18n) и поле `items` типа array.
 */

import { describe, it, expect } from 'vitest';
import moduleEquipmentKits from '../../modules/fallout/data/equipmentKits/index.js';

function loadAllKitIds() {
  return Object.keys(moduleEquipmentKits || {});
}

describe('Property 5: Форма equipmentKits в getEquipmentCatalog()', () => {
  it('каждый kit из модуля имеет name (string) и items (array) в каталоге', async () => {
    const kitIds = loadAllKitIds();
    expect(kitIds.length).toBeGreaterThan(0);

    const { getEquipmentCatalog } = await import('../../i18n/equipmentCatalog');
    const { setCurrentLocale, setCurrentModuleLocale } = await import('../../i18n/locale');
    setCurrentLocale('ru-RU');
    setCurrentModuleLocale('ru-RU');
    const catalog = getEquipmentCatalog('ru-RU');

    const bad = [];
    for (const kitId of kitIds) {
      const entry = catalog.equipmentKits?.[kitId];
      if (!entry) { bad.push(`${kitId}: отсутствует в каталоге`); continue; }
      if (typeof entry.name !== 'string') bad.push(`${kitId}: name не строка`);
      if (!Array.isArray(entry.items)) bad.push(`${kitId}: items не массив`);
    }
    expect(bad).toEqual([]);
  });
});
