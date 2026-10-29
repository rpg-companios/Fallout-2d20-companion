import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WebSocket from 'ws';

vi.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

vi.mock('../../db', () => import('../../db/Database.web.js'));

const alertCalls = [];
vi.mock('../../components/alerts/alertService', () => ({
  showRawAlert: (opts) => {
    alertCalls.push(opts);
  },
  showAlert: vi.fn(),
  showConfirm: vi.fn(),
  showPrompt: vi.fn(),
}));

vi.mock('../../components/cloudSync/googleDriveSync', () => ({
  syncCharacterToCloudIfEnabled: vi.fn().mockResolvedValue({ ok: true }),
  deleteCharacterFromCloudIfEnabled: vi.fn().mockResolvedValue({ ok: true }),
  syncGmContainerToCloudIfEnabled: vi.fn().mockResolvedValue({ ok: true }),
  deleteGmContainerFromCloudIfEnabled: vi.fn().mockResolvedValue({ ok: true }),
  syncAllCharactersWithCloud: vi.fn().mockResolvedValue({ uploaded: 0, downloaded: 0 }),
  openCloudFolderInDrive: vi.fn().mockResolvedValue(undefined),
}));

import { createRoomServer } from '../../server/roomServer.js';
import { createRoomClient } from '../../src/room/roomClient';
import { ROOM_MESSAGE } from '../../src/room/roomProtocol';
import useRoomStore, {
  resetRoomClientForTests,
  setRoomClientFactoryForTests,
} from '../../src/room/roomStore';
import * as db from '../../db';
import {
  resetPromptedEmptySessionsForTests,
  startGmSessionPersistence,
} from '../../src/lootTrade/gmSessionPersistence';
import { setCurrentLocale } from '../../i18n/locale';
import { tLootTrade } from '../../components/screens/LootTradeScreen/logic/lootTradeI18n';

const repoRoot = path.resolve(__dirname, '../..');

const makeWaitMsg = () => (box, pred, timeoutMs = 4000) => new Promise((resolve, reject) => {
  const started = Date.now();
  const timer = setInterval(() => {
    const idx = box.findIndex(pred);
    if (idx >= 0) {
      const [hit] = box.splice(idx, 1);
      clearInterval(timer);
      resolve(hit);
      return;
    }
    if (Date.now() - started > timeoutMs) {
      clearInterval(timer);
      reject(new Error('timeout waiting WS message'));
    }
  }, 12);
});

describe('Патч 470 — кнопка «Закрыть» рядом со «Свернуть», закрытие пустого контейнера и сохранение подключения для других игроков', () => {
  beforeEach(async () => {
    setCurrentLocale('ru-RU');
    alertCalls.length = 0;
    resetPromptedEmptySessionsForTests();
    resetRoomClientForTests();
    setRoomClientFactoryForTests(null);
    useRoomStore.setState({ status: 'offline', clientId: null, rooms: {}, lastError: null });
    await db.initDatabase();
  });

  it('если в комнате несколько игроков: забравший всё закрывается сразу, а у второго игрока подключение остаётся до его «Закрыть» (без подтверждения на пустом)', async () => {
    const app = createRoomServer({ port: 0, host: '127.0.0.1', distDir: '/nonexistent' });
    const { port } = await app.start();
    const wsUrl = `ws://127.0.0.1:${port}/ws`;
    const waitMsg = makeWaitMsg();

    const prevEnvUrl = process.env.EXPO_PUBLIC_ROOM_SERVER_URL;
    process.env.EXPO_PUBLIC_ROOM_SERVER_URL = wsUrl;

    setRoomClientFactoryForTests((input) => createRoomClient({
      ...input,
      webSocketFactory: (u) => new WebSocket(u),
    }));
    const stopPersistence = startGmSessionPersistence();

    const p1Box = [];
    const p2Box = [];
    const p1 = createRoomClient({
      url: wsUrl,
      clientId: 'player-one:tab1',
      webSocketFactory: (u) => new WebSocket(u),
      onStatus: () => {},
      onMessage: (m) => p1Box.push(m),
    });
    const p2 = createRoomClient({
      url: wsUrl,
      clientId: 'player-two:tab2',
      webSocketFactory: (u) => new WebSocket(u),
      onStatus: () => {},
      onMessage: (m) => p2Box.push(m),
    });

    try {
      const created = await useRoomStore.getState().createRoom({ name: 'Лагерь рейдеров' });
      const code = created.code;
      await useRoomStore.getState().joinRoom({ code, name: 'GM', role: 'gm' });

      p1.send(ROOM_MESSAGE.ROOM_JOIN, { code, name: 'Игрок 1', role: 'player', requestId: 'j1' }, code);
      await waitMsg(p1Box, (m) => m.type === ROOM_MESSAGE.ROOM_STATE && m.payload?.requestId === 'j1');

      p2.send(ROOM_MESSAGE.ROOM_JOIN, { code, name: 'Игрок 2', role: 'player', requestId: 'j2' }, code);
      await waitMsg(p2Box, (m) => m.type === ROOM_MESSAGE.ROOM_STATE && m.payload?.requestId === 'j2');

      const savedLoot = await db.saveGmContainer({
        id: 'cnt_multi_viewer_empty',
        kind: 'loot',
        name: 'Сундук рейдеров',
        roomCode: code,
        roomName: 'Лагерь рейдеров',
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
      await waitMsg(p1Box, (m) => m.type === ROOM_MESSAGE.SESSION_STATE && m.payload?.session?.sessionId === opened.sessionId);
      await waitMsg(p2Box, (m) => m.type === ROOM_MESSAGE.SESSION_STATE && m.payload?.session?.sessionId === opened.sessionId);

      // Игрок 1 забирает всё из сундука:
      // для Игрока 1 он помечается закрытым (closedByClientIds включает player-one:tab1),
      // но т.к. Игрок 2 всё ещё смотрит в сундук — сессия остаётся активной для Игрока 2!
      p1.send(ROOM_MESSAGE.SESSION_LOOT_TAKE, {
        code,
        sessionId: opened.sessionId,
        characterId: 'char_p1',
        takes: [{ entryId: 'e1', quantity: 2 }],
        requestId: 'take-all-p1',
      }, code);

      const takeRes = await waitMsg(
        p1Box,
        (m) => m.type === ROOM_MESSAGE.SESSION_LOOT_TAKE && m.payload?.requestId === 'take-all-p1',
      );
      expect(takeRes.payload.granted).toHaveLength(1);
      expect(takeRes.payload.session).not.toBeNull();
      expect(takeRes.payload.session.items).toEqual([]);
      expect(takeRes.payload.session.closedByClientIds).toContain('player-one:tab1');
      expect(takeRes.payload.session.closedByClientIds).not.toContain('player-two:tab2');

      // Игрок 2 получает обновлённое состояние пустого контейнера — его подключение не оборвано
      const p2Update = await waitMsg(
        p2Box,
        (m) => m.type === ROOM_MESSAGE.SESSION_STATE && Array.isArray(m.payload?.session?.items) && m.payload.session.items.length === 0,
      );
      expect(p2Update.payload.session.sessionId).toBe(opened.sessionId);
      expect(alertCalls).toHaveLength(0);

      // Теперь Игрок 2 нажимает «Закрыть» на пустом контейнере — раздача сразу глушится целиком
      p2.send(ROOM_MESSAGE.SESSION_PLAYER_CLOSE, {
        code,
        sessionId: opened.sessionId,
        requestId: 'close-p2',
      }, code);

      const closeRes = await waitMsg(
        p2Box,
        (m) => m.type === ROOM_MESSAGE.SESSION_STATE && m.payload?.requestId === 'close-p2',
      );
      expect(closeRes.payload.session).toBeNull();
      expect(closeRes.payload.closedReason).toBe('loot_emptied');

      await new Promise((r) => setTimeout(r, 80));
      expect(useRoomStore.getState().rooms[code]?.activeSession).toBeNull();
      expect(alertCalls).toHaveLength(1);
      expect(alertCalls[0].title).toBe('Контейнер пуст. Хотите удалить?');
    } finally {
      if (prevEnvUrl === undefined) delete process.env.EXPO_PUBLIC_ROOM_SERVER_URL;
      else process.env.EXPO_PUBLIC_ROOM_SERVER_URL = prevEnvUrl;
      stopPersistence();
      p1.close();
      p2.close();
      await app.close();
    }
  });

  it('при непустом контейнере закрытие первым игроком сохраняет раздачу второму, а закрытие последним глушит раздачу с сохранением остатка у Мастера', async () => {
    const app = createRoomServer({ port: 0, host: '127.0.0.1', distDir: '/nonexistent' });
    const { port } = await app.start();
    const wsUrl = `ws://127.0.0.1:${port}/ws`;
    const waitMsg = makeWaitMsg();

    const prevEnvUrl = process.env.EXPO_PUBLIC_ROOM_SERVER_URL;
    process.env.EXPO_PUBLIC_ROOM_SERVER_URL = wsUrl;

    setRoomClientFactoryForTests((input) => createRoomClient({
      ...input,
      webSocketFactory: (u) => new WebSocket(u),
    }));
    const stopPersistence = startGmSessionPersistence();

    const p1Box = [];
    const p2Box = [];
    const p1 = createRoomClient({
      url: wsUrl,
      clientId: 'partial-p1:tab1',
      webSocketFactory: (u) => new WebSocket(u),
      onStatus: () => {},
      onMessage: (m) => p1Box.push(m),
    });
    const p2 = createRoomClient({
      url: wsUrl,
      clientId: 'partial-p2:tab2',
      webSocketFactory: (u) => new WebSocket(u),
      onStatus: () => {},
      onMessage: (m) => p2Box.push(m),
    });

    try {
      const created = await useRoomStore.getState().createRoom({ name: 'Убежище 81' });
      const code = created.code;
      await useRoomStore.getState().joinRoom({ code, name: 'GM', role: 'gm' });

      p1.send(ROOM_MESSAGE.ROOM_JOIN, { code, name: 'Игрок 1', role: 'player', requestId: 'jp1' }, code);
      await waitMsg(p1Box, (m) => m.type === ROOM_MESSAGE.ROOM_STATE && m.payload?.requestId === 'jp1');

      p2.send(ROOM_MESSAGE.ROOM_JOIN, { code, name: 'Игрок 2', role: 'player', requestId: 'jp2' }, code);
      await waitMsg(p2Box, (m) => m.type === ROOM_MESSAGE.ROOM_STATE && m.payload?.requestId === 'jp2');

      const savedLoot = await db.saveGmContainer({
        id: 'cnt_partial_close',
        kind: 'loot',
        name: 'Шкафчик охраны',
        roomCode: code,
        roomName: 'Убежище 81',
        items: [
          { entryId: 'e1', itemId: 'ammo_10mm', itemType: 'ammo', name: 'Патрон 10 мм', quantity: 14, cost: 2, weight: 0 },
          { entryId: 'e2', itemId: 'chem_radaway', itemType: 'chems', name: 'Антирадин', quantity: 1, cost: 80, weight: 0 },
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
      await waitMsg(p1Box, (m) => m.type === ROOM_MESSAGE.SESSION_STATE && m.payload?.session?.sessionId === opened.sessionId);
      await waitMsg(p2Box, (m) => m.type === ROOM_MESSAGE.SESSION_STATE && m.payload?.session?.sessionId === opened.sessionId);

      // Игрок 1 забрал только патроны (остался Антирадин) и подтвердил «Закрыть»
      p1.send(ROOM_MESSAGE.SESSION_LOOT_TAKE, {
        code,
        sessionId: opened.sessionId,
        characterId: 'char_p1',
        takes: [{ entryId: 'e1', quantity: 14 }],
        requestId: 'take-ammo',
      }, code);
      await waitMsg(p1Box, (m) => m.type === ROOM_MESSAGE.SESSION_LOOT_TAKE && m.payload?.requestId === 'take-ammo');

      p1.send(ROOM_MESSAGE.SESSION_PLAYER_CLOSE, {
        code,
        sessionId: opened.sessionId,
        requestId: 'close-p1-partial',
      }, code);
      const p1Close = await waitMsg(
        p1Box,
        (m) => m.type === ROOM_MESSAGE.SESSION_STATE && m.payload?.requestId === 'close-p1-partial',
      );
      // Игрок 2 ещё открыт -> сессия жива, но Игрок 1 записан в closedByClientIds
      expect(p1Close.payload.session).not.toBeNull();
      expect(p1Close.payload.session.closedByClientIds).toContain('partial-p1:tab1');
      expect(p1Close.payload.session.items).toHaveLength(1);
      expect(p1Close.payload.session.items[0].itemId).toBe('chem_radaway');

      // Игрок 2 тоже решает не брать Антирадин и закрывает контейнер
      p2.send(ROOM_MESSAGE.SESSION_PLAYER_CLOSE, {
        code,
        sessionId: opened.sessionId,
        requestId: 'close-p2-partial',
      }, code);
      const p2Close = await waitMsg(
        p2Box,
        (m) => m.type === ROOM_MESSAGE.SESSION_STATE && m.payload?.requestId === 'close-p2-partial',
      );
      expect(p2Close.payload.session).toBeNull();
      expect(p2Close.payload.closedReason).toBe('player_closed');

      await new Promise((r) => setTimeout(r, 80));
      expect(useRoomStore.getState().rooms[code]?.activeSession).toBeNull();

      // Остаток (1 Антирадин) сохранён у Мастера, запрос на удаление пустого НЕ выскакивал
      const storedAfter = await db.getGmContainerById(savedLoot.id);
      expect(storedAfter.items).toHaveLength(1);
      expect(storedAfter.items[0].itemId).toBe('chem_radaway');
      expect(alertCalls).toHaveLength(0);
    } finally {
      if (prevEnvUrl === undefined) delete process.env.EXPO_PUBLIC_ROOM_SERVER_URL;
      else process.env.EXPO_PUBLIC_ROOM_SERVER_URL = prevEnvUrl;
      stopPersistence();
      p1.close();
      p2.close();
      await app.close();
    }
  });

  it('если последний просматривающий игрок закрывает вкладку (disconnect), опустевшая/закрытая остальными раздача автоматически завершается', async () => {
    const app = createRoomServer({ port: 0, host: '127.0.0.1', distDir: '/nonexistent' });
    const { port } = await app.start();
    const wsUrl = `ws://127.0.0.1:${port}/ws`;
    const waitMsg = makeWaitMsg();

    const prevEnvUrl = process.env.EXPO_PUBLIC_ROOM_SERVER_URL;
    process.env.EXPO_PUBLIC_ROOM_SERVER_URL = wsUrl;

    setRoomClientFactoryForTests((input) => createRoomClient({
      ...input,
      webSocketFactory: (u) => new WebSocket(u),
    }));
    const stopPersistence = startGmSessionPersistence();

    const p1Box = [];
    const p2Box = [];
    const p1 = createRoomClient({
      url: wsUrl,
      clientId: 'disc-p1:tab1',
      webSocketFactory: (u) => new WebSocket(u),
      onStatus: () => {},
      onMessage: (m) => p1Box.push(m),
    });
    const p2 = createRoomClient({
      url: wsUrl,
      clientId: 'disc-p2:tab2',
      webSocketFactory: (u) => new WebSocket(u),
      onStatus: () => {},
      onMessage: (m) => p2Box.push(m),
    });

    try {
      const created = await useRoomStore.getState().createRoom({ name: 'Конкорд' });
      const code = created.code;
      await useRoomStore.getState().joinRoom({ code, name: 'GM', role: 'gm' });

      p1.send(ROOM_MESSAGE.ROOM_JOIN, { code, name: 'Игрок 1', role: 'player', requestId: 'jd1' }, code);
      await waitMsg(p1Box, (m) => m.type === ROOM_MESSAGE.ROOM_STATE && m.payload?.requestId === 'jd1');

      p2.send(ROOM_MESSAGE.ROOM_JOIN, { code, name: 'Игрок 2', role: 'player', requestId: 'jd2' }, code);
      await waitMsg(p2Box, (m) => m.type === ROOM_MESSAGE.ROOM_STATE && m.payload?.requestId === 'jd2');

      const savedLoot = await db.saveGmContainer({
        id: 'cnt_disconnect_cleanup',
        kind: 'loot',
        name: 'Сумка курьера',
        roomCode: code,
        roomName: 'Конкорд',
        items: [{ entryId: 'e1', itemId: 'caps', itemType: 'caps', name: 'Крышки', quantity: 50, cost: 1, weight: 0 }],
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
      await waitMsg(p1Box, (m) => m.type === ROOM_MESSAGE.SESSION_STATE && m.payload?.session?.sessionId === opened.sessionId);
      await waitMsg(p2Box, (m) => m.type === ROOM_MESSAGE.SESSION_STATE && m.payload?.session?.sessionId === opened.sessionId);

      // Игрок 1 забирает все 50 крышек
      p1.send(ROOM_MESSAGE.SESSION_LOOT_TAKE, {
        code,
        sessionId: opened.sessionId,
        characterId: 'char_p1',
        takes: [{ entryId: 'e1', quantity: 50 }],
        requestId: 'take-caps',
      }, code);
      await waitMsg(p1Box, (m) => m.type === ROOM_MESSAGE.SESSION_LOOT_TAKE && m.payload?.requestId === 'take-caps');

      // Игрок 2 закрывает вкладку (отключается от комнаты) -> раздача автоматически гасится
      p2.close();
      await new Promise((r) => setTimeout(r, 100));

      expect(useRoomStore.getState().rooms[code]?.activeSession).toBeNull();
      expect(alertCalls).toHaveLength(1);
      expect(alertCalls[0].title).toBe('Контейнер пуст. Хотите удалить?');
    } finally {
      if (prevEnvUrl === undefined) delete process.env.EXPO_PUBLIC_ROOM_SERVER_URL;
      else process.env.EXPO_PUBLIC_ROOM_SERVER_URL = prevEnvUrl;
      stopPersistence();
      p1.close();
      p2.close();
      await app.close();
    }
  });

  it('в UI контейнера игрока рядом с кнопкой «Свернуть» размещена кнопка «Закрыть» с проверкой «Вы не всё забрали, уверены, что хотите закрыть?»', () => {
    setCurrentLocale('ru-RU');
    expect(tLootTrade('player.minimize')).toBe('Свернуть');
    expect(tLootTrade('player.close')).toBe('Закрыть');
    expect(tLootTrade('player.closeLootConfirmMessage')).toBe(
      'Вы не всё забрали, уверены, что хотите закрыть?',
    );

    const overlaySrc = fs.readFileSync(
      path.join(repoRoot, 'components/lootTrade/PlayerLootTradeOverlay.js'),
      'utf8',
    );
    expect(overlaySrc).toContain('headerActionsRow');
    expect(overlaySrc).toContain("tLootTrade('player.minimize')");
    expect(overlaySrc).toContain("tLootTrade('player.close')");
    expect(overlaySrc).toContain("tLootTrade('player.closeLootConfirmMessage')");
    expect(overlaySrc).toContain('handleCloseLootPress');
    expect(overlaySrc).toContain('markSessionClosedLocally');
    expect(overlaySrc).toContain('closedByClientIds');
  });
});
