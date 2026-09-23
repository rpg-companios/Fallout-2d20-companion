// Тест границы сеттингов (патч 292) — предохранитель контракта «одна дверь»
// (правило 3 в шапке modules/fallout/index.js).
//
// Правило: файлы ВНЕ modules/** не импортируют внутренности сеттингов
// (modules/<сеттинг>/data/** и modules/<сеттинг>/i18n/**) — только двери
// (modules/<сеттинг>/index.js). Движок и экраны читают сеттинг через
// domain/registry.js; каталог отображения — через дверь сам.
//
// Исключения:
//   - __tests__/ — известный долг (26 файлов на 292), гасится по мере правок;
//   - DEBT ниже — продакшн-файлы, тянущие внутренности напрямую; долг
//     документирован в docs/architecture/domain-map.md, план погашения — МК-3.
//
// Список DEBT может только сокращаться: новый нарушитель или протухшая запись
// (файл уже чист) — красный тест.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

// Долг границы на момент 292 (см. docs/architecture/domain-map.md).
// 316: src/store/resolvers.js вычеркнут — файл стал чистой математикой параметров
// (нарушение powerArmor.json уехало в modules/fallout/logic/derivedStats.js).
const DEBT = new Set([
  'domain/effects.js',
  'domain/skillCanonical.js',
  'domain/skillRewards.js',
  'domain/weaponDisplay.js',
  'i18n/appI18n.js',
  'i18n/conditionsCatalog.js',
  'components/screens/InventoryScreen/logic/inventoryI18n.js',
  'src/saves/characterSaves.js',
  'src/store/characterStore.js',
  'src/store/migrations.js',
  'src/store/powerArmorSlice.js',
]);

const SKIP_DIRS = new Set([
  'node_modules', '.git', '.expo', 'dist', 'patchs', 'modules', '__tests__',
  'coverage', 'android', 'ios', 'assets',
]);

/** Импорт внутренности сеттинга: modules/<имя>/(data|i18n)/… в import/require-строке. */
const INTERNAL = /^[^\n]*\b(?:import|from|require)\b[^\n]*['"][^'"]*modules\/[a-zA-Z0-9_-]+\/(?:data|i18n)\//;

function collectJsFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (!SKIP_DIRS.has(name)) collectJsFiles(full, out);
    } else if (name.endsWith('.js') || name.endsWith('.jsx') || name.endsWith('.ts') || name.endsWith('.tsx')) {
      out.push(full);
    }
  }
  return out;
}

function violations() {
  const found = [];
  for (const abs of collectJsFiles(ROOT)) {
    const rel = relPath(abs);
    const text = readFileSync(abs, 'utf8');
    const bad = text.split('\n').some((line) => INTERNAL.test(line));
    if (bad && !DEBT.has(rel)) found.push(rel);
  }
  return found;
}

function relPath(abs) {
  let rel = abs.slice(ROOT.length).replace(/\\/g, '/');
  if (rel.startsWith('/')) rel = rel.slice(1);
  return rel;
}

describe('граница сеттингов (292): одна дверь', () => {
  it('вне modules/** внутренности сеттингов не импортируются (кроме известного долга)', () => {
    expect(violations()).toEqual([]);
  });

  it('реестр и каталог читают сеттинг только через дверь', () => {
    for (const rel of ['domain/registry.js', 'i18n/equipmentCatalog.js']) {
      const source = readFileSync(join(ROOT, rel), 'utf8');
      expect(source, `${rel}: импорт двери`).toMatch(
        /import \{ SETTING \} from '[^']*modules\/fallout\/index\.js';/,
      );
      expect(source, `${rel}: внутренних путей быть не должно`).not.toMatch(
        /from '[^']*modules\/fallout\/(?:data|i18n)\//,
      );
    }
  });

  it('долг границы актуален: каждая запись DEBT существует и действительно должна', () => {
    const stale = [];
    for (const rel of DEBT) {
      const abs = join(ROOT, rel);
      if (!existsSync(abs)) { stale.push(`${rel}: файла нет`); continue; }
      const hasInternal = readFileSync(abs, 'utf8')
        .split('\n')
        .some((line) => INTERNAL.test(line));
      if (!hasInternal) stale.push(`${rel}: уже чист — убрать из DEBT`);
    }
    expect(stale).toEqual([]);
  });

  it('дверь fallout экспортирует SETTING: meta/data/names, обе локали', async () => {
    const { SETTING } = await import('../../modules/fallout/index.js');
    expect(SETTING.meta.id).toBe('fallout');
    expect(SETTING.meta.locales).toEqual(['ru-RU', 'en-EN']);

    for (const section of ['equipment', 'consumables', 'junk', 'recipes', 'equipmentKits', 'origins', 'traits', 'perks']) {
      expect(SETTING.data[section], `data.${section}`).toBeTruthy();
    }
    expect(SETTING.data.equipment.robot.limbs.length).toBeGreaterThan(0);
    expect(SETTING.data.equipment.robot.weaponMods.length).toBe(4); // конденсаторы 290–291
    expect(Object.keys(SETTING.data.equipmentKits).length).toBeGreaterThan(0);

    for (const locale of ['ru-RU', 'en-EN']) {
      const names = SETTING.names[locale];
      for (const section of ['system', 'equipment', 'consumables', 'junk']) {
        expect(names[section], `names[${locale}].${section}`).toBeTruthy();
      }
      expect(names.equipment.robot.weaponMods.length).toBe(4);
      expect(names.junk.tableLabels).toBeTruthy();
      expect(names.perks.length).toBeGreaterThan(0);
    }
  });
});
