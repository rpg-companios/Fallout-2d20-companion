/**
 * Property 5: Форма equipmentKits в getEquipmentCatalog()
 *
 * Для каждого kit ID в `data/equipmentKits/*.json` (кроме `list.json`)
 * результат `getEquipmentCatalog().equipmentKits[kitId]` должен содержать
 * поле `name` типа string и поле `items` типа array.
 *
 * Validates: Requirements 3.2, 3.3
 *
 * Tag: Feature: equipment-kits-split, Property 5: Форма equipmentKits в getEquipmentCatalog()
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../data/equipmentKits');

/**
 * Collect all kit IDs from data/equipmentKits/*.json (excluding list.json).
 * Returns an array of kit ID strings.
 */
function loadAllKitIds() {
  if (!fs.existsSync(DATA_DIR)) {
    return [];
  }

  const files = fs.readdirSync(DATA_DIR).filter(
    (f) => f.endsWith('.json') && f !== 'list.json'
  );

  const kitIds = [];
  for (const file of files) {
    const filePath = path.join(DATA_DIR, file);
    const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    for (const kitId of Object.keys(content)) {
      kitIds.push(kitId);
    }
  }
  return kitIds;
}

describe('Property 5: Форма equipmentKits в getEquipmentCatalog()', () => {
  it(
    'Feature: equipment-kits-split, Property 5: Форма equipmentKits в getEquipmentCatalog() — ' +
      'every kit ID from data/equipmentKits/*.json has name (string) and items (array) in getEquipmentCatalog()',
    async () => {
      const kitIds = loadAllKitIds();

      if (kitIds.length === 0) {
        console.log(
          'SKIP: No kit data files found in data/equipmentKits/ — will be created in Task 1'
        );
        return;
      }

      // Dynamically import to avoid issues with locale module side-effects
      const { getEquipmentCatalog } = await import('../../i18n/equipmentCatalog.js');
      const catalog = getEquipmentCatalog();
      const { equipmentKits } = catalog;

      expect(
        equipmentKits,
        'getEquipmentCatalog() must return an equipmentKits field'
      ).toBeDefined();

      expect(
        typeof equipmentKits,
        'equipmentKits must be an object'
      ).toBe('object');

      const kitIdArbitrary = fc.constantFrom(...kitIds);

      fc.assert(
        fc.property(kitIdArbitrary, (kitId) => {
          const kit = equipmentKits[kitId];

          // kit must exist in the catalog
          expect(
            kit,
            `equipmentKits["${kitId}"] must be defined in getEquipmentCatalog() result`
          ).toBeDefined();

          // name must be a string (Requirement 3.2)
          expect(
            typeof kit.name,
            `equipmentKits["${kitId}"].name must be a string, got ${typeof kit.name}`
          ).toBe('string');

          // items must be an array (Requirement 3.3)
          expect(
            Array.isArray(kit.items),
            `equipmentKits["${kitId}"].items must be an array, got ${JSON.stringify(kit.items)}`
          ).toBe(true);
        }),
        {
          numRuns: Math.max(100, kitIds.length),
          verbose: true,
        }
      );
    }
  );
});
