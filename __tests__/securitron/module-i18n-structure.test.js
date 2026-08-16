/**
 * Контракт структуры i18n модуля сеттинга (патч 96).
 *
 * Правило: переводы данных модуля лежат ПО КАТЕГОРИЯМ, зеркалом раскладки
 * i18n/<locale>/data/ — один файл на категорию. Единый файл на локаль
 * (modules/fallout/i18n/<locale>.json) — легаси-формат, запрещён.
 * Реестр (getModuleI18n) собирает словарь из файлов без потери ключей.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { getModuleI18n } from '../../domain/registry';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODULE_I18N_ROOT = path.resolve(__dirname, '../../modules/fallout/i18n');

const CATEGORY_FILES = [
  'system/origins.json',
  'system/traits.json',
  'system/equipmentKits.json',
  'system/uniq_qualities.json',
  'equipment/weapons/weapons.json',
  'equipment/armor/clothes.json',
  'equipment/general_goods.json',
  'equipment/weapon_mods.json',
  'consumables/food.json',
  'consumables/drinks.json',
];

describe('Модульный i18n: структура по категориям (зеркало легаси)', () => {
  for (const locale of ['ru-RU', 'en-EN']) {
    it(`файлы категорий на месте (${locale}), единого файла на локаль нет`, () => {
      for (const rel of CATEGORY_FILES) {
        expect(fs.existsSync(path.join(MODULE_I18N_ROOT, locale, 'data', rel)), `${locale}/data/${rel}`).toBe(true);
      }
      // легаси-формат (один JSON на локаль) запрещён
      expect(fs.existsSync(path.join(MODULE_I18N_ROOT, `${locale}.json`))).toBe(false);
    });

    it(`getModuleI18n('${locale}') собирает все категории из файлов`, () => {
      const i18n = getModuleI18n(locale);
      expect(Object.keys(i18n).sort()).toEqual([
        'clothes', 'drinks', 'equipmentKits', 'food', 'generalGoods',
        'origins', 'traits', 'uniqQualities', 'weaponMods', 'weapons',
      ]);
      for (const rel of CATEGORY_FILES) {
        const fromFile = JSON.parse(fs.readFileSync(path.join(MODULE_I18N_ROOT, locale, 'data', rel), 'utf-8'));
        const keyByRel = {
          'system/origins.json': 'origins',
          'system/traits.json': 'traits',
          'system/equipmentKits.json': 'equipmentKits',
          'system/uniq_qualities.json': 'uniqQualities',
          'equipment/weapons/weapons.json': 'weapons',
          'equipment/armor/clothes.json': 'clothes',
          'equipment/general_goods.json': 'generalGoods',
          'equipment/weapon_mods.json': 'weaponMods',
          'consumables/food.json': 'food',
          'consumables/drinks.json': 'drinks',
        };
        expect(i18n[keyByRel[rel]]).toEqual(fromFile);
      }
    });
  }
});
