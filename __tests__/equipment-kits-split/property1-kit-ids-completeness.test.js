/**
 * Property 1: Полнота kit IDs в модуле (сеттинг)
 *
 * Для любого kit ID из `equipmentKitIds` любого origin (data/origins +
 * modules/fallout/data/origins) этот kit ID должен присутствовать в
 * `modules/fallout/data/equipmentKits.json` — едином источнике комплектов
 * (патч 74: комплекты перенесены в модуль целиком, data/equipmentKits пуст).
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import moduleEquipmentKits from '../../modules/fallout/data/equipmentKits/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ORIGINS_FILES = [
  path.resolve(__dirname, '../../modules/fallout/data/origins/origins.json'),
  path.resolve(__dirname, '../../modules/fallout/data/origins/origins.json'),
];

function loadModuleKitIds() {
  return new Set(Object.keys(moduleEquipmentKits || {}));
}

function loadOrigins() {
  const origins = [];
  for (const file of ORIGINS_FILES) {
    if (!fs.existsSync(file)) continue;
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
    if (Array.isArray(parsed)) origins.push(...parsed);
  }
  return origins;
}

describe('Property 1: Полнота kit IDs в модуле', () => {
  it('модульный индекс комплектов непуст', () => {
    const ids = loadModuleKitIds();
    expect(ids.size).toBeGreaterThan(0);
  });

  it('каждый kit ID из equipmentKitIds ориджинов есть в модульном файле', () => {
    const origins = loadOrigins();
    const kitIds = loadModuleKitIds();
    const missing = [];
    for (const origin of origins) {
      for (const kitId of origin.equipmentKitIds || []) {
        if (!kitIds.has(kitId)) missing.push(`${origin.id}: ${kitId}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
