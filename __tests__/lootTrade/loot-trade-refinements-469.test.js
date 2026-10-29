import fs from 'fs';
import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WebSocket from 'ws';

const alertCalls = [];

vi.mock('react-native', () => ({
  Platform: { OS: 'web', select: (obj) => obj?.web ?? obj?.default },
}));

vi.mock('../../db', () => import('../../db/Database.web.js'));

vi.mock('../../components/alerts/alertService', () => ({
  showRawAlert: vi.fn((cfg) => {
    alertCalls.push(cfg);
  }),
  showCatalogAlert: vi.fn(),
}));

const cloudDeleteMock = vi.fn().mockResolvedValue({ ok: true });
const cloudSyncMock = vi.fn().mockResolvedValue({ ok: true });

vi.mock('../../components/cloudSync/googleDriveSync', () => ({
  syncCharacterToCloudIfEnabled: vi.fn().mockResolvedValue({ ok: true }),
  deleteCharacterFromCloudIfEnabled: vi.fn().mockResolvedValue({ ok: true }),
  syncGmContainerToCloudIfEnabled: (...args) => cloudSyncMock(...args),
  deleteGmContainerFromCloudIfEnabled: (...args) => cloudDeleteMock(...args),
  syncAllCharactersWithCloud: vi.fn().mockResolvedValue({ uploaded: 0, downloaded: 0 }),
  openCloudFolderInDrive: vi.fn().mockResolvedValue(undefined),
}));

import {
  QUANTITY_UNIT,
  AMMO_FOUND_BY_ID,
  isAmmoItem,
  getAmmoFoundSpec,
  formatAmmoFoundFormula,
  resolveQuantitySpec,
} from '../../domain/lootTrade';
import * as db from '../../db';
import { createRoomServer } from '../../server/roomServer.js';
import { createRoomClient } from '../../src/room/roomClient';
import { ROOM_MESSAGE } from '../../src/room/roomProtocol';
import useRoomStore, {
  setRoomClientFactoryForTests,
  resetRoomClientForTests,
} from '../../src/room/roomStore';
import { setCurrentLocale } from '../../i18n/locale';
import {
  startGmSessionPersistence,
  resetPromptedEmptySessionsForTests,
} from '../../src/lootTrade/gmSessionPersistence';

const repoRoot = path.resolve(__dirname, '../..');

describe('Патч 469 — доработки «Добычи/Торговли» (3d20, пачки патронов, автозакрытие пустого лута, серый+жёлтый стиль)', () => {
  beforeEach(async () => {
    setCurrentLocale('ru-RU');
    alertCalls.length = 0;
    cloudDeleteMock.mockClear();
    cloudSyncMock.mockClear();
    resetPromptedEmptySessionsForTests();
    resetRoomClientForTests();
    useRoomStore.setState({ status: 'offline', rooms: {}, lastError: null });
    if (typeof localStorage !== 'undefined') localStorage.clear();
    await db.initDatabase();
  });

  it('бросок 3d20 возвращает честную сумму 3 костей d20 (а не число кубов 3) для крышек и предметов', () => {
    const seq = [14, 7, 19];
    const deterministic = resolveQuantitySpec(
      { count: 3, unit: QUANTITY_UNIT.D20 },
      { rollSingleD20: (idx) => seq[idx] },
    );
    expect(deterministic.rolled).toBe(true);
    expect(deterministic.unit).toBe('d20');
    expect(deterministic.diceCount).toBe(3);
    expect(deterministic.rolls).toEqual([14, 7, 19]);
    expect(deterministic.quantity).toBe(40);

    // Проверяем реальный генератор без моков на 40 прогонах 3d20:
    // все значения в диапазоне 3..60 и не залипают на константе 3!
    const realTotals = [];
    for (let i = 0; i < 40; i += 1) {
      const r = resolveQuantitySpec({ count: 3, unit: QUANTITY_UNIT.D20 });
      expect(r.rolls).toHaveLength(3);
      expect(r.quantity).toBe(r.rolls.reduce((s, x) => s + x, 0));
      expect(r.quantity).toBeGreaterThanOrEqual(3);
      expect(r.quantity).toBeLessThanOrEqual(60);
      realTotals.push(r.quantity);
    }
    expect(realTotals.some((val) => val > 3)).toBe(true);
  });

  it('таблица нахождения патронов 1-в-1 совпадает с docs/reference-data/ammo-found-table.json и покрывает все патроны модуля', () => {
    const refTable = JSON.parse(
      fs.readFileSync(path.join(repoRoot, 'docs/reference-data/ammo-found-table.json'), 'utf8'),
    );
    for (const row of refTable) {
      expect(AMMO_FOUND_BY_ID[row.id]).toEqual({
        base: row.found.base,
        cd: row.found.cd,
      });
    }

    const catalogAmmo = JSON.parse(
      fs.readFileSync(path.join(repoRoot, 'modules/fallout/data/equipment/ammo.json'), 'utf8'),
    );
    for (const ammo of catalogAmmo) {
      expect(isAmmoItem({ ...ammo, itemType: 'ammo' })).toBe(true);
      const spec = getAmmoFoundSpec(ammo);
      expect(spec.base).toBeGreaterThanOrEqual(1);
      expect(spec.cd).toBeGreaterThanOrEqual(0);
    }

    // 1 пачка .308 = 6 + 3 CD; за 3 пачки = 18 + 9 CD
    const roll308 = resolveQuantitySpec(
      {
        count: 3,
        unit: QUANTITY_UNIT.PACKS,
        item: { id: 'ammo_308', itemType: 'ammo' },
      },
      {
        rollCombatDice: (n) => {
          expect(n).toBe(9);
          return { total: 11, rolls: [1, 2, 1, 0, 2, 1, 2, 1, 1], effects: 3 };
        },
      },
    );
    expect(roll308.packCount).toBe(3);
    expect(roll308.formula).toBe('6 + 3 CD');
    expect(roll308.totalFormula).toBe('18 + 9 CD');
    expect(roll308.quantity).toBe(29); // 18 + 11

    // Ядерный блок (1 без кубов): 2 пачки = ровно 2 шт.
    const rollCore = resolveQuantitySpec({
      count: 2,
      unit: QUANTITY_UNIT.PACKS,
      item: { id: 'ammo_fusion_core', itemType: 'ammo' },
    });
    expect(formatAmmoFoundFormula(getAmmoFoundSpec('ammo_fusion_core'))).toBe('1');
    expect(rollCore.quantity).toBe(2);
  });

  it('когда забирают последний предмет из контейнера добычи — раздача и модалка закрываются, а Мастер получает вопрос «Контейнер пуст. Хотите удалить?»', async () => {
    const app = createRoomServer({ port: 0, host: '127.0.0.1', distDir: '/nonexistent' });
    const { port } = await app.start();
    const wsUrl = `ws://127.0.0.1:${port}/ws`;
    const prevEnvUrl = process.env.EXPO_PUBLIC_ROOM_SERVER_URL;
    process.env.EXPO_PUBLIC_ROOM_SERVER_URL = wsUrl;

    // Подключаем GM через useRoomStore + фоновую службу сохранения Мастера
    setRoomClientFactoryForTests((input) => createRoomClient({
      url: wsUrl,
      clientId: 'gm-empty-test:tab1',
      webSocketFactory: (u) => new WebSocket(u),
      onStatus: input.onStatus,
      onMessage: input.onMessage,
    }));
    const stopPersistence = startGmSessionPersistence();

    const playerBox = [];
    const playerWs = createRoomClient({
      url: wsUrl,
      clientId: 'player-empty-test:tab1',
      webSocketFactory: (u) => new WebSocket(u),
      onStatus: () => {},
      onMessage: (m) => playerBox.push(m),
    });

    const waitPlayerMsg = (pred, timeoutMs = 4000) => new Promise((resolve, reject) => {
      const started = Date.now();
      const t = setInterval(() => {
        const idx = playerBox.findIndex(pred);
        if (idx >= 0) {
          const [hit] = playerBox.splice(idx, 1);
          clearInterval(t);
          resolve(hit);
          return;
        }
        if (Date.now() - started > timeoutMs) {
          clearInterval(t);
          reject(new Error('timeout waiting player msg'));
        }
      }, 12);
    });

    try {
      const created = await useRoomStore.getState().createRoom({ name: 'Кампания Пустоши' });
      const code = created.code;
      await useRoomStore.getState().joinRoom({ code, name: 'GM', role: 'gm' });

      playerWs.send('room.join', { code, name: 'Выживший', role: 'player', requestId: 'jp1' }, code);
      await waitPlayerMsg((m) => m.type === 'room.state' && m.payload?.requestId === 'jp1');

      const savedLoot = await db.saveGmContainer({
        id: 'cnt_test_auto_close',
        kind: 'loot',
        name: 'Ящик с припасами',
        roomCode: code,
        roomName: 'Кампания Пустоши',
        items: [
          { entryId: 'e1', itemId: 'chem_stimpak', itemType: 'chems', name: 'Стимулятор', quantity: 2, cost: 40, weight: 0 },
        ],
      });

      const opened = await useRoomStore.getState().openRoomSession({
        code,
        session: {
          containerId: savedLoot.id,
          kind: 'loot',
          name: savedLoot.name,
          targetType: 'room',
          items: savedLoot.items,
        },
      });
      await waitPlayerMsg((m) => m.type === 'session.state' && m.payload?.session?.sessionId === opened.sessionId);

      // 1) Игрок берёт только 1 из 2 стимуляторов — контейнер НЕ пуст, раздача продолжается
      playerWs.send(ROOM_MESSAGE.SESSION_LOOT_TAKE, {
        code,
        sessionId: opened.sessionId,
        characterId: 'char_1',
        takes: [{ entryId: 'e1', quantity: 1 }],
        requestId: 'take-partial',
      }, code);
      const partialRes = await waitPlayerMsg((m) => m.type === ROOM_MESSAGE.SESSION_LOOT_TAKE && m.payload?.requestId === 'take-partial');
      expect(partialRes.payload.session?.items).toHaveLength(1);
      expect(partialRes.payload.session?.items[0].quantity).toBe(1);
      expect(alertCalls).toHaveLength(0);

      // 2) Игрок забирает последний стимулятор — сессия автоматически закрывается (session: null)!
      playerWs.send(ROOM_MESSAGE.SESSION_LOOT_TAKE, {
        code,
        sessionId: opened.sessionId,
        characterId: 'char_1',
        takes: [{ entryId: 'e1', quantity: 1 }],
        requestId: 'take-final',
      }, code);
      const finalRes = await waitPlayerMsg((m) => m.type === ROOM_MESSAGE.SESSION_LOOT_TAKE && m.payload?.requestId === 'take-final');
      expect(finalRes.payload.granted).toHaveLength(1);
      expect(finalRes.payload.session).toBeNull();
      expect(finalRes.payload.closedReason).toBe('loot_emptied');

      // Ждём обработки фоновым слушателем Мастера
      await new Promise((r) => setTimeout(r, 80));

      expect(useRoomStore.getState().rooms[code]?.activeSession).toBeNull();
      const updatedInDb = await db.getGmContainerById(savedLoot.id);
      expect(updatedInDb.items).toEqual([]);

      // Мастеру показан вопрос «Контейнер пуст. Хотите удалить?»
      expect(alertCalls).toHaveLength(1);
      expect(alertCalls[0].title).toBe('Контейнер пуст. Хотите удалить?');

      // Нажимаем «Удалить» в модальном окне Мастера
      const deleteBtn = alertCalls[0].buttons.find((b) => b.style === 'destructive');
      expect(deleteBtn).toBeTruthy();
      deleteBtn.onPress();
      await new Promise((r) => setTimeout(r, 60));

      expect(await db.getGmContainerById(savedLoot.id)).toBeNull();
      expect(cloudDeleteMock).toHaveBeenCalledWith(savedLoot.id);
    } finally {
      if (prevEnvUrl === undefined) delete process.env.EXPO_PUBLIC_ROOM_SERVER_URL;
      else process.env.EXPO_PUBLIC_ROOM_SERVER_URL = prevEnvUrl;
      stopPersistence();
      playerWs.close();
      await app.close();
    }
  });

  it('все модалки «Добычи/Торговли» используют серо-жёлтую палитру приложения, а модалка лута игрока имеет увеличенные отступы и воздух', () => {
    const modalFiles = [
      'components/screens/LootTradeScreen/modals/ContainerFormModal.js',
      'components/screens/LootTradeScreen/modals/ContainerItemConfigModal.js',
      'components/screens/LootTradeScreen/modals/ContainerCatalogModal.js',
      'components/screens/LootTradeScreen/modals/IssueContainerModal.js',
      'components/lootTrade/PlayerLootTradeOverlay.js',
    ];

    for (const relPath of modalFiles) {
      const src = fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
      expect(src).toContain('#1f1f1f');
      expect(src).toContain('#f0e68c');
      // Никаких сине-сланцевых и ярко-зелёных цветов в новых модалках
      expect(src).not.toContain('#111827');
      expect(src).not.toContain('#1f2937');
      expect(src).not.toContain('#2e7d32');
      expect(src).not.toContain('#15803d');
    }

    // Модалка настройки предмета использует режим пачек для патронов без выбора шт./CD/d20
    const itemConfigSrc = fs.readFileSync(
      path.join(repoRoot, 'components/screens/LootTradeScreen/modals/ContainerItemConfigModal.js'),
      'utf8',
    );
    expect(itemConfigSrc).toContain('QUANTITY_UNIT.PACKS');
    expect(itemConfigSrc).toContain('itemConfig.packsLabel');
    expect(itemConfigSrc).toContain('itemConfig.packFormulaBadge');

    // У модалки лута игрока просторные внешние отступы по краям и внутренний воздух
    const overlaySrc = fs.readFileSync(
      path.join(repoRoot, 'components/lootTrade/PlayerLootTradeOverlay.js'),
      'utf8',
    );
    expect(overlaySrc).toContain('lootModalBackdrop');
    expect(overlaySrc).toContain('paddingHorizontal: 28');
    expect(overlaySrc).toContain('paddingVertical: 36');
    expect(overlaySrc).toContain('paddingHorizontal: 24');
    expect(overlaySrc).toContain('paddingVertical: 22');
  });
});
