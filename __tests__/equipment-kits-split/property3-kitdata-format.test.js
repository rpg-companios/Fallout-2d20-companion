/**
 * Property 3: Формат KitData файлов
 *
 * Для каждого kit ID в любом `data/equipmentKits/*.json` (кроме `list.json`)
 * объект должен содержать поле `items` (array) и не содержать поле `name`.
 *
 * Validates: Requirements 1.6
 *
 * Tag: Feature: equipment-kits-split, Property 3: Формат KitData файлов
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../data/equipmentKits');

/**
 * Load all kit data from data/equipmentKits/*.json (excluding list.json).
 * Returns an array of { file, kitId, kitData } entries.
 * Returns empty array if the directory does not exist yet.
 */
function loadAllKitEntries() {
  if (!fs.existsSync(DATA_DIR)) {
    return [];
  }

  const files = fs.readdirSync(DATA_DIR).filter(
    (f) => f.endsWith('.json') && f !== 'list.json'
  );

  const entries = [];
  for (const file of files) {
    const filePath = path.join(DATA_DIR, file);
    const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    for (const kitId of Object.keys(content)) {
      entries.push({ file, kitId, kitData: content[kitId] });
    }
  }
  return entries;
}

describe('Property 3: Формат KitData файлов', () => {
  it('data/equipmentKits/ directory exists (skip gracefully if not)', () => {
    if (!fs.existsSync(DATA_DIR)) {
      console.log(
        'SKIP: data/equipmentKits/ directory does not exist yet — will be created in Task 1'
      );
      return;
    }
    expect(fs.statSync(DATA_DIR).isDirectory()).toBe(true);
  });

  it(
    'Feature: equipment-kits-split, Property 3: Формат KitData файлов — ' +
      'every kit ID in data/equipmentKits/*.json has items (array) and no name field',
    () => {
      const entries = loadAllKitEntries();

      if (entries.length === 0) {
        console.log(
          'SKIP: No kit data files found in data/equipmentKits/ — will be created in Task 1'
        );
        return;
      }

      // Build an arbitrary that picks a random entry from the loaded data
      const entryArbitrary = fc.constantFrom(...entries);

      fc.assert(
        fc.property(entryArbitrary, ({ file, kitId, kitData }) => {
          // items field must exist and be an array
          expect(
            Array.isArray(kitData.items),
            `[${file}] kit "${kitId}": expected items to be an array, got ${JSON.stringify(kitData.items)}`
          ).toBe(true);

          // name field must NOT exist
          expect(
            kitData.name,
            `[${file}] kit "${kitId}": expected name field to be absent, got "${kitData.name}"`
          ).toBeUndefined();
        }),
        {
          numRuns: Math.max(100, entries.length),
          verbose: true,
        }
      );
    }
  );
});
