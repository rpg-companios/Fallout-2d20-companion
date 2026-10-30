import fs from 'fs';
import path from 'path';
import WebSocket from 'ws';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  DEFAULT_PRODUCTION_ROOM_SERVER_URL,
  normalizeRoomServerUrl,
  isLocalOrSandboxRoomHost,
  resolveRoomServerUrl,
  createRoomClient,
} from '../../src/room/roomClient';
import { MESSAGE } from '../../server/protocol.js';
import { createRoomServer } from '../../server/roomServer.js';

const waitFor = async (predicate, timeoutMs = 4000) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const val = await predicate();
    if (val) return val;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('Timed out waiting for condition');
};

describe('Patch 475 — Shared wss://fallout2d20-companion.na4u.ru/ws for Replit & NetAngels', () => {
  let prevEnv;

  beforeEach(() => {
    prevEnv = process.env.EXPO_PUBLIC_ROOM_SERVER_URL;
    delete process.env.EXPO_PUBLIC_ROOM_SERVER_URL;
  });

  afterEach(() => {
    if (prevEnv === undefined) {
      delete process.env.EXPO_PUBLIC_ROOM_SERVER_URL;
    } else {
      process.env.EXPO_PUBLIC_ROOM_SERVER_URL = prevEnv;
    }
  });

  it('points Replit deployments, NetAngels hosting, and React Native builds to wss://fallout2d20-companion.na4u.ru/ws', () => {
    expect(DEFAULT_PRODUCTION_ROOM_SERVER_URL).toBe('wss://fallout2d20-companion.na4u.ru/ws');

    // Replit static deployment (*.replit.app, *.repl.co) and Replit workspace (*.replit.dev)
    expect(
      resolveRoomServerUrl({
        location: {
          protocol: 'https:',
          host: 'fallout-2d20-companion.replit.app',
          hostname: 'fallout-2d20-companion.replit.app',
        },
      }),
    ).toBe('wss://fallout2d20-companion.na4u.ru/ws');

    expect(
      resolveRoomServerUrl({
        location: {
          protocol: 'https:',
          host: 'ab12cd34-00-xyz.picard.replit.dev',
          hostname: 'ab12cd34-00-xyz.picard.replit.dev',
        },
      }),
    ).toBe('wss://fallout2d20-companion.na4u.ru/ws');

    // NetAngels production site
    expect(
      resolveRoomServerUrl({
        location: {
          protocol: 'https:',
          host: 'fallout2d20-companion.na4u.ru',
          hostname: 'fallout2d20-companion.na4u.ru',
        },
      }),
    ).toBe('wss://fallout2d20-companion.na4u.ru/ws');

    // Native Android/iOS APK
    expect(
      resolveRoomServerUrl({
        location: null,
        isReactNative: true,
      }),
    ).toBe('wss://fallout2d20-companion.na4u.ru/ws');

    // Bare Node / Vitest environment stays offline unless EXPO_PUBLIC_ROOM_SERVER_URL is set
    expect(
      resolveRoomServerUrl({
        location: null,
        isReactNative: false,
      }),
    ).toBeNull();
  });

  it('preserves local/LAN/sandbox same-origin /ws and supports EXPO_PUBLIC_ROOM_SERVER_URL overrides', () => {
    expect(isLocalOrSandboxRoomHost('localhost')).toBe(true);
    expect(isLocalOrSandboxRoomHost('127.0.0.1')).toBe(true);
    expect(isLocalOrSandboxRoomHost('192.168.1.25')).toBe(true);
    expect(isLocalOrSandboxRoomHost('10.0.0.5')).toBe(true);
    expect(isLocalOrSandboxRoomHost('172.20.4.8')).toBe(true);
    expect(isLocalOrSandboxRoomHost('5000-sandbox.e2b.app')).toBe(true);
    expect(isLocalOrSandboxRoomHost('fallout-2d20-companion.replit.app')).toBe(false);
    expect(isLocalOrSandboxRoomHost('fallout2d20-companion.na4u.ru')).toBe(false);

    expect(
      resolveRoomServerUrl({
        location: { protocol: 'http:', host: 'localhost:5000', hostname: 'localhost' },
      }),
    ).toBe('ws://localhost:5000/ws');

    expect(
      resolveRoomServerUrl({
        location: { protocol: 'https:', host: '5000-sandbox.e2b.app', hostname: '5000-sandbox.e2b.app' },
      }),
    ).toBe('wss://5000-sandbox.e2b.app/ws');

    // Normalizes https://... with trailing slash to wss://.../ws
    expect(normalizeRoomServerUrl('https://fallout2d20-companion.na4u.ru/')).toBe(
      'wss://fallout2d20-companion.na4u.ru/ws',
    );
    expect(normalizeRoomServerUrl('http://localhost:5000')).toBe('ws://localhost:5000/ws');
    expect(normalizeRoomServerUrl('ws://test.invalid/ws')).toBe('ws://test.invalid/ws');

    expect(
      resolveRoomServerUrl({
        envUrl: 'same-origin',
        location: { protocol: 'https:', host: 'custom.example.org', hostname: 'custom.example.org' },
      }),
    ).toBe('wss://custom.example.org/ws');

    expect(
      resolveRoomServerUrl({
        envUrl: 'off',
        location: { protocol: 'https:', host: 'fallout-2d20-companion.replit.app' },
      }),
    ).toBeNull();
  });

  it('keeps Replit configured for free static deployment while exchanging rooms and data cross-origin with NetAngels /ws', async () => {
    const replitConfig = fs.readFileSync(path.resolve(process.cwd(), '.replit'), 'utf8');
    expect(replitConfig).toContain('deploymentTarget = "static"');
    expect(replitConfig).toContain('publicDir = "dist"');

    const serverApp = createRoomServer({ port: 0, host: '127.0.0.1', distDir: '/nonexistent' });
    const started = await serverApp.start();
    const wsUrl = `ws://127.0.0.1:${started.port}/ws`;

    const replitGmMessages = [];
    const netangelsPlayerMessages = [];

    const replitGm = createRoomClient({
      url: wsUrl,
      clientId: 'replit-gm-475',
      onStatus: () => {},
      onMessage: (m) => replitGmMessages.push(m),
      webSocketFactory: (u) =>
        new WebSocket(u, {
          headers: {
            Origin: 'https://fallout-2d20-companion.replit.app',
            'X-Real-IP': '198.51.100.10',
          },
        }),
    });

    const netangelsPlayer = createRoomClient({
      url: wsUrl,
      clientId: 'na4u-player-475',
      onStatus: () => {},
      onMessage: (m) => netangelsPlayerMessages.push(m),
      webSocketFactory: (u) =>
        new WebSocket(u, {
          headers: {
            Origin: 'https://fallout2d20-companion.na4u.ru',
            'X-Forwarded-For': '203.0.113.77',
          },
        }),
    });

    try {
      await waitFor(() => replitGm.getStatus() === 'online' && netangelsPlayer.getStatus() === 'online');

      // 1. GM on Replit static site creates a room on fallout2d20-companion.na4u.ru
      replitGm.send(MESSAGE.ROOM_CREATE, { name: 'Пустошь с Replit', requestId: 'req-create-475' }, null);
      const created = await waitFor(() =>
        replitGmMessages.find((m) => m.type === MESSAGE.ROOM_CREATED && m.payload?.requestId === 'req-create-475'),
      );
      const roomCode = created.payload.code;

      replitGm.send(MESSAGE.ROOM_JOIN, { code: roomCode, name: 'GM Replit', role: 'gm', requestId: 'req-gm-join' }, roomCode);
      await waitFor(() =>
        replitGmMessages.find((m) => m.type === MESSAGE.ROOM_STATE && m.payload?.requestId === 'req-gm-join'),
      );

      // 2. Player on NetAngels joins the same room and publishes a character snapshot
      netangelsPlayer.send(
        MESSAGE.ROOM_JOIN,
        { code: roomCode, name: 'Выживший NA4U', role: 'player', requestId: 'req-pl-join' },
        roomCode,
      );
      await waitFor(() =>
        netangelsPlayerMessages.find((m) => m.type === MESSAGE.ROOM_STATE && m.payload?.requestId === 'req-pl-join'),
      );

      netangelsPlayer.send(
        MESSAGE.CHAR_PUBLISH,
        {
          code: roomCode,
          characterId: 'char_cross_475',
          revision: 1,
          snapshot: { name: 'Курьер Шесть', level: 5, caps: 120 },
        },
        roomCode,
      );

      const snapshotSeenByReplitGm = await waitFor(() =>
        replitGmMessages.find(
          (m) => m.type === MESSAGE.CHAR_PUBLISH && m.payload?.characterId === 'char_cross_475',
        ),
      );
      expect(snapshotSeenByReplitGm.payload.snapshot.name).toBe('Курьер Шесть');

      // 3. GM on Replit issues a loot chest and Player on NetAngels receives it immediately
      replitGm.send(
        MESSAGE.SESSION_OPEN,
        {
          code: roomCode,
          requestId: 'req-open-475',
          session: {
            containerId: 'cnt_replit_475',
            kind: 'loot',
            name: 'Посылка Мохаве',
            targetType: 'room',
            items: [
              {
                entryId: 'entry_475',
                itemId: 'caps',
                itemType: 'caps',
                name: 'Крышки',
                quantity: 75,
              },
            ],
          },
        },
        roomCode,
      );

      const sessionSeenByPlayer = await waitFor(() =>
        netangelsPlayerMessages.find(
          (m) => m.type === MESSAGE.SESSION_STATE && m.payload?.session?.containerId === 'cnt_replit_475',
        ),
      );
      expect(sessionSeenByPlayer.payload.session.items[0].quantity).toBe(75);
    } finally {
      replitGm.close();
      netangelsPlayer.close();
      await serverApp.close();
    }
  });
});
