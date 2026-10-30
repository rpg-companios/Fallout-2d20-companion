import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import WebSocket from 'ws';

vi.mock('react-native', () => ({
  Platform: { OS: 'web' },
  Alert: { alert: vi.fn() },
}));

vi.mock('../../db', () => import('../../db/Database.web.js'));

const alertSpies = vi.hoisted(() => ({
  calls: [],
}));

vi.mock('../../components/alerts/alertService', () => ({
  showRawAlert: (opts) => {
    alertSpies.calls.push(opts);
  },
}));

vi.mock('../../components/cloudSync/googleDriveSync', () => ({
  syncGmContainerToCloudIfEnabled: vi.fn(() => Promise.resolve()),
  deleteGmContainerFromCloudIfEnabled: vi.fn(() => Promise.resolve()),
}));

import * as db from '../../db/Database.web.js';
import {
  CONTAINER_KIND,
  buildHubSessionNodes,
  duplicateContainerEntity,
  normalizeContainerEntity,
} from '../../domain/lootTrade';
import { createRoomServer } from '../../server/roomServer.js';
import { ERROR_CODE, MESSAGE } from '../../server/protocol.js';
import { ROOM_ERROR, ROOM_MESSAGE } from '../../src/room/roomProtocol';
import { createRoomClient } from '../../src/room/roomClient';
import useRoomStore, {
  resetRoomClientForTests,
  setRoomClientFactoryForTests,
} from '../../src/room/roomStore';
import {
  resetPromptedEmptySessionsForTests,
  startGmSessionPersistence,
} from '../../src/lootTrade/gmSessionPersistence';
import { setCurrentLocale } from '../../i18n/locale';

const waitFor = async (predicate, timeoutMs = 4000) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const val = await predicate();
    if (val) return val;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error('Timed out waiting for condition');
};

describe('Patch 472 — Location / Hub containers (nested merchants & loot + live locks)', () => {
  let app = null;
  let wsUrl = '';
  let stopPersistence = null;

  beforeEach(async () => {
    setCurrentLocale('ru-RU');
    alertSpies.calls.length = 0;
    resetPromptedEmptySessionsForTests();
    resetRoomClientForTests();
    setRoomClientFactoryForTests(null);
    useRoomStore.setState({ status: 'offline', clientId: null, rooms: {}, lastError: null });
    await db.initDatabase();
    const existing = await db.getGmContainersList();
    for (const c of existing) {
      await db.deleteGmContainer(c.id);
    }

    app = createRoomServer({ port: 0, host: '127.0.0.1', distDir: '/nonexistent' });
    const started = await app.start();
    wsUrl = `ws://127.0.0.1:${started.port}/ws`;
    process.env.EXPO_PUBLIC_ROOM_SERVER_URL = wsUrl;
    setRoomClientFactoryForTests((input) => createRoomClient({
      ...input,
      webSocketFactory: (u) => new WebSocket(u),
    }));
    stopPersistence = startGmSessionPersistence();
  });

  afterEach(async () => {
    if (stopPersistence) {
      stopPersistence();
      stopPersistence = null;
    }
    resetRoomClientForTests();
    setRoomClientFactoryForTests(null);
    if (app) {
      await app.close();
      app = null;
    }
  });

  it('normalizes hub entities, clones links on duplicate, and enforces 1-level nesting', () => {
    expect(ERROR_CODE.CONTAINER_LOCKED).toBe('CONTAINER_LOCKED');
    expect(ROOM_ERROR.CONTAINER_LOCKED).toBe('CONTAINER_LOCKED');

    const lootCard = normalizeContainerEntity({
      id: 'loot-1',
      kind: CONTAINER_KIND.LOOT,
      name: 'Ящик с припасами',
      roomCode: 'AAA111',
      items: [{ entryId: 'e1', itemId: 'stimpak', itemType: 'chem', name: 'Стимулятор', quantity: 2, cost: 50 }],
    });
    const merchantCard = normalizeContainerEntity({
      id: 'merch-1',
      kind: CONTAINER_KIND.MERCHANT,
      name: 'Торговец оружием',
      roomCode: 'AAA111',
      caps: 250,
      saleMarkupPercent: 15,
      buyDepreciationPercent: 50,
      items: [{ entryId: 'e2', itemId: 'pistol_10mm', itemType: 'weapon', name: '10-мм пистолет', quantity: 1, cost: 50 }],
    });
    const nestedHubAttempt = normalizeContainerEntity({
      id: 'hub-nested',
      kind: CONTAINER_KIND.HUB,
      name: 'Другая локация',
      roomCode: 'AAA111',
      links: [{ containerId: 'loot-1', locked: false }],
    });

    const hub = normalizeContainerEntity({
      id: 'hub-main',
      kind: CONTAINER_KIND.HUB,
      name: 'Рынок Даймонд-Сити',
      roomCode: 'AAA111',
      items: [{ entryId: 'ignored', name: 'Не должно быть в hub', quantity: 1 }],
      links: [
        { containerId: 'merch-1', locked: false },
        { containerId: 'loot-1', locked: true, lockLabel: 'Сложность взлома: 2' },
        { containerId: 'hub-nested', locked: false },
        { containerId: 'merch-1', locked: true }, // дубликат отбрасывается
      ],
    });

    expect(hub.kind).toBe('hub');
    expect(hub.items).toEqual([]);
    expect(hub.links).toHaveLength(3);

    const nodes = buildHubSessionNodes(hub, [lootCard, merchantCard, nestedHubAttempt, hub]);
    // Вложенность строго 1 уровень: hub-nested отфильтрован
    expect(nodes.map((n) => n.containerId)).toEqual(['merch-1', 'loot-1']);
    expect(nodes[0].caps).toBe(250);
    expect(nodes[1].locked).toBe(true);
    expect(nodes[1].lockLabel).toBe('Сложность взлома: 2');

    const copy = duplicateContainerEntity(hub, 'копия');
    expect(copy.id).not.toBe(hub.id);
    expect(copy.kind).toBe('hub');
    expect(copy.links).toEqual(hub.links);
  });

  it('sanitizes locked hub nodes over WS, blocks locked loot/trade, persists multi-player trades to child cards, keeps hub open until GM closes, and unlocks live', async () => {
    // 1. Создаём комнату Мастером через стор (подписан gmSessionPersistence)
    const created = await useRoomStore.getState().createRoom({ name: 'Diamond City' });
    const code = created.code;
    await useRoomStore.getState().joinRoom({ code, name: 'GM', role: 'gm' });

    const weaponShop = await db.saveGmContainer({
      id: 'shop-weapons',
      kind: CONTAINER_KIND.MERCHANT,
      name: 'Оружейник Артуро',
      roomCode: code,
      caps: 300,
      saleMarkupPercent: 10,
      buyDepreciationPercent: 50,
      items: [
        {
          entryId: 'w-10mm',
          itemId: 'pistol_10mm',
          itemType: 'weapon',
          name: '10-мм пистолет',
          quantity: 3,
          cost: 50,
          markupPercent: 0,
        },
      ],
    });

    const chemShop = await db.saveGmContainer({
      id: 'shop-chems',
      kind: CONTAINER_KIND.MERCHANT,
      name: 'Лавка Соломона',
      roomCode: code,
      caps: 180,
      saleMarkupPercent: 0,
      buyDepreciationPercent: 50,
      items: [
        {
          entryId: 'c-stim',
          itemId: 'stimpak',
          itemType: 'chem',
          name: 'Стимулятор',
          quantity: 4,
          cost: 40,
          markupPercent: 0,
        },
      ],
    });

    const lockedSafe = await db.saveGmContainer({
      id: 'safe-locked',
      kind: CONTAINER_KIND.LOOT,
      name: 'Сейф в подсобке',
      roomCode: code,
      items: [
        {
          entryId: 's-caps',
          itemId: 'caps',
          itemType: 'caps',
          name: 'Крышки',
          quantity: 75,
          cost: 1,
        },
      ],
    });

    const hub = await db.saveGmContainer({
      id: 'hub-dc-market',
      kind: CONTAINER_KIND.HUB,
      name: 'Рынок Даймонд-Сити',
      roomCode: code,
      links: [
        { containerId: weaponShop.id, locked: false, lockLabel: '' },
        { containerId: chemShop.id, locked: false, lockLabel: '' },
        { containerId: lockedSafe.id, locked: true, lockLabel: 'Взлом сложность 2' },
      ],
    });

    // Подключаем двух игроков
    const p1Inbox = [];
    const p2Inbox = [];
    const player1 = createRoomClient({
      url: wsUrl,
      clientId: 'player-hub-1',
      webSocketFactory: (u) => new WebSocket(u),
      onStatus: () => {},
      onMessage: (m) => p1Inbox.push(m),
    });
    const player2 = createRoomClient({
      url: wsUrl,
      clientId: 'player-hub-2',
      webSocketFactory: (u) => new WebSocket(u),
      onStatus: () => {},
      onMessage: (m) => p2Inbox.push(m),
    });

    try {
      await waitFor(() => player1.getStatus() === 'online' && player2.getStatus() === 'online');
      player1.send(ROOM_MESSAGE.ROOM_JOIN, { code, name: 'Sole Survivor', role: 'player', requestId: 'j1' }, code);
      player2.send(ROOM_MESSAGE.ROOM_JOIN, { code, name: 'Piper', role: 'player', requestId: 'j2' }, code);
      await waitFor(() => (
        p1Inbox.some((m) => m.type === MESSAGE.ROOM_STATE && m.payload?.requestId === 'j1')
        && p2Inbox.some((m) => m.type === MESSAGE.ROOM_STATE && m.payload?.requestId === 'j2')
      ));

      // 2. Мастер выдаёт Локацию на всю комнату
      const allCards = await db.getGmContainersList();
      const opened = await useRoomStore.getState().openRoomSession({
        code,
        session: {
          containerId: hub.id,
          kind: CONTAINER_KIND.HUB,
          name: hub.name,
          targetType: 'room',
          nodes: buildHubSessionNodes(hub, allCards),
        },
      });
      expect(opened.kind).toBe('hub');
      // Мастер видит содержимое запертого сейфа
      const gmSafeNode = opened.nodes.find((n) => n.containerId === lockedSafe.id);
      expect(gmSafeNode.locked).toBe(true);
      expect(gmSafeNode.items).toHaveLength(1);

      // Игрок получает запертый сейф со скрытым содержимым (items: [])
      const p1OpenMsg = await waitFor(() => (
        p1Inbox.find((m) => m.type === MESSAGE.SESSION_STATE && m.payload?.session?.sessionId === opened.sessionId)
      ));
      const p1SafeNode = p1OpenMsg.payload.session.nodes.find((n) => n.containerId === lockedSafe.id);
      expect(p1SafeNode.locked).toBe(true);
      expect(p1SafeNode.lockLabel).toBe('Взлом сложность 2');
      expect(p1SafeNode.items).toEqual([]);
      expect(p1SafeNode.hasItemsHint).toBe(true);

      // 3. Попытка игрока забрать предмет из запертого сейфа отклоняется сервером
      p1Inbox.length = 0;
      player1.send(
        ROOM_MESSAGE.SESSION_LOOT_TAKE,
        {
          sessionId: opened.sessionId,
          nodeContainerId: lockedSafe.id,
          characterId: 'char-p1',
          takes: [{ entryId: 's-caps', quantity: 75 }],
        },
        code,
      );
      const lockErr = await waitFor(() => p1Inbox.find((m) => m.type === MESSAGE.ERROR));
      expect(lockErr.payload.code).toBe(ERROR_CODE.CONTAINER_LOCKED);

      // 4. Параллельная торговля разных игроков с разными торговцами внутри одной Локации
      p1Inbox.length = 0;
      p2Inbox.length = 0;
      player1.send(
        ROOM_MESSAGE.SESSION_TRADE_COMMIT,
        {
          requestId: 'trade-p1',
          sessionId: opened.sessionId,
          nodeContainerId: weaponShop.id,
          characterId: 'char-p1',
          playerCapsAvailable: 200,
          buyItems: [{ entryId: 'w-10mm', quantity: 1 }], // 50 * 1.10 = 55 caps
          sellItems: [],
        },
        code,
      );
      player2.send(
        ROOM_MESSAGE.SESSION_TRADE_COMMIT,
        {
          requestId: 'trade-p2',
          sessionId: opened.sessionId,
          nodeContainerId: chemShop.id,
          characterId: 'char-p2',
          playerCapsAvailable: 200,
          buyItems: [{ entryId: 'c-stim', quantity: 2 }], // 2 * 40 = 80 caps
          sellItems: [],
        },
        code,
      );

      await waitFor(() => (
        p1Inbox.some((m) => m.type === MESSAGE.SESSION_TRADE_COMMIT && m.payload?.requestId === 'trade-p1')
        && p2Inbox.some((m) => m.type === MESSAGE.SESSION_TRADE_COMMIT && m.payload?.requestId === 'trade-p2')
      ));

      // Проверяем, что изменения сохранились в БД на каждую карточку торговца по отдельности
      await waitFor(async () => {
        const savedArturo = await db.getGmContainerById(weaponShop.id);
        const savedSolomon = await db.getGmContainerById(chemShop.id);
        return savedArturo?.caps === 355 && savedSolomon?.caps === 260;
      });
      const savedArturo = await db.getGmContainerById(weaponShop.id);
      const savedSolomon = await db.getGmContainerById(chemShop.id);
      expect(savedArturo.items[0].quantity).toBe(2);
      expect(savedSolomon.items[0].quantity).toBe(2);

      // 5. Игрок не может закрыть саму Локацию через session.playerClose (закрывает только Мастер)
      p1Inbox.length = 0;
      player1.send(
        ROOM_MESSAGE.SESSION_PLAYER_CLOSE,
        { requestId: 'p1-close', sessionId: opened.sessionId },
        code,
      );
      const closeAttempt = await waitFor(() => (
        p1Inbox.find((m) => m.type === MESSAGE.SESSION_STATE && m.payload?.requestId === 'p1-close')
      ));
      expect(closeAttempt.payload.session).toBeTruthy();
      expect(closeAttempt.payload.session.sessionId).toBe(opened.sessionId);
      expect(useRoomStore.getState().rooms[code]?.activeSession?.sessionId).toBe(opened.sessionId);

      // 6. Мастер вживую открывает замок на «Сейфе в подсобке»
      p1Inbox.length = 0;
      await useRoomStore.getState().updateRoomSessionRates({
        code,
        sessionId: opened.sessionId,
        nodeContainerId: lockedSafe.id,
        locked: false,
      });

      const unlockBroadcast = await waitFor(() => (
        p1Inbox.find((m) => m.type === MESSAGE.SESSION_STATE && m.payload?.session)
      ));
      const unlockedSafeForP1 = unlockBroadcast.payload.session.nodes.find(
        (n) => n.containerId === lockedSafe.id,
      );
      expect(unlockedSafeForP1.locked).toBe(false);
      expect(unlockedSafeForP1.items).toHaveLength(1);
      expect(unlockedSafeForP1.items[0].quantity).toBe(75);

      // 7. Игрок забирает всё из открытого сейфа: сейф пустеет, Мастер получает вопрос об удалении,
      // но сама Локация остаётся открытой для игроков!
      p1Inbox.length = 0;
      player1.send(
        ROOM_MESSAGE.SESSION_LOOT_TAKE,
        {
          requestId: 'loot-safe',
          sessionId: opened.sessionId,
          nodeContainerId: lockedSafe.id,
          characterId: 'char-p1',
          takes: [{ entryId: 's-caps', quantity: 75 }],
        },
        code,
      );
      const lootDone = await waitFor(() => (
        p1Inbox.find((m) => m.type === MESSAGE.SESSION_STATE && m.payload?.emptiedNodeContainerId === lockedSafe.id)
      ));
      expect(lootDone.payload.emptiedNodeContainerId).toBe(lockedSafe.id);
      expect(lootDone.payload.session.sessionId).toBe(opened.sessionId); // Локация всё ещё открыта!

      await waitFor(async () => {
        const freshSafe = await db.getGmContainerById(lockedSafe.id);
        return freshSafe?.items?.length === 0 && alertSpies.calls.length > 0;
      });

      // 8. Только когда Мастер закрывает выдачу Локации — она пропадает у игроков
      p1Inbox.length = 0;
      await useRoomStore.getState().closeRoomSession({ code, sessionId: opened.sessionId });
      const gmClosed = await waitFor(() => (
        p1Inbox.find((m) => m.type === MESSAGE.SESSION_STATE && m.payload?.closedSession)
      ));
      expect(gmClosed.payload.closedSession.sessionId).toBe(opened.sessionId);
      expect(useRoomStore.getState().rooms[code]?.activeSession).toBeNull();
    } finally {
      player1.close();
      player2.close();
    }
  });

  it('keeps outer Hub window without a player Close button while preserving child Close/Back controls and icon tokens', () => {
    const overlaySrc = fs.readFileSync(
      path.resolve(__dirname, '../../components/lootTrade/PlayerLootTradeOverlay.js'),
      'utf8',
    );
    expect(overlaySrc).toContain('isHubSession && !viewTarget');
    expect(overlaySrc).toContain("tLootTrade('player.backToLocation')");
    expect(overlaySrc).toContain("tLootTrade('player.hubMasterClosesHint')");

    // Вырезаем JSX внешнего окна Локации и убеждаемся, что там НЕТ кнопки closeContainerBtn
    const hubBlockStart = overlaySrc.indexOf('if (isHubSession && !viewTarget)');
    const hubBlockEnd = overlaySrc.indexOf('const returnToHubList');
    expect(hubBlockStart).toBeGreaterThan(0);
    expect(hubBlockEnd).toBeGreaterThan(hubBlockStart);
    const outerHubJsx = overlaySrc.slice(hubBlockStart, hubBlockEnd);
    expect(outerHubJsx).toContain("tLootTrade('player.minimize')");
    expect(outerHubJsx).not.toContain('closeContainerBtn');

    // Проверяем локализации ru/en
    const ruJson = fs.readFileSync(
      path.resolve(__dirname, '../../i18n/ru-RU/screens/lootTrade/screen.json'),
      'utf8',
    );
    const enJson = fs.readFileSync(
      path.resolve(__dirname, '../../i18n/en-EN/screens/lootTrade/screen.json'),
      'utf8',
    );
    expect(ruJson).not.toMatch(/крыш|кр\./i);
    expect(JSON.parse(ruJson).actions.createHub).toContain('локацию');
    expect(JSON.parse(enJson).actions.createHub).toContain('Location');
  });
});
