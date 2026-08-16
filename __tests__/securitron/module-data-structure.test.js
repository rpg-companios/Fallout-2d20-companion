/**
 * Контракт структуры данных модуля сеттинга (патч 97).
 *
 * Правило: данные модуля лежат ЗЕРКАЛОМ раскладки data/ — по одному файлу
 * на категорию в тех же подпапках (consumables/, equipment/, origins/,
 * traits/, equipmentKits/, ...). Плоские файлы в корне modules/fallout/data/
 * (формат патча 70) — легаси-формат, запрещены.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODULE_DATA_ROOT = path.resolve(__dirname, '../../modules/fallout/data');

const MIRRORED_FILES = [
  'consumables/food.json',
  'consumables/drinks.json',
  'equipment/weapon_mods.json',
  'equipment/uniq_qualities.json',
  'equipment/weapons.json',
  'equipment/clothes.json',
  'equipment/general_goods.json',
  'origins/origins.json',
  'traits/traits.json',
];

const FORBIDDEN_FLAT_FILES = [
  'food.json',
  'drinks.json',
  'weapon_mods.json',
  'uniq_qualities.json',
  'weapons.json',
  'clothes.json',
  'general_goods.json',
  'origins.json',
  'traits.json',
];

describe('Модульные данные: раскладка зеркалом data/', () => {
  it('файлы категорий на зеркальных путях', () => {
    for (const rel of MIRRORED_FILES) {
      expect(fs.existsSync(path.join(MODULE_DATA_ROOT, rel)), rel).toBe(true);
    }
  });

  it('плоские файлы в корне модуля запрещены (легаси-формат патча 70)', () => {
    for (const name of FORBIDDEN_FLAT_FILES) {
      expect(fs.existsSync(path.join(MODULE_DATA_ROOT, name)), name).toBe(false);
    }
  });
});
