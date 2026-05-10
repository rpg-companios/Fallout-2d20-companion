/**
 * Property 1: Полнота kit IDs в data файлах
 *
 * Для любого kit ID из `equipmentKitIds` любого origin в `data/origins/origins.json`
 * этот kit ID должен присутствовать ровно в одном файле из `data/equipmentKits/*.json`
 * (исключая `list.json`).
 *
 * Validates: Requirements 6.1, 6.3
 *
 * Tag: Feature: equipment-kits-split, Property 1: Полнота kit IDs в data файлах
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../data/equipmentKits');
const ORIGINS_FILE = path.resolve(__dirname, '../../data/origins/origins.json');

/**
 * Load all kit IDs from data/equipmentKits/*.json (excluding list.json).
 * Returns a Map<kitId, fileName[]> — how many files each kit ID appears in.
 */
function loadKitIdToFilesMap() {
  if (!fs.existsSync(DATA_DIR)) {
    return new Map();
  }

  const files = fs.readdirSync(DATA_DIR).filter(
    (f) => f.endsWith('.json') && f !== 'list.json'
  );

  const kitIdToFiles = new Map();
  for (const file of files) {
    const filePath = path.join(DATA_DIR, file);
    const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    for (const kitId of Object.keys(content)) {
      if (!kitIdToFiles.has(kitId)) {
        kitIdToFiles.set(kitId, []);
      }
      kitIdToFiles.get(kitId).push(file);
    }
  }
  return kitIdToFiles;
}

/**
 * Load all origins from data/origins/origins.json.
 * Returns the parsed array.
 */
function loadOrigins() {
  if (!fs.existsSync(ORIGINS_FILE)) {
    return [];
  }
  return JSON.parse(fs.readFileSync(ORIGINS_FILE, 'utf-8'));
}

describe('Property 1: Полнота kit IDs в data файлах', () => {
  it('data/equipmentKits/ directory exists', () => {
    if (!fs.existsSync(DATA_DIR)) {
      console.log(
        'SKIP: data/equipmentKits/ directory does not exist yet — will be created in Task 1'
      );
      return;
    }
    expect(fs.statSync(DATA_DIR).isDirectory()).toBe(true);
  });

  it(
    'Feature: equipment-kits-split, Property 1: Полнота kit IDs в data файлах — ' +
      'every kit ID from origins.json equipmentKitIds is present in exactly one data file',
    () => {
      const origins = loadOrigins();
      const kitIdToFiles = loadKitIdToFilesMap();

      if (origins.length === 0) {
        console.log('SKIP: No origins found in data/origins/origins.json');
        return;
      }

      if (kitIdToFiles.size === 0) {
        console.log(
          'SKIP: No kit data files found in data/equipmentKits/ — will be created in Task 1'
        );
        return;
      }

      // Collect all (originId, kitId) pairs for property generation
      const originKitPairs = [];
      for (const origin of origins) {
        for (const kitId of (origin.equipmentKitIds || [])) {
          originKitPairs.push({ originId: origin.id, kitId });
        }
      }

      if (originKitPairs.length === 0) {
        console.log('SKIP: No equipmentKitIds found in any origin');
        return;
      }

      const pairArbitrary = fc.constantFrom(...originKitPairs);

      fc.assert(
        fc.property(pairArbitrary, ({ originId, kitId }) => {
          const files = kitIdToFiles.get(kitId);

          // Requirement 6.1: kit ID must be present in at least one data file
          expect(
            files,
            `origin "${originId}": kit ID "${kitId}" is not present in any data/equipmentKits/*.json file`
          ).toBeDefined();

          // Requirement 6.3: kit ID must appear in exactly one file (no duplication)
          expect(
            files.length,
            `origin "${originId}": kit ID "${kitId}" appears in ${files.length} files (${files.join(', ')}), expected exactly 1`
          ).toBe(1);
        }),
        {
          numRuns: Math.max(100, originKitPairs.length),
          verbose: true,
        }
      );
    }
  );

  it(
    'Feature: equipment-kits-split, Property 1 (inverse): ' +
      'no kit ID appears in more than one data file (Requirement 6.3)',
    () => {
      const kitIdToFiles = loadKitIdToFilesMap();

      if (kitIdToFiles.size === 0) {
        console.log(
          'SKIP: No kit data files found in data/equipmentKits/ — will be created in Task 1'
        );
        return;
      }

      const kitIds = Array.from(kitIdToFiles.keys());
      const kitIdArbitrary = fc.constantFrom(...kitIds);

      fc.assert(
        fc.property(kitIdArbitrary, (kitId) => {
          const files = kitIdToFiles.get(kitId);
          expect(
            files.length,
            `kit ID "${kitId}" appears in ${files.length} files (${files.join(', ')}), expected exactly 1`
          ).toBe(1);
        }),
        {
          numRuns: Math.max(100, kitIds.length),
          verbose: true,
        }
      );
    }
  );
});
