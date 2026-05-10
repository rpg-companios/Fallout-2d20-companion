/**
 * Property 4: Полнота KitNames в i18n
 *
 * Для каждого уникального kit ID из `equipmentKitIds` всех origins в
 * `data/origins/origins.json` этот kit ID должен присутствовать в
 * `i18n/ru-RU/data/system/equipmentKits.json` и
 * `i18n/en-EN/data/system/equipmentKits.json`.
 *
 * Validates: Requirements 2.3
 *
 * Tag: Feature: equipment-kits-split, Property 4: Полнота KitNames в i18n
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ORIGINS_FILE = path.resolve(__dirname, '../../data/origins/origins.json');
const RU_KITS_FILE = path.resolve(
  __dirname,
  '../../i18n/ru-RU/data/system/equipmentKits.json'
);
const EN_KITS_FILE = path.resolve(
  __dirname,
  '../../i18n/en-EN/data/system/equipmentKits.json'
);

/**
 * Load all unique kit IDs from data/origins/origins.json.
 * Returns a Set<string>.
 */
function loadAllKitIdsFromOrigins() {
  if (!fs.existsSync(ORIGINS_FILE)) {
    return new Set();
  }
  const origins = JSON.parse(fs.readFileSync(ORIGINS_FILE, 'utf-8'));
  const kitIds = new Set();
  for (const origin of origins) {
    for (const kitId of origin.equipmentKitIds || []) {
      kitIds.add(kitId);
    }
  }
  return kitIds;
}

/**
 * Load the i18n equipmentKits file and return the parsed object.
 * Expected new format: { [kitId]: { name: string } }
 * Strips UTF-8 BOM if present.
 */
function loadI18nKitNames(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  let content = fs.readFileSync(filePath, 'utf-8');
  // Strip UTF-8 BOM if present
  if (content.charCodeAt(0) === 0xfeff) {
    content = content.slice(1);
  }
  return JSON.parse(content);
}

describe('Property 4: Полнота KitNames в i18n', () => {
  it('i18n/ru-RU/data/system/equipmentKits.json exists', () => {
    expect(
      fs.existsSync(RU_KITS_FILE),
      'i18n/ru-RU/data/system/equipmentKits.json must exist'
    ).toBe(true);
  });

  it('i18n/en-EN/data/system/equipmentKits.json exists', () => {
    expect(
      fs.existsSync(EN_KITS_FILE),
      'i18n/en-EN/data/system/equipmentKits.json must exist'
    ).toBe(true);
  });

  it(
    'Feature: equipment-kits-split, Property 4: Полнота KitNames в i18n — ' +
      'every kit ID from origins.json is present in ru-RU equipmentKits.json with { name } format',
    () => {
      const kitIds = loadAllKitIdsFromOrigins();
      const ruKitNames = loadI18nKitNames(RU_KITS_FILE);

      if (kitIds.size === 0) {
        console.log('SKIP: No kit IDs found in data/origins/origins.json');
        return;
      }

      if (ruKitNames === null) {
        console.log('SKIP: i18n/ru-RU/data/system/equipmentKits.json does not exist');
        return;
      }

      const kitIdArray = Array.from(kitIds);
      const kitIdArbitrary = fc.constantFrom(...kitIdArray);

      fc.assert(
        fc.property(kitIdArbitrary, (kitId) => {
          // Requirement 2.3: kit ID must be present as a top-level key
          expect(
            ruKitNames,
            `ru-RU equipmentKits.json must be a flat object at top level`
          ).toBeTypeOf('object');

          expect(
            Object.prototype.hasOwnProperty.call(ruKitNames, kitId),
            `kit ID "${kitId}" is missing from i18n/ru-RU/data/system/equipmentKits.json`
          ).toBe(true);

          // The value must be an object with a "name" string field (new format)
          const entry = ruKitNames[kitId];
          expect(
            entry,
            `ru-RU: entry for kit ID "${kitId}" must be an object`
          ).toBeTypeOf('object');

          expect(
            typeof entry.name,
            `ru-RU: entry for kit ID "${kitId}" must have a "name" string field`
          ).toBe('string');
        }),
        {
          numRuns: Math.max(100, kitIdArray.length),
          verbose: true,
        }
      );
    }
  );

  it(
    'Feature: equipment-kits-split, Property 4: Полнота KitNames в i18n — ' +
      'every kit ID from origins.json is present in en-EN equipmentKits.json with { name } format',
    () => {
      const kitIds = loadAllKitIdsFromOrigins();
      const enKitNames = loadI18nKitNames(EN_KITS_FILE);

      if (kitIds.size === 0) {
        console.log('SKIP: No kit IDs found in data/origins/origins.json');
        return;
      }

      if (enKitNames === null) {
        console.log('SKIP: i18n/en-EN/data/system/equipmentKits.json does not exist');
        return;
      }

      const kitIdArray = Array.from(kitIds);
      const kitIdArbitrary = fc.constantFrom(...kitIdArray);

      fc.assert(
        fc.property(kitIdArbitrary, (kitId) => {
          // Requirement 2.3: kit ID must be present as a top-level key
          expect(
            enKitNames,
            `en-EN equipmentKits.json must be a flat object at top level`
          ).toBeTypeOf('object');

          expect(
            Object.prototype.hasOwnProperty.call(enKitNames, kitId),
            `kit ID "${kitId}" is missing from i18n/en-EN/data/system/equipmentKits.json`
          ).toBe(true);

          // The value must be an object with a "name" string field (new format)
          const entry = enKitNames[kitId];
          expect(
            entry,
            `en-EN: entry for kit ID "${kitId}" must be an object`
          ).toBeTypeOf('object');

          expect(
            typeof entry.name,
            `en-EN: entry for kit ID "${kitId}" must have a "name" string field`
          ).toBe('string');
        }),
        {
          numRuns: Math.max(100, kitIdArray.length),
          verbose: true,
        }
      );
    }
  );
});
