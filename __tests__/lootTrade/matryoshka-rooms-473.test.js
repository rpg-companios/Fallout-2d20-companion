import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import WebSocket from 'ws';

vi.mock('react-native', () => ({
  Platform: { OS: 'web' },
  Alert: { alert: vi.fn() },
}));

vi.mock('../../db', () => import('../../db/Database.web.js'));

vi.mock('../../components/alerts/alertService', () => ({
  showRawAlert: vi.fn(),
}));

vi.mock('../../components/cloudSync/googleDriveSync', () => ({
  syncGmContainerToCloudIfEnabled: vi.fn(() => Promise.resolve()),
  deleteGmContainerFromCloudIfEnabled: vi.fn(() => Promise.resolve()),
}));

import * as db from '../../db/Database.web.js';
import {
  CONTAINER_KIND,
  analyzeHubDeletion,
  buildHubSessionNodes,
  duplicateContainerEntity,
  getHubIdsContainingChild,
  isContainerVisibleOnRoot,
  normalizeContainerEntity,
  normalizeRoomCodes,
  sortContainersForRoot,
} from '../../domain/lootTrade';
import { createRoomServer } from '../../server/roomServer.js';
import { MESSAGE } from '../../server/protocol.js';
import { createRoomClient } from '../../src/room/roomClient';
import useRoomStore, {
  resetRoomClientForTests,
  setRoomClientFactoryForTests,
} from '../../src/room/roomStore';
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

describe('Patch 473 — Matryoshka organization, sorting, multi-room Locations & GM room ⋮ menu', () => {
  let app = null;
  let wsUrl = '';

  beforeEach(async () => {
    setCurrentLocale('ru-RU');
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
  });

  afterEach(async () => {
    resetRoomClientForTests();
    setRoomClientFactoryForTests(null);
    if (app) {
      await app.close();
      app = null;
    }
  });

  it('сортирует корневой экран строго: Локации -> Сундуки -> Торговцы и скрывает упакованные в локации карточки', () => {
    const merchRoot = normalizeContainerEntity({
      id: 'm_root',
      kind: CONTAINER_KIND.MERCHANT,
      name: 'Бродячий караванщик',
    });
    const lootRoot = normalizeContainerEntity({
      id: 'l_root',
      kind: CONTAINER_KIND.LOOT,
      name: 'Ящик у дороги',
    });
    const lootInsideHub = normalizeContainerEntity({
      id: 'l_nested',
      kind: CONTAINER_KIND.LOOT,
      name: 'Сейф мэра',
      inRoot: false,
    });
    const merchSharedPinnedRoot = normalizeContainerEntity({
      id: 'm_shared_root',
      kind: CONTAINER_KIND.MERCHANT,
      name: 'Артуро Родригес',
      inRoot: true,
    });
    const hubB = normalizeContainerEntity({
      id: 'hub_b',
      kind: CONTAINER_KIND.HUB,
      name: 'Санкчуари-Хиллз',
      roomCodes: ['GM-AAA111'],
      links: [{ containerId: 'm_shared_root', locked: false }],
    });
    const hubA = normalizeContainerEntity({
      id: 'hub_a',
      kind: CONTAINER_KIND.HUB,
      name: 'Даймонд-Сити',
      roomCodes: ['GM-AAA111', 'GM-BBB222'],
      links: [
        { containerId: 'l_nested', locked: true, lockLabel: 'Сложность 2' },
        { containerId: 'm_shared_root', locked: false },
      ],
    });

    const all = [merchRoot, lootInsideHub, hubB, lootRoot, merchSharedPinnedRoot, hubA];
    const visibleOnRoot = sortContainersForRoot(all.filter((c) => isContainerVisibleOnRoot(c, all)));

    expect(visibleOnRoot.map((c) => `${c.kind}:${c.name}`)).toEqual([
      'hub:Даймонд-Сити',
      'hub:Санкчуари-Хиллз',
      'loot:Ящик у дороги',
      'merchant:Артуро Родригес',
      'merchant:Бродячий караванщик',
    ]);

    // Сейф мэра привязан к Даймонд-Сити и не засоряет корневой экран
    expect(isContainerVisibleOnRoot(lootInsideHub, all)).toBe(false);
    // Артуро одновременно состоит в двух локациях
    expect(getHubIdsContainingChild('m_shared_root', all)).toEqual(['hub_b', 'hub_a']);
  });

  it('умно анализирует удаление локации: отличает эксклюзивные вложения от общих с другими локациями', () => {
    const exclusiveChest = normalizeContainerEntity({
      id: 'l_only_dc',
      kind: CONTAINER_KIND.LOOT,
      name: 'Тайник Пайпер',
    });
    const sharedTrader = normalizeContainerEntity({
      id: 'm_caravan',
      kind: CONTAINER_KIND.MERCHANT,
      name: 'Урна Карла',
    });
    const diamondCity = normalizeContainerEntity({
      id: 'hub_dc',
      kind: CONTAINER_KIND.HUB,
      name: 'Даймонд-Сити',
      roomCodes: ['GM-111111'],
      links: [
        { containerId: 'l_only_dc', locked: false },
        { containerId: 'm_caravan', locked: false },
      ],
    });
    const bunkerHill = normalizeContainerEntity({
      id: 'hub_bh',
      kind: CONTAINER_KIND.HUB,
      name: 'Банкер-Хилл',
      roomCodes: ['GM-111111'],
      links: [{ containerId: 'm_caravan', locked: false }],
    });

    const mixedReport = analyzeHubDeletion('hub_dc', [
      exclusiveChest,
      sharedTrader,
      diamondCity,
      bunkerHill,
    ]);
    expect(mixedReport.allExclusive).toBe(false);
    expect(mixedReport.exclusiveChildren.map((c) => c.id)).toEqual(['l_only_dc']);
    expect(mixedReport.sharedChildren.map((c) => c.id)).toEqual(['m_caravan']);

    // Если Банкер-Хилл содержит только общую Урну Карла — эксклюзивных вложений 0
    const sharedOnlyReport = analyzeHubDeletion('hub_bh', [
      exclusiveChest,
      sharedTrader,
      diamondCity,
      bunkerHill,
    ]);
    expect(sharedOnlyReport.exclusiveChildren).toEqual([]);
    expect(sharedOnlyReport.sharedChildren.map((c) => c.id)).toEqual(['m_caravan']);

    // Если все вложения принадлежат только одной локации — allExclusive = true
    const soloHub = normalizeContainerEntity({
      id: 'hub_solo',
      kind: CONTAINER_KIND.HUB,
      name: 'Убежище 81',
      roomCodes: ['GM-111111'],
      links: [{ containerId: 'l_only_dc', locked: false }],
    });
    const allExclusiveReport = analyzeHubDeletion('hub_solo', [exclusiveChest, soloHub]);
    expect(allExclusiveReport.allExclusive).toBe(true);
    expect(allExclusiveReport.exclusiveChildren.map((c) => c.id)).toEqual(['l_only_dc']);
    expect(allExclusiveReport.sharedChildren).toEqual([]);
  });

  it('сохраняет мульти-комнатные локации и непривязанные сундуки/торговцев в SQLite и выдаёт их в любую выбранную комнату', async () => {
    expect(normalizeRoomCodes(['gm-7q3k9m', 'GM-EF34GH', 'GM-7Q3K9M', '  '])).toEqual([
      'GM-7Q3K9M',
      'GM-EF34GH',
    ]);

    const roomAlpha = await useRoomStore.getState().createRoom({ name: 'Партия Альфа' });
    const roomBeta = await useRoomStore.getState().createRoom({ name: 'Партия Бета' });
    await useRoomStore.getState().joinRoom({ code: roomAlpha.code, name: 'GM', role: 'gm' });
    await useRoomStore.getState().joinRoom({ code: roomBeta.code, name: 'GM', role: 'gm' });

    const unboundChest = await db.saveGmContainer({
      kind: CONTAINER_KIND.LOOT,
      name: 'Полевой тайник Братства',
      items: [{ itemId: 'stimpak', itemType: 'chem', name: 'Стимулятор', quantity: 3, cost: 50 }],
    });
    expect(unboundChest.roomCode).toBe('');
    expect(unboundChest.roomCodes).toEqual([]);

    const multiRoomHub = await db.saveGmContainer({
      kind: CONTAINER_KIND.HUB,
      name: 'Красная Ракета',
      roomCodes: [roomAlpha.code, roomBeta.code],
      links: [{ containerId: unboundChest.id, locked: false }],
    });
    expect(multiRoomHub.roomCodes).toEqual([roomAlpha.code, roomBeta.code]);
    expect(multiRoomHub.roomCode).toBe(roomAlpha.code);

    const duplicatedHub = duplicateContainerEntity(multiRoomHub, { existingNames: [multiRoomHub.name] });
    expect(duplicatedHub.roomCodes).toEqual([roomAlpha.code, roomBeta.code]);

    const reloadedHub = await db.getGmContainerById(multiRoomHub.id);
    expect(reloadedHub.roomCodes).toEqual([roomAlpha.code, roomBeta.code]);

    // Выдаём одну и ту же мульти-комнатную локацию во вторую комнату roomBeta
    const allCards = await db.getGmContainersList();
    const opened = await useRoomStore.getState().openRoomSession({
      code: roomBeta.code,
      session: {
        containerId: reloadedHub.id,
        kind: CONTAINER_KIND.HUB,
        name: reloadedHub.name,
        targetType: 'room',
        items: [],
        nodes: buildHubSessionNodes(reloadedHub, allCards),
      },
    });
    expect(opened.kind).toBe('hub');
    expect(useRoomStore.getState().rooms[roomBeta.code]?.activeSession?.containerId).toBe(reloadedHub.id);
    expect(useRoomStore.getState().rooms[roomAlpha.code]?.activeSession).toBeNull();
  });

  it('переименование комнаты Мастера через createRoom обновляет имя в реестре и рассылает ROOM_MEMBER подключённым игрокам', async () => {
    const created = await useRoomStore.getState().createRoom({
      name: 'Кампния с опечаткой',
    });
    const roomCode = created.code;
    expect(created.name).toBe('Кампния с опечаткой');
    await useRoomStore.getState().joinRoom({ code: roomCode, name: 'GM', role: 'gm' });

    // Подключаем независимый клиент игрока к комнате roomCode
    const playerMessages = [];
    const playerClient = createRoomClient({
      url: wsUrl,
      clientId: 'player-rename-1',
      webSocketFactory: (u) => new WebSocket(u),
      onStatus: () => {},
      onMessage: (m) => playerMessages.push(m),
    });
    try {
      await waitFor(() => playerClient.getStatus() === 'online');
      playerClient.send(
        MESSAGE.ROOM_JOIN,
        { code: roomCode, name: 'Выживший', role: 'player', requestId: 'join-p1' },
        roomCode,
      );
      await waitFor(() => playerMessages.some(
        (m) => m.type === MESSAGE.ROOM_STATE && m.payload?.requestId === 'join-p1',
      ));

      // Мастер исправляет опечатку в названии комнаты внутри открытой комнаты (⋮ -> Редактировать)
      const rebound = await useRoomStore.getState().createRoom({
        requestedCode: roomCode,
        ownerToken: created.ownerToken,
        name: 'Кампания Содружества',
      });
      expect(rebound.code).toBe(roomCode);
      expect(rebound.name).toBe('Кампания Содружества');
      expect(useRoomStore.getState().rooms[roomCode]?.joined).toBe(true);
      expect(useRoomStore.getState().rooms[roomCode]?.name).toBe('Кампания Содружества');

      await waitFor(() => playerMessages.some(
        (m) => m.type === MESSAGE.ROOM_MEMBER && m.payload?.name === 'Кампания Содружества',
      ));
    } finally {
      playerClient.close();
    }
  });

  it('сохраняет текстовые строки внутри локации (без витрины карточек), перетаскивание arrow-all и меню ⋮ внутри комнаты Мастера', () => {
    const repoRoot = path.resolve(__dirname, '../..');
    const lootScreenSrc = fs.readFileSync(
      path.join(repoRoot, 'components/screens/LootTradeScreen/LootTradeScreen.js'),
      'utf8',
    );
    const formModalSrc = fs.readFileSync(
      path.join(repoRoot, 'components/screens/LootTradeScreen/modals/ContainerFormModal.js'),
      'utf8',
    );
    const homeScreenSrc = fs.readFileSync(
      path.join(repoRoot, 'components/screens/HomeScreen/HomeScreen.js'),
      'utf8',
    );

    // 1. На корневом экране порядок плиток создания: Локация -> Контейнер -> Торговец
    const idxHub = lootScreenSrc.indexOf("type: 'createHub'");
    const idxLoot = lootScreenSrc.indexOf("type: 'createLoot'");
    const idxMerch = lootScreenSrc.indexOf("type: 'createMerchant'");
    expect(idxHub).toBeGreaterThan(-1);
    expect(idxHub).toBeLessThan(idxLoot);
    expect(idxLoot).toBeLessThan(idxMerch);

    // 2. Внутри локации сохранён текстовый список hubChildRow + вынос на экран, а на корне есть PanResponder перетаскивания
    expect(lootScreenSrc).toContain('styles.hubChildRow');
    expect(lootScreenSrc).toContain('handleMoveChildOutToRoot');
    expect(lootScreenSrc).toContain('handleMoveCardIntoHub');
    expect(lootScreenSrc).toContain('analyzeHubDeletion');

    // 3. При создании сундука/торговца нет привязки к комнате — есть опциональная привязка к локации, а у локации мультивыбор комнат
    expect(formModalSrc).toContain('selectedRoomCodes');
    expect(formModalSrc).toContain('selectedHubIds');
    expect(formModalSrc).toContain("tLootTrade('form.bindHubsLabel')");
    expect(formModalSrc).toContain("tLootTrade('form.roomsMultiLabel')");

    // 4. Внутри открытой комнаты Мастера есть кнопка ⋮ с «Редактировать» и «Удалить»
    expect(homeScreenSrc).toContain('openInsideRoomMenu');
    expect(homeScreenSrc).toContain('handleSaveRoomEdit');
    expect(homeScreenSrc).toContain("tHomeScreen('room.edit')");
    expect(homeScreenSrc).toContain("tHomeScreen('room.delete')");
  });
});
