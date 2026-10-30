import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { parse } from '@babel/parser';

import {
  initDatabase,
  saveGmContainer,
  getGmContainerById,
  getGmContainersList,
  duplicateGmContainer,
  deleteGmContainer,
} from '../../db/Database.web.js';

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

describe('Патч 468 — локальная БД gm_containers, облачная синхронизация Google Drive, AST UI и автономность server/', () => {
  it('CRUD таблицы gm_containers через WebAdapter: сохранение, чтение, дублирование и удаление контейнера и торговца', async () => {
    await initDatabase();

    const chest = await saveGmContainer({
      id: 'gm_cont_test_chest',
      kind: 'loot',
      name: 'Сейф смотрителя',
      description: 'Запертый стенной сейф',
      roomCode: 'GMK9X2P4',
      items: [
        { entryId: 'e1', itemId: 'weapon_10mm_pistol', itemType: 'weapon', name: '10-мм пистолет', quantity: 1, cost: 50 },
      ],
    });
    expect(chest.id).toBe('gm_cont_test_chest');

    const merchant = await saveGmContainer({
      id: 'gm_cont_test_merch',
      kind: 'merchant',
      name: 'Карла Урна',
      description: 'Караванщица у Сэнкчуари',
      roomCode: 'GMK9X2P4',
      caps: 240,
      saleMarkupPercent: 10,
      buyDepreciationPercent: 50,
      items: [
        { entryId: 'e2', itemId: 'chem_stimpak', itemType: 'chems', name: 'Стимулятор', quantity: 6, cost: 40, markupPercent: 20 },
      ],
    });
    expect(merchant.caps).toBe(240);

    const loaded = await getGmContainerById('gm_cont_test_merch');
    expect(loaded).not.toBeNull();
    expect(loaded.name).toBe('Карла Урна');
    expect(loaded.items[0].markupPercent).toBe(20);

    const dup = await duplicateGmContainer('gm_cont_test_merch', 'копия');
    expect(dup.id).not.toBe('gm_cont_test_merch');
    expect(dup.name).toBe('Карла Урна (копия)');
    expect(dup.caps).toBe(240);
    expect(dup.items).toHaveLength(1);

    const listBeforeDelete = await getGmContainersList();
    expect(listBeforeDelete.map((c) => c.id)).toEqual(
      expect.arrayContaining(['gm_cont_test_chest', 'gm_cont_test_merch', dup.id]),
    );

    await deleteGmContainer('gm_cont_test_chest');
    await deleteGmContainer('gm_cont_test_merch');
    await deleteGmContainer(dup.id);
    expect(await getGmContainerById('gm_cont_test_chest')).toBeNull();
  });

  it('все новые модули экрана «Добыча/Торговля» и модалки игрока не имеют необъявленных идентификаторов', () => {
    const newFiles = [
      'domain/ammoFoundTable.js',
      'domain/lootTrade.js',
      'domain/premium.js',
      'src/premium/adminAccessGate.js',
      'src/lootTrade/grantCharacterItems.js',
      'src/lootTrade/gmSessionPersistence.js',
      'styles/LootTradeScreen.styles.js',
      'components/screens/LootTradeScreen/logic/lootTradeI18n.js',
      'components/screens/LootTradeScreen/LootTradeScreen.js',
      'components/screens/LootTradeScreen/modals/ContainerFormModal.js',
      'components/screens/LootTradeScreen/modals/ContainerItemConfigModal.js',
      'components/screens/LootTradeScreen/modals/ContainerCatalogModal.js',
      'components/screens/LootTradeScreen/modals/HubChildPickerModal.js',
      'components/screens/LootTradeScreen/modals/IssueContainerModal.js',
      'components/lootTrade/PlayerLootTradeOverlay.js',
    ];
    const issues = newFiles.flatMap(findUndeclaredIdentifiers);
    expect(issues).toEqual([]);
  });

  it('App.js и googleDriveSync.js содержат вкладки «Список кампаний» / «Добыча/Торговля» и синхронизацию gm_containers в appDataFolder', () => {
    const appSrc = fs.readFileSync(path.join(ROOT, 'App.js'), 'utf8');
    expect(appSrc).toContain("tApp('tabs.gmCampaigns')");
    expect(appSrc).toContain("tApp('tabs.gmLootTrade')");
    expect(appSrc).toContain('<PlayerLootTradeOverlay />');
    expect(appSrc).toContain('startGmSessionPersistence');

    const ruApp = JSON.parse(fs.readFileSync(path.join(ROOT, 'i18n/ru-RU/App.json'), 'utf8'));
    const enApp = JSON.parse(fs.readFileSync(path.join(ROOT, 'i18n/en-EN/App.json'), 'utf8'));
    expect(ruApp.tabs.gmCampaigns).toBe('Список кампаний');
    expect(ruApp.tabs.gmLootTrade).toBe('Добыча/Торговля');
    expect(enApp.tabs.gmCampaigns).toBe('Campaigns');
    expect(enApp.tabs.gmLootTrade).toBe('Loot/Trade');

    const driveSrc = fs.readFileSync(path.join(ROOT, 'components/cloudSync/googleDriveSync.js'), 'utf8');
    expect(driveSrc).toContain("const GM_CONTAINERS_FOLDER_NAME = 'gm_containers';");
    expect(driveSrc).toContain('export const syncGmContainerToCloudIfEnabled = async');
    expect(driveSrc).toContain('export const deleteGmContainerFromCloudIfEnabled = async');
    expect(driveSrc).toContain('syncGmContainersInSession');
  });

  it('изолированная копия server/ + ws (как на NetAngels в app/) загружается без доступа к domain/ и src/', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'positronium-server-468-'));
    try {
      fs.cpSync(path.join(ROOT, 'server'), path.join(tmpDir, 'server'), { recursive: true });
      fs.mkdirSync(path.join(tmpDir, 'node_modules'), { recursive: true });
      fs.symlinkSync(
        path.join(ROOT, 'node_modules', 'ws'),
        path.join(tmpDir, 'node_modules', 'ws'),
        'dir',
      );
      const out = execFileSync(
        process.execPath,
        [
          '-e',
          "const s = require('./server/start.js'); const lt = require('./server/lootTradeSession.js'); if (typeof s.createManagedAppServer !== 'function' || typeof lt.normalizeActiveSession !== 'function') process.exit(1); console.log('OK');",
        ],
        { cwd: tmpDir, encoding: 'utf8' },
      );
      expect(out.trim()).toBe('OK');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
