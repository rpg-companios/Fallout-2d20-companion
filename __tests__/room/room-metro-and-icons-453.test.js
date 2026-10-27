// Регрессионные тесты патча 453:
// 1) WebSocket-сервер комнат (/ws) подключается прямо к HTTP-серверу Metro
//    через enhanceMiddleware и не обрывается слушателем upgrade в @expo/cli;
// 2) Ошибка создания комнаты показывает заголовок ошибки (roomCreateFailed),
//    а не «Комната создана»;
// 3) После createRoom мастер реально входит в комнату (ROOM_JOIN), а после
//    обрыва связи или перезапуска сервера комнаты переподключаются с ownerToken;
// 4) Иконочные шрифты предзагружаются с fetchpriority="high" и узкой веб-точкой
//    входа @expo/vector-icons, а .replit не сбрасывает кэш Metro (--clear).

import { describe, expect, it } from 'vitest';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import WebSocket, { WebSocketServer } from 'ws';

import metroConfig from '../../metro.config.js';
import { MESSAGE, PROTOCOL_VERSION } from '../../server/protocol.js';
import { ALERTS } from '../../components/alerts/catalog.js';
import ruHome from '../../i18n/ru-RU/screens/home/screen.json';
import enHome from '../../i18n/en-EN/screens/home/screen.json';

const ROOT = path.resolve(__dirname, '../..');

describe('Патч 453: комнаты мастера в Metro, честный алерт ошибки и быстрые иконки/кэш', () => {
  it('Metro enhanceMiddleware поднимает /ws поверх сервера с чужим upgrade-слушателем (/hot)', async () => {
    const enhanced = metroConfig.server.enhanceMiddleware((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('metro-ok');
    }, {});

    const httpServer = http.createServer((req, res) => enhanced(req, res, () => {}));
    const hotWss = new WebSocketServer({ noServer: true });
    let hotConnected = false;
    hotWss.on('connection', (ws) => {
      hotConnected = true;
      ws.send('hmr-ready');
    });

    await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    const { port } = httpServer.address();

    // Имитация @expo/cli runServer-fork: слушатель upgrade добавляется ПОСЛЕ listen()
    // и уничтожает все сокеты, кроме /hot.
    httpServer.on('upgrade', (request, socket, head) => {
      const { pathname } = new URL(request.url, 'http://localhost');
      if (pathname === '/hot') {
        hotWss.handleUpgrade(request, socket, head, (ws) => {
          hotWss.emit('connection', ws, request);
        });
      } else {
        socket.destroy();
      }
    });

    try {
      // Первый HTTP-запрос (как открытие index.html в браузере) прикрепляет /ws.
      const res = await fetch(`http://127.0.0.1:${port}/`);
      expect(await res.text()).toBe('metro-ok');
      expect(httpServer.__positroniumRoomWs).toBeTruthy();

      // Проверяем, что /ws создаёт комнату и синхронизирует участников.
      const gmWs = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      await new Promise((resolve, reject) => {
        gmWs.once('open', resolve);
        gmWs.once('error', reject);
      });

      const waitMsg = (ws, predicate) =>
        new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('ws timeout')), 3000);
          const onMsg = (raw) => {
            const parsed = JSON.parse(raw.toString());
            if (predicate(parsed)) {
              clearTimeout(timer);
              ws.off('message', onMsg);
              resolve(parsed);
            }
          };
          ws.on('message', onMsg);
        });

      const createdPromise = waitMsg(gmWs, (m) => m.type === MESSAGE.ROOM_CREATED);
      gmWs.send(JSON.stringify({
        v: PROTOCOL_VERSION,
        type: MESSAGE.ROOM_CREATE,
        roomCode: null,
        clientId: 'gm-metro',
        ts: Date.now(),
        payload: { name: 'Кампания Мохаве', requestId: 'req-create-1' },
      }));
      const created = await createdPromise;
      expect(created.payload.code).toMatch(/^GM-[A-Z2-9]{6}$/);

      const gmStatePromise = waitMsg(gmWs, (m) => m.type === MESSAGE.ROOM_STATE);
      gmWs.send(JSON.stringify({
        v: PROTOCOL_VERSION,
        type: MESSAGE.ROOM_JOIN,
        roomCode: created.payload.code,
        clientId: 'gm-metro',
        ts: Date.now(),
        payload: { code: created.payload.code, name: 'GM', role: 'gm', requestId: 'req-join-gm' },
      }));
      await gmStatePromise;

      const memberBroadcastPromise = waitMsg(
        gmWs,
        (m) => m.type === MESSAGE.ROOM_MEMBER && m.payload.members.some((x) => x.name === 'Курьер'),
      );

      const playerWs = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      await new Promise((resolve, reject) => {
        playerWs.once('open', resolve);
        playerWs.once('error', reject);
      });
      playerWs.send(JSON.stringify({
        v: PROTOCOL_VERSION,
        type: MESSAGE.ROOM_JOIN,
        roomCode: created.payload.code,
        clientId: 'player-metro',
        ts: Date.now(),
        payload: { code: created.payload.code, name: 'Курьер', role: 'player', requestId: 'req-join-p' },
      }));

      const memberBroadcast = await memberBroadcastPromise;
      expect(memberBroadcast.payload.members.map((m) => m.name).sort()).toEqual(['GM', 'Курьер']);

      // Проверяем, что штатный HMR-сокет Metro (/hot) продолжает работать.
      const hotClient = new WebSocket(`ws://127.0.0.1:${port}/hot`);
      const hotGreeting = await new Promise((resolve, reject) => {
        hotClient.once('message', (data) => resolve(data.toString()));
        hotClient.once('error', reject);
      });
      expect(hotConnected).toBe(true);
      expect(hotGreeting).toBe('hmr-ready');

      gmWs.close();
      playerWs.close();
      hotClient.close();
    } finally {
      hotWss.close();
      await httpServer.__positroniumRoomWs?.closeWs();
      await new Promise((resolve) => httpServer.close(resolve));
    }
  });

  it('ошибка создания комнаты использует заголовок ошибки (roomCreateFailed), а не «Комната создана»', () => {
    expect(ALERTS.roomCreateFailed).toEqual({
      scope: 'home',
      kind: 'info',
      titleKey: 'room.createFailedTitle',
      messageKey: 'room.createFailed',
    });
    expect(ruHome.room.createFailedTitle).toBe('Ошибка создания комнаты');
    expect(ruHome.room.createFailedTitle).not.toBe(ruHome.room.createdTitle);
    expect(enHome.room.createFailedTitle).toBe('Room creation failed');
    expect(enHome.room.createFailedTitle).not.toBe(enHome.room.createdTitle);

    const homeSrc = fs.readFileSync(
      path.join(ROOT, 'components/screens/HomeScreen/HomeScreen.js'),
      'utf8',
    );
    expect(homeSrc).toContain("showCatalogAlert('roomCreateFailed')");
    expect(homeSrc).not.toContain("showHomeAlert(tHomeScreen('room.createdTitle'), tHomeScreen('room.createFailed'))");
  });

  it('roomStore позволяет joinRoom сразу после createRoom и перепривязку после offline', async () => {
    process.env.EXPO_PUBLIC_ROOM_SERVER_URL = 'ws://test.invalid/ws';
    const sent = [];
    let handlers = null;
    const mockClient = {
      send(type, payload, roomCode) {
        sent.push({ type, payload, roomCode });
      },
      close() {},
      getStatus: () => 'online',
    };

    const storeModule = await import('../../src/room/roomStore');
    const { ROOM_MESSAGE } = await import('../../src/room/roomProtocol');
    storeModule.resetRoomClientForTests();
    storeModule.setRoomClientFactoryForTests(({ onStatus, onMessage }) => {
      handlers = { onStatus, onMessage };
      return mockClient;
    });
    const useRoomStore = storeModule.default;
    useRoomStore.setState({ status: 'offline', rooms: {}, lastError: null });
    await useRoomStore.getState().connect();

    // 1. Создание комнаты (с поддержкой requestedCode + ownerToken)
    const createPromise = useRoomStore.getState().createRoom({
      name: 'Стол',
      requestedCode: 'GM-7Q3K9M',
      ownerToken: 'tok-restore',
    });
    await new Promise((r) => setTimeout(r, 0));
    const createMsg = sent.find((m) => m.type === ROOM_MESSAGE.ROOM_CREATE);
    expect(createMsg.payload).toMatchObject({
      name: 'Стол',
      requestedCode: 'GM-7Q3K9M',
      ownerToken: 'tok-restore',
    });
    handlers.onMessage({
      type: ROOM_MESSAGE.ROOM_CREATED,
      roomCode: 'GM-7Q3K9M',
      payload: {
        code: 'GM-7Q3K9M',
        name: 'Стол',
        ownerToken: 'tok-restore',
        requestId: createMsg.payload.requestId,
      },
    });
    await createPromise;
    expect(useRoomStore.getState().rooms['GM-7Q3K9M'].joined).toBe(false);

    // 2. Вход мастера сразу после createRoom реально отправляет ROOM_JOIN
    const joinPromise = useRoomStore.getState().joinRoom({
      code: 'GM-7Q3K9M',
      name: 'GM',
      role: 'gm',
    });
    await new Promise((r) => setTimeout(r, 0));
    const joinMsg = sent.find((m) => m.type === ROOM_MESSAGE.ROOM_JOIN);
    expect(joinMsg).toBeTruthy();
    handlers.onMessage({
      type: ROOM_MESSAGE.ROOM_STATE,
      roomCode: 'GM-7Q3K9M',
      payload: {
        code: 'GM-7Q3K9M',
        name: 'Стол',
        members: [{ clientId: 'gm', name: 'GM', role: 'gm' }],
        snapshots: [],
        requestId: joinMsg.payload.requestId,
      },
    });
    await joinPromise;
    expect(useRoomStore.getState().rooms['GM-7Q3K9M'].joined).toBe(true);

    // 3. Обрыв соединения сбрасывает joined -> false для последующего перевхода
    handlers.onStatus('offline');
    expect(useRoomStore.getState().rooms['GM-7Q3K9M'].joined).toBe(false);
  });

  it('веб-иконки предзагружаются с высоким приоритетом, а кэш Metro и шрифтов сохранён', () => {
    const resolvedIcons = metroConfig.resolver.resolveRequest(
      {
        originModulePath: path.join(ROOT, 'components/screens/HomeScreen/HomeScreen.js'),
        resolveRequest: () => ({ type: 'empty' }),
      },
      '@expo/vector-icons',
      'web',
    );
    expect(resolvedIcons).toEqual({
      type: 'sourceFile',
      filePath: path.join(ROOT, 'src/web/vectorIconsWeb.js'),
    });

    const indexSrc = fs.readFileSync(path.join(ROOT, 'index.js'), 'utf8');
    expect(indexSrc).toContain("link.setAttribute('fetchpriority', 'high')");
    expect(indexSrc).toContain('MaterialCommunityIcons?.font');
    expect(indexSrc).toContain('Ionicons?.font');
    expect(indexSrc).toContain('FontAwesome5Free-Brand');

    const swSrc = fs.readFileSync(path.join(ROOT, 'public/service-worker.js'), 'utf8');
    expect(swSrc).toContain('isImmutableOrFontRequest');
    expect(swSrc).toContain('handleImmutableAsset');

    const replitCfg = fs.readFileSync(path.join(ROOT, '.replit'), 'utf8');
    expect(replitCfg).toContain('env CI=1 npx expo start --web --port 5000');
    expect(replitCfg).not.toContain('--clear');
  });
});
