/**
 * Property 2: Целостность items при разделении
 *
 * Для каждого kit ID поле `items` в новых `data/equipmentKits/*.json` должно быть
 * структурно идентично полю `items` в старом `equipmentKitGroups` из
 * `i18n/ru-RU/data/system/equipmentKits.json`.
 *
 * Validates: Requirements 1.7, 6.2
 *
 * Tag: Feature: equipment-kits-split, Property 2: Целостность items при разделении
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../data/equipmentKits');
const OLD_KITS_FILE = path.resolve(
  __dirname,
  '../../i18n/ru-RU/data/system/equipmentKits.json'
);

/**
 * Load all kit data from data/equipmentKits/*.json (excluding list.json).
 * Returns a merged object { [kitId]: { items } }.
 */
function loadNewKitData() {
  if (!fs.existsSync(DATA_DIR)) {
    return {};
  }

  const files = fs.readdirSync(DATA_DIR).filter(
    (f) => f.endsWith('.json') && f !== 'list.json'
  );

  const merged = {};
  for (const file of files) {
    const filePath = path.join(DATA_DIR, file);
    const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    Object.assign(merged, content);
  }
  return merged;
}

/**
 * Load equipmentKitGroups from the old i18n source file.
 * Returns { [kitId]: { name, items } }.
 * Handles UTF-8 BOM if present.
 */
function loadOldKitGroups() {
  if (!fs.existsSync(OLD_KITS_FILE)) {
    return {};
  }
  let raw = fs.readFileSync(OLD_KITS_FILE, 'utf-8');
  // Strip UTF-8 BOM if present
  if (raw.charCodeAt(0) === 0xfeff) {
    raw = raw.slice(1);
  }
  const content = JSON.parse(raw);
  return content.equipmentKitGroups || {};
}

describe('Property 2: Целостность items при разделении', () => {
  it('source files exist', () => {
    if (!fs.existsSync(DATA_DIR)) {
      console.log(
        'SKIP: data/equipmentKits/ directory does not exist yet — will be created in Task 1'
      );
      return;
    }
    expect(fs.statSync(DATA_DIR).isDirectory()).toBe(true);

    if (!fs.existsSync(OLD_KITS_FILE)) {
      console.log(
        'SKIP: i18n/ru-RU/data/system/equipmentKits.json does not exist'
      );
      return;
    }
    expect(fs.statSync(OLD_KITS_FILE).isFile()).toBe(true);
  });

  it(
    'Feature: equipment-kits-split, Property 2: Целостность items при разделении — ' +
      'items in new data files are structurally identical to items in old equipmentKitGroups',
    () => {
      const newKitData = loadNewKitData();
      const oldKitGroups = loadOldKitGroups();

      const newKitIds = Object.keys(newKitData);

      if (newKitIds.length === 0) {
        console.log(
          'SKIP: No kit data files found in data/equipmentKits/ — will be created in Task 1'
        );
        return;
      }

      if (Object.keys(oldKitGroups).length === 0) {
        console.log(
          'SKIP: No equipmentKitGroups found in i18n/ru-RU/data/system/equipmentKits.json'
        );
        return;
      }

      const kitIdArbitrary = fc.constantFrom(...newKitIds);

      fc.assert(
        fc.property(kitIdArbitrary, (kitId) => {
          const newKit = newKitData[kitId];
          const oldKit = oldKitGroups[kitId];

          // The old source must have this kit ID
          expect(
            oldKit,
            `kit ID "${kitId}" is present in new data files but missing from old equipmentKitGroups`
          ).toBeDefined();

          // items must be structurally identical (deep equality)
          expect(
            newKit.items,
            `kit "${kitId}": items in new data file must be structurally identical to old equipmentKitGroups items`
          ).toEqual(oldKit.items);
        }),
        {
          numRuns: Math.max(100, newKitIds.length),
          verbose: true,
        }
      );
    }
  );
});
