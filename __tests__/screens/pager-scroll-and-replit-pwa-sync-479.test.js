import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WebSocket from 'ws';

vi.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

vi.mock('../../db', () => import('../../db/Database.web.js'));

vi.mock('../../components/alerts/alertService', () => ({
  showRawAlert: vi.fn(),
  showAlert: vi.fn(),
  confirmAlert: vi.fn().mockResolvedValue(true),
}));

vi.mock('../../components/cloudSync/googleDriveSync', () => ({
  syncGmContainerToCloudIfEnabled: vi.fn().mockResolvedValue(undefined),
  deleteGmContainerFromCloudIfEnabled: vi.fn().mockResolvedValue({ removed: false }),
  syncGmRoomToCloudIfEnabled: vi.fn().mockResolvedValue(undefined),
  deleteGmRoomFromCloudIfEnabled: vi.fn().mockResolvedValue({ removed: false }),
  syncAllCharactersWithCloud: vi.fn().mockResolvedValue({ uploaded: 0, downloaded: 0 }),
  openCloudFolderInDrive: vi.fn().mockResolvedValue(undefined),
}));

import {
  clampHiddenOverflowAncestors,
  installSafeProgrammaticFocus,
  sanitizeRootPagerDom,
} from '../../src/web/pagerScrollGuard';
import { createRoomServer } from '../../server/roomServer';
import { showRawAlert } from '../../components/alerts/alertService';

const ROOT = path.resolve(__dirname, '../..');

const createWsAdapter = (url) => {
  const ws = new WebSocket(url);
  const adapter = {
    get readyState() { return ws.readyState; },
    onopen: null,
    onclose: null,
    onerror: null,
    onmessage: null,
    send(data) { ws.send(data); },
    close() { ws.close(); },
  };
  ws.on('open', () => { if (adapter.onopen) adapter.onopen(); });
  ws.on('close', () => { if (adapter.onclose) adapter.onclose(); });
  ws.on('error', (err) => { if (adapter.onerror) adapter.onerror(err); });
  ws.on('message', (buf) => {
    if (adapter.onmessage) adapter.onmessage({ data: buf.toString('utf8') });
  });
  return adapter;
};

const waitFor = async (predicate, timeoutMs = 2500) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const val = await predicate();
    if (val) return val;
    await new Promise((r) => setTimeout(r, 15));
  }
  throw new Error('waitFor timed out');
};

describe('Патч 479: защита от 50%-смещения экрана при синке в админке и сверка PWA <-> Replit', () => {
  let serverInstance = null;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    if (serverInstance) {
      await serverInstance.close();
      serverInstance = null;
    }
    delete process.env.EXPO_PUBLIC_ROOM_SERVER_URL;
  });

  it('pagerScrollGuard блокирует 50%-смещение scrollLeft на overflow:hidden пейджере и помечает скрытые вкладки inert', () => {
    // Имитация DOM-дерева TabView в режиме Админа (2 вкладки шириной по 1000px -> лента 2000px)
    const makeEl = (tag, { overflowX = 'visible', scrollLeft = 0, attrs = {}, parent = null } = {}) => {
      const attrMap = new Map(Object.entries(attrs));
      const el = {
        nodeType: 1,
        tagName: tag.toUpperCase(),
        style: { overflowX, overflow: overflowX },
        scrollLeft,
        inert: false,
        parentElement: parent,
        children: [],
        getAttribute: (k) => (attrMap.has(k) ? attrMap.get(k) : null),
        setAttribute: (k, v) => { attrMap.set(k, String(v)); },
        removeAttribute: (k) => { attrMap.delete(k); },
        hasAttribute: (k) => attrMap.has(k),
        closest(selector) {
          if (selector === '[aria-hidden="true"]') {
            let cur = this;
            while (cur) {
              if (cur.getAttribute?.('aria-hidden') === 'true') return cur;
              cur = cur.parentElement;
            }
          }
          return null;
        },
      };
      if (parent) parent.children.push(el);
      return el;
    };

    const root = makeEl('div', { overflowX: 'visible' });
    const pagerDiv = makeEl('div', { overflowX: 'hidden', scrollLeft: 500, parent: root }); // сдвинулся на 50%!
    const sheetDiv = makeEl('div', { overflowX: 'visible', parent: pagerDiv });
    const homeScene = makeEl('div', { overflowX: 'hidden', attrs: { 'aria-hidden': 'false' }, parent: sheetDiv });
    const lootScene = makeEl('div', { overflowX: 'hidden', attrs: { 'aria-hidden': 'true' }, parent: sheetDiv });
    const homeBtn = makeEl('button', { parent: homeScene });
    const hiddenLootBtn = makeEl('button', { parent: lootScene });
    const userHorizontalScroll = makeEl('div', { overflowX: 'auto', scrollLeft: 180, parent: homeScene });

    const collectAll = (node, pred, acc = []) => {
      for (const ch of node.children || []) {
        if (pred(ch)) acc.push(ch);
        collectAll(ch, pred, acc);
      }
      return acc;
    };
    root.querySelectorAll = (sel) => {
      if (sel === '[aria-hidden]') return collectAll(root, (n) => n.hasAttribute('aria-hidden'));
      if (sel === 'div') return collectAll(root, (n) => n.tagName === 'DIV');
      return [];
    };

    const fakeWin = {
      getComputedStyle: (el) => ({ overflowX: el.style.overflowX || 'visible' }),
    };

    // 1. sanitizeRootPagerDom сбрасывает 50%-смещение (500 -> 0), ставит inert на скрытую вкладку
    //    и НЕ трогает легитимный горизонтальный ScrollView (overflow-x: auto -> 180).
    const fixedCount = sanitizeRootPagerDom(root, fakeWin);
    expect(fixedCount).toBe(1);
    expect(pagerDiv.scrollLeft).toBe(0);
    expect(userHorizontalScroll.scrollLeft).toBe(180);
    expect(lootScene.inert).toBe(true);
    expect(lootScene.getAttribute('inert')).toBe('');
    expect(homeScene.inert).toBe(false);

    // 2. installSafeProgrammaticFocus передаёт { preventScroll: true } для узлов внутри пейджера,
    //    блокирует фокус внутрь скрытой вкладки [aria-hidden="true"] и гасит случайный сдвиг браузера.
    const focusCalls = [];
    function FakeHTMLElement() {}
    FakeHTMLElement.prototype.focus = function mockNativeFocus(opts) {
      focusCalls.push({ target: this, opts });
      if (!opts?.preventScroll) {
        // Имитация поведения Blink без preventScroll: центрирование 2W-ленты даёт scrollLeft = 500
        pagerDiv.scrollLeft = 500;
      }
    };
    fakeWin.HTMLElement = FakeHTMLElement;
    Object.setPrototypeOf(homeBtn, FakeHTMLElement.prototype);
    Object.setPrototypeOf(hiddenLootBtn, FakeHTMLElement.prototype);

    installSafeProgrammaticFocus(fakeWin);

    hiddenLootBtn.focus();
    expect(focusCalls).toHaveLength(0);
    expect(pagerDiv.scrollLeft).toBe(0);

    homeBtn.focus();
    expect(focusCalls).toHaveLength(1);
    expect(focusCalls[0].opts).toEqual({ preventScroll: true });
    expect(pagerDiv.scrollLeft).toBe(0);

    // 3. Даже если браузер напрямую сдвинул scrollLeft во время события, clampHiddenOverflowAncestors мгновенно возвращает 0
    pagerDiv.scrollLeft = 500;
    expect(clampHiddenOverflowAncestors(homeBtn, fakeWin)).toBe(1);
    expect(pagerDiv.scrollLeft).toBe(0);
  });

  it('App.js и googleDriveSync.js содержат ключ топологии навигатора и синхронизацию комнат Мастера gm_rooms', () => {
    const appSrc = fs.readFileSync(path.join(ROOT, 'App.js'), 'utf8');
    expect(appSrc).toContain('navTopologyKey');
    expect(appSrc).toContain('key={`${locale}:${navTopologyKey}`}');
    expect(appSrc).toContain('startWebPagerScrollGuard');

    const driveSrc = fs.readFileSync(path.join(ROOT, 'components/cloudSync/googleDriveSync.js'), 'utf8');
    expect(driveSrc).toContain("const GM_ROOMS_FOLDER_NAME = 'gm_rooms';");
    expect(driveSrc).toContain('syncGmRoomsInSession');
    expect(driveSrc).toContain('export const syncGmRoomToCloudIfEnabled = async');
    expect(driveSrc).toContain('export const deleteGmRoomFromCloudIfEnabled = async');
  });

  it('если вкладка Мастера на Replit временно отсоединялась в момент «Забрать всё» из PWA, переподключение сразу опустошает и закрывает сундук у Мастера', async () => {
    serverInstance = createRoomServer({ port: 0, host: '127.0.0.1', distDir: '/nonexistent' });
    const { port } = await serverInstance.start();
    const wsUrl = `ws://127.0.0.1:${port}/ws`;
    process.env.EXPO_PUBLIC_ROOM_SERVER_URL = wsUrl;

    const db = await import('../../db');
    await db.initDatabase();

    const { createRoomClient } = await import('../../src/room/roomClient');
    const roomStoreMod = await import('../../src/room/roomStore');
    const useRoomStore = roomStoreMod.default;
    const {
      startGmSessionPersistence,
      subscribeGmContainerUpdates,
    } = await import('../../src/lootTrade/gmSessionPersistence');

    // 1. Мастер в браузере (Replit) создаёт комнату и выдаёт сохранённый сундук
    roomStoreMod.resetRoomClientForTests();
    roomStoreMod.setRoomClientFactoryForTests(({ url, onStatus, onMessage }) => (
      createRoomClient({
        url,
        clientId: 'replit-gm-browser:t-tab1',
        onStatus,
        onMessage,
        webSocketFactory: createWsAdapter,
      })
    ));
    useRoomStore.setState({ status: 'offline', rooms: {}, lastError: null });

    const created = await useRoomStore.getState().createRoom({ name: 'Стол Replit+PWA' });
    const folder = await db.createCharacterFolder('Стол Replit+PWA');
    await db.upsertFolderRoom(folder.id, created.code, created.ownerToken);
    await useRoomStore.getState().joinRoom({
      code: created.code,
      name: 'GM',
      role: 'gm',
      ownerToken: created.ownerToken,
    });

    const savedChest = await db.saveGmContainer({
      id: 'cnt_replit_pwa_479',
      kind: 'loot',
      name: 'Ящик из облака',
      items: [
        { entryId: 'e_ammo', itemId: 'ammo_10mm', category: 'ammo', name: '10-мм патроны', quantity: 14 },
        { entryId: 'e_stim', itemId: 'chem_stimpak', category: 'chems', name: 'Стимулятор', quantity: 3 },
      ],
    });

    const stopPersistence = startGmSessionPersistence();
    const emptiedEvents = [];
    const unsubUpdates = subscribeGmContainerUpdates((id, meta) => {
      if (meta?.emptied) emptiedEvents.push({ id, meta });
    });

    // 2. Игрок открывает приложение через отдельное установленное PWA и входит в комнату
    let pwaSession = null;
    const pwaClient = createRoomClient({
      url: wsUrl,
      clientId: 'pwa-standalone-player:t-pwa1',
      onStatus: () => {},
      onMessage: (msg) => {
        if (msg.type === 'session.state' && msg.payload && 'session' in msg.payload) {
          pwaSession = msg.payload.session;
        }
      },
      webSocketFactory: createWsAdapter,
    });
    pwaClient.send('room.join', {
      code: created.code,
      name: 'Курьер (PWA)',
      role: 'player',
      requestId: 'req-pwa-join',
    }, created.code);

    await waitFor(() => serverInstance.registry.getRoom(created.code)?.members.has('pwa-standalone-player:t-pwa1'));

    // Мастер выдаёт сундук на всю комнату
    const opened = await useRoomStore.getState().openRoomSession({
      code: created.code,
      ownerToken: created.ownerToken,
      session: {
        containerId: savedChest.id,
        kind: 'loot',
        name: savedChest.name,
        targetType: 'room',
        items: savedChest.items,
      },
    });
    await waitFor(() => pwaSession?.sessionId === opened.sessionId);

    // 3. Вкладка Мастера на Replit временно теряет WS-соединение (например, фоновый троттлинг вкладки)
    roomStoreMod.resetRoomClientForTests();
    useRoomStore.setState({ status: 'offline', rooms: {}, lastError: null });

    // Пока Мастер оффлайн, игрок в PWA нажимает «Забрать всё»!
    let pwaTakeResult = null;
    const origOnMsg = pwaClient;
    expect(origOnMsg).toBeTruthy();
    const pwaClient2 = createRoomClient({
      url: wsUrl,
      clientId: 'pwa-standalone-player:t-pwa1',
      onStatus: () => {},
      onMessage: (msg) => {
        if (msg.type === 'session.lootTake') pwaTakeResult = msg;
      },
      webSocketFactory: createWsAdapter,
    });
    pwaClient.close();
    pwaClient2.send('room.join', {
      code: created.code,
      name: 'Курьер (PWA)',
      role: 'player',
      requestId: 'req-pwa-rejoin',
    }, created.code);
    await new Promise((r) => setTimeout(r, 40));

    pwaClient2.send('session.lootTake', {
      sessionId: opened.sessionId,
      characterId: 'char_pwa_1',
      takes: [
        { entryId: 'e_ammo', quantity: 14 },
        { entryId: 'e_stim', quantity: 3 },
      ],
      requestId: 'req-pwa-take-all',
    }, created.code);

    await waitFor(() => pwaTakeResult !== null);
    expect(pwaTakeResult.payload.session).toBeNull();
    expect(pwaTakeResult.payload.closedReason).toBe('loot_emptied');

    // 4. Вкладка Мастера на Replit восстанавливает соединение и переподключается к комнате с ownerToken
    roomStoreMod.setRoomClientFactoryForTests(({ url, onStatus, onMessage }) => (
      createRoomClient({
        url,
        clientId: 'replit-gm-browser:t-tab2',
        onStatus,
        onMessage,
        webSocketFactory: createWsAdapter,
      })
    ));

    await useRoomStore.getState().joinRoom({
      code: created.code,
      name: 'GM',
      role: 'gm',
      ownerToken: created.ownerToken,
    });

    // Сразу после переподключения сундук Мастера в БД опустошается, уходит сигнал закрытия карточки и алерт удаления!
    await waitFor(async () => {
      const c = await db.getGmContainerById(savedChest.id);
      return Array.isArray(c?.items) && c.items.length === 0;
    });

    const finalChest = await db.getGmContainerById(savedChest.id);
    expect(finalChest.items).toEqual([]);
    expect(useRoomStore.getState().rooms[created.code]?.activeSession).toBeNull();
    expect(emptiedEvents.some((ev) => ev.id === savedChest.id)).toBe(true);
    expect(showRawAlert).toHaveBeenCalledTimes(1);

    unsubUpdates();
    stopPersistence();
    pwaClient2.close();
    roomStoreMod.resetRoomClientForTests();
  });
});
