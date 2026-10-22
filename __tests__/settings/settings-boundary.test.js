// Тест границы сеттингов (патч 292) — предохранитель публичных entrypoints
// (правило 3 в шапке modules/fallout/index.js).
//
// Правило: файлы ВНЕ modules/** не импортируют код или внутренности сеттингов.
// Данные читаются через domain/registry.js, лёгкие метаданные — через manifest.js;
// executable setting code подключается только выбранным package runtime.
//
// Исключения:
//   - __tests__/ и __test-setup__/ — тестовые фикстуры могут импортировать пакет;
//   - DEBT — временный список продакшн-нарушений, который может только сокращаться.
//
// Список DEBT может только сокращаться: новый нарушитель или протухшая запись
// (файл уже чист) — красный тест.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

// До разделения это было наследуемым долгом; теперь приложение, characterStore
// и migrations читают данные через активный runtime registry.
const DEBT = new Set([]);

const SKIP_DIRS = new Set([
  'node_modules', '.git', '.expo', 'dist', 'patchs', 'modules', '__tests__', '__test-setup__',
  'coverage', 'android', 'ios', 'assets',
]);

/** Любой статический импорт кода сеттинга из engine-owned файлов. */
const INTERNAL = /^[^\n]*\b(?:import|from|require)\b[^\n]*['"][^'"]*modules\/[a-zA-Z0-9_-]+\//;

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

describe('граница сеттингов (292): public entrypoints', () => {
  it('вне modules/** внутренности сеттингов не импортируются (кроме известного долга)', () => {
    expect(violations()).toEqual([]);
  });

  it('core catalog services have no static Fallout dependency and package activation has no fallback', () => {
    for (const rel of [
      'domain/registry.js',
      'i18n/equipmentCatalog.js',
      'i18n/appI18n.js',
      'domain/effects.js',
      'domain/skillCanonical.js',
      'domain/weaponDisplay.js',
      'domain/origins.js',
      'db/catalogSource.js',
      'src/saves/characterSaves.js',
      'components/alerts/AlertHost.js',
      'components/boot/PositroniumBootScreen.js',
      'components/screens/InventoryScreen/InventoryScreen.js',
      'components/screens/InventoryScreen/modals/AddItemModal.js',
      'index.js',
    ]) {
      const source = readFileSync(join(ROOT, rel), 'utf8');
      const hasStaticSettingImport = source.split('\n').some((line) => INTERNAL.test(line));
      expect(hasStaticSettingImport, `${rel}: no statically bundled setting`).toBe(false);
    }

    const moduleLocaleSource = readFileSync(join(ROOT, 'domain/moduleLocale.js'), 'utf8');
    expect(moduleLocaleSource, 'module locale follows the active runtime manifest').toMatch(
      /activeSettingRuntime/,
    );
    expect(moduleLocaleSource).not.toMatch(/modules\/fallout\/manifest\.js/);

    const settingStoreSource = readFileSync(join(ROOT, 'src/store/settingPackStore.js'), 'utf8');
    expect(settingStoreSource, 'installed package store has no bundled setting fallback').not.toMatch(
      /modules\/fallout\//,
    );

    for (const rel of [
      'domain/registry.js',
      'domain/moduleLocale.js',
      'i18n/equipmentCatalog.js',
      'src/store/settingPackStore.js',
    ]) {
      const source = readFileSync(join(ROOT, rel), 'utf8');
      expect(source, `${rel}: setting internals are not imported`).not.toMatch(
        /from '[^']*modules\/fallout\/(?:data|i18n)\//,
      );
      expect(source, `${rel}: raw manifest is read only by the manifest doorway`).not.toMatch(
        /from '[^']*modules\/fallout\/manifest\.json'/,
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

  it('двери Fallout экспортируют одинаковые валидированные метаданные', async () => {
    const [{ SETTING }, { SETTING_MANIFEST }] = await Promise.all([
      import('../../modules/fallout/index.js'),
      import('../../modules/fallout/manifest.js'),
    ]);
    expect(SETTING.meta).toEqual(SETTING_MANIFEST);
    expect(SETTING.meta).toMatchObject({
      id: 'fallout',
      name: 'Fallout 2d20',
      version: expect.stringMatching(/^\d+\.\d+\.\d+$/),
      requiresCore: '>=1.0',
      defaultLocale: 'ru-RU',
      locales: ['ru-RU', 'en-EN'],
    });

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
