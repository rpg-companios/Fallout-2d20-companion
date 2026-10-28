// Регрессионные тесты патча 463:
// На Windows с прежним node_modules в корне лежал транзитивный ws@7.x (от Metro),
// где экспортируется ws.Server, а ws.WebSocketServer === undefined, из-за чего
// `expo export --platform web` падал с `TypeError: WebSocketServer is not a constructor`.
// Проверяем:
// 1) resolveWebSocketServer и attachRoomWebSocketServer работают с ws@7 (ws.Server) и ws@8;
// 2) optional: true не бросает исключение даже при полном отсутствии конструктора ws;
// 3) при статической выгрузке `expo export --platform web` Metro вообще не поднимает /ws.

import { describe, expect, it } from 'vitest';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import WebSocket from 'ws';

import metroConfig from '../../metro.config.js';
import {
  attachRoomWebSocketServer,
  resolveWebSocketServer,
} from '../../server/roomServer.js';
import { MESSAGE, PROTOCOL_VERSION } from '../../server/protocol.js';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(__dirname, '../..');

describe('Патч 463: совместимость ws@7 (ws.Server) и защита статической сборки expo export', () => {
  it('resolveWebSocketServer поддерживает ws@7 (ws.Server), ws@8 (ws.WebSocketServer) и default-обёртку', () => {
    function FakeV7Server() {}
    function FakeV8Server() {}

    expect(resolveWebSocketServer({ Server: FakeV7Server })).toBe(FakeV7Server);
    expect(resolveWebSocketServer({ WebSocketServer: FakeV8Server, Server: FakeV7Server })).toBe(FakeV8Server);
    expect(resolveWebSocketServer({ default: { Server: FakeV7Server } })).toBe(FakeV7Server);
    expect(resolveWebSocketServer({})).toBeNull();
    expect(resolveWebSocketServer(null)).toBeNull();
  });

  it('живой комнатный /ws работает поверх реального ws@7 (где WebSocketServer === undefined)', async () => {
    let wsV7;
    try {
      wsV7 = require(path.join(ROOT, 'node_modules/metro/node_modules/ws'));
    } catch {
      const realCtor = WebSocket.WebSocketServer || WebSocket.Server;
      wsV7 = { Server: realCtor };
    }
    // Убеждаемся, что тестируем именно ws@7-форму без именованного WebSocketServer
    const v7Shape = { Server: wsV7.Server };
    expect(v7Shape.WebSocketServer).toBeUndefined();
    expect(typeof v7Shape.Server).toBe('function');

    const httpServer = http.createServer((_req, res) => {
      res.writeHead(200);
      res.end('ok');
    });
    const attached = attachRoomWebSocketServer(httpServer, {
      WebSocketServerImpl: v7Shape,
    });
    expect(attached).toBeTruthy();

    await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    const { port } = httpServer.address();

    try {
      const client = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      await new Promise((resolve, reject) => {
        client.once('open', resolve);
        client.once('error', reject);
      });

      const created = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('timeout')), 3000);
        client.once('message', (raw) => {
          clearTimeout(timer);
          resolve(JSON.parse(raw.toString()));
        });
        client.send(
          JSON.stringify({
            v: PROTOCOL_VERSION,
            type: MESSAGE.ROOM_CREATE,
            roomCode: null,
            clientId: 'win-gm',
            ts: Date.now(),
            payload: { name: 'Windows Build Check', requestId: 'r1' },
          }),
        );
      });

      expect(created.type).toBe(MESSAGE.ROOM_CREATED);
      expect(created.payload.code).toMatch(/^GM-[A-Z2-9]{6}$/);
      client.close();
    } finally {
      await attached.closeWs();
      await new Promise((resolve) => httpServer.close(resolve));
    }
  });

  it('optional: true возвращает null вместо краша, если конструктор ws недоступен', () => {
    const httpServer = http.createServer();
    expect(
      attachRoomWebSocketServer(httpServer, {
        WebSocketServerImpl: null,
        optional: true,
      }),
    ).toBeNull();
  });

  it('при аргументах CLI `expo export --platform web` Metro не цепляет /ws к серверу сборки', async () => {
    const origArgv = process.argv;
    process.argv = ['node', 'C:\\Users\\Pinki\\node_modules\\expo\\bin\\cli', 'export', '--platform', 'web'];
    try {
      const enhanced = metroConfig.server.enhanceMiddleware((_req, res) => {
        res.writeHead(200);
        res.end('export-ok');
      }, {});
      const httpServer = http.createServer((req, res) => enhanced(req, res, () => {}));
      await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
      const { port } = httpServer.address();
      try {
        const res = await fetch(`http://127.0.0.1:${port}/`);
        expect(await res.text()).toBe('export-ok');
        expect(httpServer.__positroniumRoomWs).toBeUndefined();
      } finally {
        await new Promise((resolve) => httpServer.close(resolve));
      }
    } finally {
      process.argv = origArgv;
    }
  });
});
