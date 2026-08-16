/**
 * Property 4: Полнота KitNames в модульном i18n (сеттинг)
 *
 * Для каждого уникального kit ID из `equipmentKitIds` всех origins
 * (data/origins + modules/fallout/data/origins) этот kit ID должен
 * присутствовать в модульном i18n сеттинга
 * (modules/fallout/i18n/{ru-RU,en-EN}/data/system/equipmentKits.json) с полем name.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ORIGINS_FILES = [
  path.resolve(__dirname, '../../modules/fallout/data/origins/origins.json'),
  path.resolve(__dirname, '../../modules/fallout/data/origins/origins.json'),
];
const MODULE_I18N_FILES = {
  'ru-RU': path.resolve(__dirname, '../../modules/fallout/i18n/ru-RU/data/system/equipmentKits.json'),
  'en-EN': path.resolve(__dirname, '../../modules/fallout/i18n/en-EN/data/system/equipmentKits.json'),
};

function loadAllKitIdsFromOrigins() {
  const kitIds = new Set();
  for (const file of ORIGINS_FILES) {
    if (!fs.existsSync(file)) continue;
    const origins = JSON.parse(fs.readFileSync(file, 'utf-8'));
    if (Array.isArray(origins)) {
      for (const origin of origins) {
        for (const kitId of origin.equipmentKitIds || []) kitIds.add(kitId);
      }
    }
  }
  return kitIds;
}

function loadModuleKitNames(locale) {
  const file = MODULE_I18N_FILES[locale];
  if (!fs.existsSync(file)) return null;
  // Файл и есть словарь имён комплектов: { [kitId]: { name } }
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

describe('Property 4: Полнота KitNames в модульном i18n', () => {
  for (const locale of ['ru-RU', 'en-EN']) {
    it(`каждый kit ID из origins присутствует в модульном i18n (${locale}) с name`, () => {
      const kitIds = loadAllKitIdsFromOrigins();
      const names = loadModuleKitNames(locale);
      expect(fs.existsSync(MODULE_I18N_FILES[locale])).toBe(true);
      const missing = [];
      for (const kitId of kitIds) {
        const entry = names[kitId];
        if (!entry || typeof entry.name !== 'string') missing.push(kitId);
      }
      expect(missing).toEqual([]);
    });
  }
});
