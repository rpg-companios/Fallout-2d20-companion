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
import useUiModeStore from '../../src/room/uiModeStore';
import useAppSettingsStore from '../../src/store/appSettingsStore';
import {
  pushSavedCharacterToBoundRoomIfAny,
  syncBoundCharacterToRoom,
} from '../../src/room/roomCharacterSync';
import * as db from '../../db';
import {
  flushPendingEmptyLootPrompts,
  resetPromptedEmptySessionsForTests,
  startGmSessionPersistence,
  subscribeGmContainerUpdates,
} from '../../src/lootTrade/gmSessionPersistence';
import { setCurrentLocale } from '../../i18n/locale';

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

describe('Патч 478 — синхронизация Мастера при «Забрать всё» из контейнера добычи', () => {
  beforeEach(async () => {
    setCurrentLocale('ru-RU');
    alertCalls.length = 0;
    resetPromptedEmptySessionsForTests();
    resetRoomClientForTests();
    setRoomClientFactoryForTests(null);
    useRoomStore.setState({ status: 'offline', clientId: null, rooms: {}, lastError: null });
    useUiModeStore.setState({ tabUiMode: null, gmInspectingCharacter: false });
    if (typeof localStorage !== 'undefined') localStorage.clear();
    await db.initDatabase();
  });

  it('когда Мастер переоткрыл вкладку (новый clientId с ownerToken) и раздал старый сундук из памяти (даже с дублирующимися entryId): «Забрать всё» опустошает и закрывает контейнер у Мастера', async () => {
    const app = createRoomServer({ port: 0, host: '127.0.0.1', distDir: '/nonexistent' });
    const { port } = await app.start();
    const wsUrl = `ws://127.0.0.1:${port}/ws`;
    const waitMsg = makeWaitMsg();
    const prevEnvUrl = process.env.EXPO_PUBLIC_ROOM_SERVER_URL;
    process.env.EXPO_PUBLIC_ROOM_SERVER_URL = wsUrl;

    // 1. Первоначально комната была создана старой вкладкой Мастера, и к ней подключился игрок
    const oldGmBox = [];
    const oldGm = createRoomClient({
      url: wsUrl,
      clientId: 'gm-device:old-tab',
      webSocketFactory: (u) => new WebSocket(u),
      onStatus: () => {},
      onMessage: (m) => oldGmBox.push(m),
    });
    const playerBox = [];
    const player = createRoomClient({
      url: wsUrl,
      clientId: 'player-device:tab1',
      webSocketFactory: (u) => new WebSocket(u),
      onStatus: () => {},
      onMessage: (m) => playerBox.push(m),
    });

    const updateEvents = [];
    const unsubUpdates = subscribeGmContainerUpdates((id, meta) => {
      updateEvents.push({ id, meta });
    });

    let stopPersistence = () => {};

    try {
      oldGm.send(ROOM_MESSAGE.ROOM_CREATE, { name: 'Мохаве', requestId: 'c1' }, null);
      const createdMsg = await waitMsg(oldGmBox, (m) => m.type === ROOM_MESSAGE.ROOM_CREATED);
      const roomCode = createdMsg.payload.code;
      const ownerToken = createdMsg.payload.ownerToken;
      await db.upsertFolderRoom('folder_gm_1', roomCode, ownerToken);

      player.send(ROOM_MESSAGE.ROOM_JOIN, { code: roomCode, name: 'Курьер', role: 'player', requestId: 'pj1' }, roomCode);
      await waitMsg(playerBox, (m) => m.type === ROOM_MESSAGE.ROOM_STATE && m.payload?.requestId === 'pj1');

      // Старая вкладка Мастера закрылась, но комната жива в памяти сервера из-за игрока!
      oldGm.close();
      await new Promise((r) => setTimeout(r, 40));

      // 2. Мастер открывает новую вкладку (новый clientId) и раздаёт старый контейнер из памяти
      setRoomClientFactoryForTests((input) => createRoomClient({
        ...input,
        clientId: 'gm-device:new-tab',
        webSocketFactory: (u) => new WebSocket(u),
      }));
      stopPersistence = startGmSessionPersistence();

      await useRoomStore.getState().joinRoom({
        code: roomCode,
        name: 'GM',
        role: 'gm',
        ownerToken,
      });

      // Контейнер из старой памяти (в т.ч. с одинаковыми entryId у двух позиций)
      const legacyContainer = await db.saveGmContainer({
        id: 'cnt_legacy_468',
        kind: 'loot',
        name: 'Старый сейф из памяти',
        roomCode,
        items: [
          { entryId: 'ent_same', itemId: 'chem_stimpak', itemType: 'chems', name: 'Стимулятор', quantity: 3, cost: 40, weight: 0 },
          { entryId: 'ent_same', itemId: 'ammo_10mm', itemType: 'ammo', name: 'Патрон 10 мм', quantity: 12, cost: 2, weight: 0 },
        ],
      });
      // Дедупликация гарантирует уникальные entryId для всех позиций
      expect(new Set(legacyContainer.items.map((it) => it.entryId)).size).toBe(2);

      const opened = await useRoomStore.getState().openRoomSession({
        code: roomCode,
        ownerToken,
        session: {
          containerId: legacyContainer.id,
          kind: 'loot',
          name: legacyContainer.name,
          targetType: 'room',
          items: legacyContainer.items,
        },
      });

      const playerOpenMsg = await waitMsg(
        playerBox,
        (m) => m.type === ROOM_MESSAGE.SESSION_STATE && m.payload?.session?.sessionId === opened.sessionId,
      );
      const sessionItems = playerOpenMsg.payload.session.items;
      expect(sessionItems).toHaveLength(2);

      // 3. Персонаж нажимает «Забрать всё» (отправляя все позиции разом)
      player.send(
        ROOM_MESSAGE.SESSION_LOOT_TAKE,
        {
          code: roomCode,
          sessionId: opened.sessionId,
          characterId: 'char_courier',
          takes: sessionItems.map((it) => ({ entryId: it.entryId, quantity: it.quantity })),
          requestId: 'take-all-now',
        },
        roomCode,
      );

      const takeRes = await waitMsg(
        playerBox,
        (m) => m.type === ROOM_MESSAGE.SESSION_LOOT_TAKE && m.payload?.requestId === 'take-all-now',
      );
      expect(takeRes.payload.granted).toHaveLength(2);
      expect(takeRes.payload.session).toBeNull();
      expect(takeRes.payload.closedReason).toBe('loot_emptied');

      await new Promise((r) => setTimeout(r, 90));

      // У Мастера раздача закрыта, в БД 0 предметов, пришёл сигнал { emptied: true } для закрытия экрана контейнера
      expect(useRoomStore.getState().rooms[roomCode]?.activeSession).toBeNull();
      const updatedContainer = await db.getGmContainerById(legacyContainer.id);
      expect(updatedContainer.items).toEqual([]);
      expect(updateEvents.some((ev) => ev.id === legacyContainer.id && ev.meta?.emptied === true)).toBe(true);
      expect(alertCalls.some((a) => a.title === 'Контейнер пуст. Хотите удалить?')).toBe(true);
    } finally {
      unsubUpdates();
      stopPersistence();
      oldGm.close();
      player.close();
      if (prevEnvUrl === undefined) delete process.env.EXPO_PUBLIC_ROOM_SERVER_URL;
      else process.env.EXPO_PUBLIC_ROOM_SERVER_URL = prevEnvUrl;
      await app.close();
    }
  });

  it('фоновая синхронизация привязанного персонажа не затирает роль Мастера (role: gm -> player) во вкладке Админа', async () => {
    const app = createRoomServer({ port: 0, host: '127.0.0.1', distDir: '/nonexistent' });
    const { port } = await app.start();
    const wsUrl = `ws://127.0.0.1:${port}/ws`;
    const prevEnvUrl = process.env.EXPO_PUBLIC_ROOM_SERVER_URL;
    process.env.EXPO_PUBLIC_ROOM_SERVER_URL = wsUrl;

    setRoomClientFactoryForTests((input) => createRoomClient({
      ...input,
      clientId: 'gm-tab-protect',
      webSocketFactory: (u) => new WebSocket(u),
    }));

    try {
      const created = await useRoomStore.getState().createRoom({ name: 'Стол Мастера' });
      await useRoomStore.getState().joinRoom({
        code: created.code,
        name: 'GM',
        role: 'gm',
        ownerToken: created.ownerToken,
      });

      await db.saveCharacter('char_local_1', 'Рейнджер', 3, 'ncr_citizen', { level: 3 });
      await db.setCharacterRoomBinding('char_local_1', created.code);

      // В режиме Мастера (без инспекции листа) фоновый автосейв вообще не должен лезть в комнату как игрок
      useUiModeStore.setState({ tabUiMode: 'gm', gmInspectingCharacter: false });
      useAppSettingsStore.getState().setValue('uiMode', 'gm');
      await pushSavedCharacterToBoundRoomIfAny('char_local_1');
      expect(useRoomStore.getState().rooms[created.code]?.role).toBe('gm');

      // Даже прямой вызов syncBoundCharacterToRoom при открытой GM-комнате сохраняет role === 'gm'
      await syncBoundCharacterToRoom('char_local_1', created.code);
      expect(useRoomStore.getState().rooms[created.code]?.role).toBe('gm');
    } finally {
      if (prevEnvUrl === undefined) delete process.env.EXPO_PUBLIC_ROOM_SERVER_URL;
      else process.env.EXPO_PUBLIC_ROOM_SERVER_URL = prevEnvUrl;
      await app.close();
    }
  });

  it('проверка на одном устройстве (Админ -> раздал -> вышел в Пользователя -> Забрать всё -> вернулся в Админа): сундук сразу пустеет и предлагает удаление при возврате', async () => {
    const app = createRoomServer({ port: 0, host: '127.0.0.1', distDir: '/nonexistent' });
    const { port } = await app.start();
    const wsUrl = `ws://127.0.0.1:${port}/ws`;
    const prevEnvUrl = process.env.EXPO_PUBLIC_ROOM_SERVER_URL;
    process.env.EXPO_PUBLIC_ROOM_SERVER_URL = wsUrl;

    setRoomClientFactoryForTests((input) => createRoomClient({
      ...input,
      clientId: 'single-device-user',
      webSocketFactory: (u) => new WebSocket(u),
    }));
    const stopPersistence = startGmSessionPersistence();

    try {
      // 1. В режиме Мастера создаём комнату и сундук, раздаём на всю комнату
      const created = await useRoomStore.getState().createRoom({ name: 'Соло-тест' });
      await db.upsertFolderRoom('f_solo', created.code, created.ownerToken);
      await useRoomStore.getState().joinRoom({
        code: created.code,
        name: 'GM',
        role: 'gm',
        ownerToken: created.ownerToken,
      });

      const chest = await db.saveGmContainer({
        id: 'cnt_solo_switch',
        kind: 'loot',
        name: 'Ящик у дороги',
        items: [
          { entryId: 'e_solo_1', itemId: 'chem_radaway', itemType: 'chems', name: 'Антирадин', quantity: 2, cost: 60, weight: 0 },
        ],
      });

      const opened = await useRoomStore.getState().openRoomSession({
        code: created.code,
        ownerToken: created.ownerToken,
        session: {
          containerId: chest.id,
          kind: 'loot',
          name: chest.name,
          targetType: 'room',
          items: chest.items,
        },
      });

      // 2. Переключаемся на этом же устройстве в режим Пользователя (leaveRoom -> joinRoom role: 'player')
      await useRoomStore.getState().leaveRoom({ code: created.code });
      await useRoomStore.getState().joinRoom({
        code: created.code,
        name: 'Выживший',
        role: 'player',
      });
      expect(useRoomStore.getState().rooms[created.code]?.role).toBe('player');

      // 3. Персонажем забираем всё разом
      const takeRes = await useRoomStore.getState().takeFromLootSession({
        code: created.code,
        sessionId: opened.sessionId,
        characterId: 'char_solo',
        takes: [{ entryId: 'e_solo_1', quantity: 2 }],
      });
      expect(takeRes.granted).toHaveLength(1);

      await new Promise((r) => setTimeout(r, 80));

      // В локальной БД Мастера сундук УЖЕ пуст (предметы не остались лежать!)
      const chestAfterTake = await db.getGmContainerById(chest.id);
      expect(chestAfterTake.items).toEqual([]);

      // 4. Возвращаемся на экран Мастера «Добыча/Торговля» — всплывает отложенный вопрос удаления пустого сундука
      await flushPendingEmptyLootPrompts();
      expect(alertCalls.some((a) => a.title === 'Контейнер пуст. Хотите удалить?')).toBe(true);
    } finally {
      stopPersistence();
      if (prevEnvUrl === undefined) delete process.env.EXPO_PUBLIC_ROOM_SERVER_URL;
      else process.env.EXPO_PUBLIC_ROOM_SERVER_URL = prevEnvUrl;
      await app.close();
    }
  });

  it('самовосстановление Мастера при работе со старым WS-сервером (где пустой сундук не прислал loot_emptied): раздача гасится автоматически, а сундук очищается', async () => {
    const app = createRoomServer({ port: 0, host: '127.0.0.1', distDir: '/nonexistent' });
    const { port } = await app.start();
    const wsUrl = `ws://127.0.0.1:${port}/ws`;
    const prevEnvUrl = process.env.EXPO_PUBLIC_ROOM_SERVER_URL;
    process.env.EXPO_PUBLIC_ROOM_SERVER_URL = wsUrl;

    let injectedOnMessage = null;
    setRoomClientFactoryForTests((input) => {
      injectedOnMessage = input.onMessage;
      return createRoomClient({
        ...input,
        clientId: 'gm-legacy-server-guard',
        webSocketFactory: (u) => new WebSocket(u),
      });
    });
    const stopPersistence = startGmSessionPersistence();

    try {
      const created = await useRoomStore.getState().createRoom({ name: 'Старый сервер' });
      await db.upsertFolderRoom('f_legacy_srv', created.code, created.ownerToken);
      await useRoomStore.getState().joinRoom({
        code: created.code,
        name: 'GM',
        role: 'gm',
        ownerToken: created.ownerToken,
      });

      const chest = await db.saveGmContainer({
        id: 'cnt_legacy_srv_1',
        kind: 'loot',
        name: 'Сундук 468',
        items: [
          { entryId: 'e_old_1', itemId: 'chem_stimpak', itemType: 'chems', name: 'Стимулятор', quantity: 4, cost: 40, weight: 0 },
        ],
      });

      const opened = await useRoomStore.getState().openRoomSession({
        code: created.code,
        ownerToken: created.ownerToken,
        session: {
          containerId: chest.id,
          kind: 'loot',
          name: chest.name,
          targetType: 'room',
          items: chest.items,
        },
      });

      // Имитируем ответ старого сервера v468 после «Забрать всё»: items: [], но session не null и без closedByClientIds
      injectedOnMessage({
        v: 1,
        type: ROOM_MESSAGE.SESSION_STATE,
        roomCode: created.code,
        clientId: 'gm-legacy-server-guard',
        ts: Date.now(),
        payload: {
          session: {
            ...opened,
            items: [],
            revision: opened.revision + 1,
          },
        },
      });

      await new Promise((r) => setTimeout(r, 90));

      // Мастер сам отправил SESSION_CLOSE, погасил раздачу, очистил сундук в БД и показал запрос удаления
      expect(useRoomStore.getState().rooms[created.code]?.activeSession).toBeNull();
      const updated = await db.getGmContainerById(chest.id);
      expect(updated.items).toEqual([]);
      expect(alertCalls.some((a) => a.title === 'Контейнер пуст. Хотите удалить?')).toBe(true);
    } finally {
      stopPersistence();
      if (prevEnvUrl === undefined) delete process.env.EXPO_PUBLIC_ROOM_SERVER_URL;
      else process.env.EXPO_PUBLIC_ROOM_SERVER_URL = prevEnvUrl;
      await app.close();
    }
  });
});
