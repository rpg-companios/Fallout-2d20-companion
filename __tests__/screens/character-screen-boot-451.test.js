// ПРИЁМОЧНЫЙ (патч 451): защита запуска приложения после отката d244911
// и битых правок ветки 01a0e86f (пропавший domain/useCharacterImage.js,
// потерянные импорты в CharacterScreen.js, пакеты expo-image-picker/ws,
// сломанная кнопка админки в CharacterScreen и необработанный error сокета
// в server/roomServer.js).
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { parse } from '@babel/parser';
import WebSocket from 'ws';

import { getAllSettings } from '../../domain/settingsCatalog.js';
import useAppSettingsStore, {
  selectAdminScreenEnabled,
} from '../../src/store/appSettingsStore.js';
import { createRoomServer } from '../../server/roomServer.js';
import { LIMITS } from '../../server/protocol.js';

const require = createRequire(import.meta.url);
const traverseModule = require('@babel/traverse');
const traverse = traverseModule.default || traverseModule;

const ROOT = path.resolve(__dirname, '../..');

const ALLOWED_GLOBALS = new Set([
  'globalThis', 'global', 'window', 'document', 'navigator', 'location',
  'console', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
  'requestAnimationFrame', 'cancelAnimationFrame', 'queueMicrotask',
  'fetch', 'URL', 'URLSearchParams', 'Blob', 'File', 'FileReader', 'FormData',
  'Headers', 'Request', 'Response', 'AbortController', 'WebSocket', 'Event', 'CustomEvent',
  'localStorage', 'sessionStorage', 'indexedDB', 'caches', 'crypto', 'performance',
  'atob', 'btoa', 'TextEncoder', 'TextDecoder', 'Intl', 'JSON', 'Math',
  'Object', 'Array', 'String', 'Number', 'Boolean', 'Symbol', 'BigInt',
  'Promise', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Date', 'RegExp',
  'Error', 'TypeError', 'RangeError', 'SyntaxError', 'ReferenceError',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURIComponent', 'decodeURIComponent',
  'Infinity', 'NaN', 'undefined', 'arguments', 'require', 'module', 'exports', 'process', '__DEV__', 'Buffer',
]);

function findUndeclaredIdentifiers(relPath) {
  const fullPath = path.join(ROOT, relPath);
  const source = fs.readFileSync(fullPath, 'utf8');
  const ast = parse(source, { sourceType: 'module', plugins: ['jsx'] });
  const undeclared = [];

  traverse(ast, {
    ReferencedIdentifier(p) {
      const { name } = p.node;
      if (ALLOWED_GLOBALS.has(name)) return;
      if (
        (p.parent.type === 'JSXOpeningElement' || p.parent.type === 'JSXClosingElement') &&
        /^[a-z]/.test(name)
      ) {
        return;
      }
      if (!p.scope.hasBinding(name)) {
        undeclared.push(`${relPath}:${p.node.loc?.start?.line ?? '?'}:${name}`);
      }
    },
  });

  return undeclared;
}

describe('патч 451: целостность запуска приложения, экранов и комнаты', () => {
  it('ключевые входные модули не содержат необъявленных идентификаторов или пропавших импортов', () => {
    const targets = [
      'App.js',
      'components/screens/HomeScreen/HomeScreen.js',
      'modules/fallout/screens/CharacterScreen/CharacterScreen.js',
      'domain/useCharacterImage.js',
    ];
    const issues = targets.flatMap(findUndeclaredIdentifiers);
    expect(issues).toEqual([]);
  });

  it('модуль аватара и зависимости сборки присутствуют без нарушений слоёв', () => {
    const hookPath = path.join(ROOT, 'domain/useCharacterImage.js');
    expect(fs.existsSync(hookPath)).toBe(true);

    const hookSource = fs.readFileSync(hookPath, 'utf8');
    expect(hookSource).not.toMatch(/from\s+['"]react-native['"]/);

    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    expect(pkg.dependencies['expo-image-picker']).toBeTruthy();
    expect(pkg.dependencies.ws).toBeTruthy();

    const gitignore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
    expect(gitignore).toContain('.install-backup/');
  });

  it('CharacterScreen не содержит сломанной кнопки админки, а тумблер adminScreenEnabled работает штатно', () => {
    const charScreen = fs.readFileSync(
      path.join(ROOT, 'modules/fallout/screens/CharacterScreen/CharacterScreen.js'),
      'utf8',
    );
    expect(charScreen).not.toContain('admin.mode.notReady');
    expect(charScreen).not.toContain('styles.adminButton');

    const adminDescriptor = getAllSettings().find((s) => s.id === 'adminScreenEnabled');
    expect(adminDescriptor).toBeDefined();
    expect(adminDescriptor.defaultValue).toBe(false);
    expect(selectAdminScreenEnabled(useAppSettingsStore.getState())).toBe(false);

    useAppSettingsStore.getState().setValue('adminScreenEnabled', true);
    expect(selectAdminScreenEnabled(useAppSettingsStore.getState())).toBe(true);
    useAppSettingsStore.getState().setValue('adminScreenEnabled', false);
    expect(selectAdminScreenEnabled(useAppSettingsStore.getState())).toBe(false);

    const ruHome = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'i18n/ru-RU/screens/home/screen.json'), 'utf8'),
    );
    const enHome = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'i18n/en-EN/screens/home/screen.json'), 'utf8'),
    );
    expect(ruHome.settings.adminScreenTitle).toBeTruthy();
    expect(ruHome.settings.adminScreenDescription).toBeTruthy();
    expect(enHome.settings.adminScreenTitle).toBeTruthy();
    expect(enHome.settings.adminScreenDescription).toBeTruthy();
  });

  it('WebSocket-сервер комнаты переживает кадр больше MAX_MESSAGE_BYTES без падения процесса', async () => {
    const app = createRoomServer({ port: 0, host: '127.0.0.1', distDir: '/nonexistent-dist' });
    const { port } = await app.start();

    try {
      const badClient = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      await new Promise((resolve, reject) => {
        badClient.once('open', resolve);
        badClient.once('error', reject);
      });

      const closed = new Promise((resolve) => {
        badClient.once('close', (code) => resolve(code));
      });
      badClient.on('error', () => {});
      badClient.send('x'.repeat(LIMITS.MAX_MESSAGE_BYTES + 1024));

      const closeCode = await closed;
      expect(closeCode).toBe(1009);

      // Сервер продолжает обслуживать новых клиентов после сброса нарушителя
      const goodClient = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      await new Promise((resolve, reject) => {
        goodClient.once('open', resolve);
        goodClient.once('error', reject);
      });
      goodClient.close();
    } finally {
      await app.close();
    }
  });

  it('apply-patch.sh указывает на рабочую ветку и проверяет целостность node_modules', () => {
    const script = fs.readFileSync(path.join(ROOT, 'apply-patch.sh'), 'utf8');
    expect(script).toContain('ARENA_BRANCH="arena/c1c60b87-fallout-2d20-companion"');
    expect(script).toContain('deps_check()');
    expect(script).toContain('deps_check || exit 1');
  });
});
