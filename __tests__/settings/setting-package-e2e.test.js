// Сквозная проверка на НАСТОЯЩЕМ пакете Fallout: .trpg → установка → активация.
//
// Тест берёт собранный архив dist/fallout-*.trpg (его делает scripts/pack-setting.py)
// и прогоняет его тем же кодом, что работает на телефоне:
//   parseSettingPackageArchive → validateSettingManifest → installSettingPackage
//   → openSettingPackageRuntime → loadModule (настоящий бандл сеттинга)
//   → normalizeSettingScreens / theme / globalComponents
//
// Хост-модули — НАСТОЯЩИЕ модули движка: `engine:`-иды резолвятся в файлы
// репозитория (это делает vitest.config.js), `react-native` берётся из тестовой
// заглушки в src/store/__test-setup__/reactNativeMock.js. Поэтому тест ловит не
// только стык «манифест ↔ bundle», но и «bundle ↔ реальные сторы движка».
//
// Без архива тест пропускается, чтобы обычный прогон не требовал сборки пакета:
//   python3 scripts/pack-setting.py modules/fallout -o dist/fallout.trpg
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { unzipSync } from 'fflate';
import { readHostModuleIds } from '../../scripts/lib/host-modules.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const HOST_FILE = path.join(ROOT, 'src/engine/settings/settingRuntimeHost.js');

const findArchive = () => {
  for (const candidate of ['dist/fallout.trpg', '/tmp/fallout-e2e.trpg']) {
    const full = path.isAbsolute(candidate) ? candidate : path.join(ROOT, candidate);
    if (fs.existsSync(full)) return full;
  }
  return null;
};

const ARCHIVE = findArchive();

const hostModuleIds = () => readHostModuleIds(HOST_FILE);

/**
 * Заглушка на любой запрос. `__esModule` намеренно не отдаётся: иначе
 * interop-обёртка пакета считает модуль уже собранным и не создаёт `default`,
 * из-за чего импорт превращается в undefined.
 */
const permissiveModule = () => {
  const stub = new Proxy(function stub() {}, {
    get: (_target, key) => {
      if (key === '__esModule' || key === 'then' || key === Symbol.toPrimitive) return undefined;
      return stub;
    },
    apply: () => stub,
    construct: () => stub,
  });
  return stub;
};

/**
 * Собрать карту host-модулей так, как это делает приложение.
 *
 * `react-native` подключается литеральным импортом: его настоящий исходник —
 * Flow, поэтому в тестах он подменён заглушкой через setup-файл.
 */
const loadHostModules = async () => {
  // Та же форма, что в приложении: фасад без собственных свойств (hostModule.js).
  // Без неё interop-обёртка пакета подменяет default и `store.getState`
  // перестаёт быть функцией — ровно тот баг, от которого фасад и защищает.
  const { hostModule } = await import('../../src/engine/settings/hostModule');
  const modules = {};
  for (const id of hostModuleIds()) {
    // Реестр расширений состояния в тестах уже занят фикстурой
    // (src/store/__test-setup__/settingRuntimeFixture.js), которая активирует
    // Fallout глобально. Настоящая активация пакета упёрлась бы в «уже
    // зарегистрировано» — и это ограничение тестовой обвязки, а не приложения:
    // в приложении активация одна. Поэтому только этот модуль подменён.
    if (id === 'engine:src/store/stateExtensions') {
      modules[id] = permissiveModule();
      continue;
    }
    if (id === 'react-native') {
      modules[id] = hostModule(await import('react-native'));
      continue;
    }
    const specifier = id.startsWith('engine:') ? `../../${id.slice('engine:'.length)}` : id;
    modules[id] = hostModule(await import(/* @vite-ignore */ specifier));
  }
  return modules;
};

// Кэш пакета: настоящий офлайн-кэш на IndexedDB, в Node его нет — держим файлы
// в памяти, но с теми же проверками ключа и allowlist.
const store = vi.hoisted(() => new Map());

// react-native НЕ мокаем здесь: в setup-файле уже есть полная заглушка
// (компоненты, StyleSheet, Dimensions). Свой минимальный мок её перекрывает и
// ломает импорт настоящих модулей движка.
vi.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digest: vi.fn(async () => new Uint8Array(32).fill(0x11).buffer),
}));
vi.mock('../../src/engine/settings/settingPackageCache', () => ({
  cacheSettingPackage: vi.fn(async ({ manifest, digest, files }) => {
    const cacheKey = `${manifest.id}/${digest}`;
    store.set(cacheKey, new Map(files.map((file) => [file.path, file.bytes])));
    return cacheKey;
  }),
  deleteCachedSettingPackage: vi.fn(async (cacheKey) => store.delete(cacheKey)),
  readCachedSettingFile: vi.fn(async (cacheKey, filePath) => (
    store.get(cacheKey)?.get(filePath) ?? null
  )),
  getCachedSettingFileUri: vi.fn(async (cacheKey, filePath) => (
    store.get(cacheKey)?.has(filePath) ? `file://cache/${cacheKey}/${filePath}` : null
  )),
}));

const run = async () => {
  const { installSettingPackage } = await import('../../src/engine/settings/settingPackageInstaller');
  const { openSettingPackageRuntime } = await import('../../src/engine/settings/settingPackageRuntime');

  const bytes = new Uint8Array(fs.readFileSync(ARCHIVE));
  const installed = await installSettingPackage({ name: path.basename(ARCHIVE), bytes });
  const runtime = await openSettingPackageRuntime(installed.cacheKey);
  const modules = await loadHostModules();

  const activated = await runtime.loadModule({
    settingId: installed.id,
    apiVersion: 1,
    modules,
    activations: [],
    disposals: [],
  });
  return { installed, activated, modules };
};

describe.skipIf(!ARCHIVE)('настоящий пакет Fallout проходит установку и активацию', () => {
  // Активация — одна на весь набор: сеттинг регистрирует расширения состояния,
  // и вторая активация без dispose законно падает «уже зарегистрировано».
  let installed;
  let activated;

  beforeAll(async () => {
    ({ installed, activated } = await run());
  }, 180000);

  afterAll(async () => {
    if (!activated) return;
    const { disposeSettingPackageModule } = await import('../../src/engine/settings/settingPackageRuntime');
    disposeSettingPackageModule(activated);
  }, 60000);

  it('ставится без ошибок и объявляет runtime', async () => {
    expect(installed.id).toBe('fallout');
    expect(installed.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(installed.cacheKey).toBe(`fallout/${installed.digest}`);
    expect(installed.runtime).toMatchObject({ apiVersion: 1, entry: 'runtime/setting.cjs' });
  }, 120000);

  it('активируется настоящим бандлом и отдаёт четыре экрана в слотах', async () => {
    expect(activated.id).toBe('fallout');
    expect(activated.screens.map((screen) => [screen.slot, screen.id, screen.route])).toEqual([
      ['screen:1', 'character', 'SettingScreen1'],
      ['screen:2', 'equipment', 'SettingScreen2'],
      ['screen:3', 'inventory', 'SettingScreen3'],
      ['screen:4', 'perks', 'SettingScreen4'],
    ]);
  }, 120000);

  it('экраны — настоящие компоненты, а не заглушки', async () => {
    for (const screen of activated.screens) {
      expect(typeof screen.component).toBe('function');
      expect(screen.component.displayName || screen.component.name).toBeTruthy();
    }
  }, 120000);

  it('объявленные возможности закрыты реальными сервисами', async () => {
    const { checkDeclaredServices } = await import('../../src/engine/settings/settingCompatibility');
    expect(checkDeclaredServices({
      manifest: activated.manifest,
      services: activated.services,
    })).toEqual([]);
  }, 120000);

  it('палитра вкладок и глобальные наложения на месте', async () => {
    expect(activated.theme.tabBar).toEqual({
      background: '#1a1a1a', active: '#f0e68c', inactive: 'gray',
    });
    expect(Object.keys(activated.globalComponents)).toEqual([
      'survivalClock', 'fusionCoreChoice', 'powerCoreClock',
    ]);
  }, 120000);

  it('пакет собран из того же манифеста, что в репозитории', async () => {
    const entries = unzipSync(new Uint8Array(fs.readFileSync(ARCHIVE)), {
      filter: (entry) => entry.name.endsWith('/manifest.json'),
    });
    const [archiveManifestBytes] = Object.values(entries);
    const archiveManifest = JSON.parse(new TextDecoder().decode(archiveManifestBytes));
    const repositoryManifest = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'modules/fallout/manifest.json'), 'utf8'),
    );
    expect(archiveManifest.compatibility).toEqual(repositoryManifest.compatibility);
    expect(archiveManifest.capabilities).toEqual(repositoryManifest.capabilities);
    expect(archiveManifest.hostModules).toEqual(repositoryManifest.hostModules);
  }, 120000);
});
