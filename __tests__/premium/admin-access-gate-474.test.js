import fs from 'fs';
import path from 'path';
import WebSocket from 'ws';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const alertCalls = [];

vi.mock('react-native', () => ({
  Platform: { OS: 'web' },
  Alert: { alert: vi.fn() },
}));

vi.mock('../../components/alerts/alertService', () => ({
  showRawAlert: (payload) => {
    alertCalls.push(payload);
  },
}));

vi.mock('../../db', () => import('../../db/Database.web.js'));

import * as db from '../../db/Database.web.js';
import { setCurrentLocale } from '../../i18n/locale';
import {
  FEATURE_IDS,
  ADMIN_FEATURE_IDS,
  ADMIN_LICENSE_ERROR,
  OPEN_BETA_BY_DEFAULT,
  getEntitlement,
  setEntitlement,
  resetEntitlementToDefault,
  activateAdminLicense,
  subscribeEntitlement,
  isAdminLicensed,
  isGmCampaignsLicensed,
  isGmLootTradeLicensed,
  assertAdminFeature,
} from '../../domain/premium';
import {
  guardAdminAction,
  enforceAdminModeEntitlement,
} from '../../src/premium/adminAccessGate';
import { CONTAINER_KIND } from '../../domain/lootTrade';
import useAppSettingsStore from '../../src/store/appSettingsStore';
import { useUiModeStore } from '../../src/room/uiModeStore';
import useRoomStore, {
  resetRoomClientForTests,
  setRoomClientFactoryForTests,
} from '../../src/room/roomStore';
import { createRoomClient } from '../../src/room/roomClient';
import { MESSAGE } from '../../server/protocol.js';
import { createRoomServer } from '../../server/roomServer.js';

const waitFor = async (predicate, timeoutMs = 4000) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const val = await predicate();
    if (val) return val;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error('Timed out waiting for condition');
};

describe('Patch 474 — Centralized Admin license gate & bilingual non-technical guides', () => {
  let serverApp = null;
  let wsUrl = '';

  beforeEach(async () => {
    alertCalls.length = 0;
    resetEntitlementToDefault();
    setCurrentLocale('ru-RU');
    useAppSettingsStore.getState().setValue('uiMode', 'user');
    useUiModeStore.getState().setTabUiMode('user');

    resetRoomClientForTests();
    setRoomClientFactoryForTests(null);
    useRoomStore.setState({ status: 'offline', clientId: null, rooms: {}, lastError: null });

    await db.initDatabase();

    serverApp = createRoomServer({ port: 0, host: '127.0.0.1', distDir: '/nonexistent' });
    const started = await serverApp.start();
    wsUrl = `ws://127.0.0.1:${started.port}/ws`;
    process.env.EXPO_PUBLIC_ROOM_SERVER_URL = wsUrl;
    setRoomClientFactoryForTests((input) => createRoomClient({
      ...input,
      webSocketFactory: (u) => new WebSocket(u),
    }));
  });

  afterEach(async () => {
    resetEntitlementToDefault();
    resetRoomClientForTests();
    setRoomClientFactoryForTests(null);
    if (serverApp) {
      await serverApp.close();
      serverApp = null;
    }
  });

  it('keeps all Admin & GM Loot/Trade mechanics open by default in open-beta mode', () => {
    expect(OPEN_BETA_BY_DEFAULT).toBe(true);
    expect(getEntitlement().plan).toBe('open-beta');
    expect(isAdminLicensed()).toBe(true);
    expect(isGmCampaignsLicensed()).toBe(true);
    expect(isGmLootTradeLicensed()).toBe(true);

    for (const featureId of ADMIN_FEATURE_IDS) {
      expect(() => assertAdminFeature(featureId)).not.toThrow();
    }

    const fn = vi.fn();
    expect(guardAdminAction(FEATURE_IDS.ADMIN_ACCESS, fn)).toBe(true);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(alertCalls).toHaveLength(0);
  });

  it('blocks all Admin UI actions, GM room operations, and GM container mutations when switched to free plan, while preserving saved data', async () => {
    // 1. Save a GM container while open-beta is active
    const savedChest = await db.saveGmContainer({
      id: 'cnt_license_keep_474',
      kind: CONTAINER_KIND.LOOT,
      name: 'Запас Смотрителя',
      items: [
        {
          id: 'line_474_1',
          itemId: 'caps',
          itemType: 'currency',
          name: 'Крышки',
          quantity: 55,
        },
      ],
    });
    expect((await db.getGmContainersList()).some((c) => c.id === 'cnt_license_keep_474')).toBe(true);

    // 2. Switch user into GM mode first, then revoke open-beta entitlement -> free mode
    useAppSettingsStore.getState().setValue('uiMode', 'gm');
    useUiModeStore.getState().setTabUiMode('gm');

    const events = [];
    const unsubscribe = subscribeEntitlement((next) => events.push(next.plan));

    setEntitlement({
      plan: 'free',
      allFeatures: false,
      features: [],
      expiresAt: null,
    });
    unsubscribe();

    expect(events).toEqual(['free']);
    expect(isAdminLicensed()).toBe(false);
    expect(isGmCampaignsLicensed()).toBe(false);
    expect(isGmLootTradeLicensed()).toBe(false);

    // 3. enforceAdminModeEntitlement resets UI modes back to 'user'
    expect(enforceAdminModeEntitlement()).toBe(true);
    expect(useAppSettingsStore.getState().getSettingValue('uiMode')).toBe('user');
    expect(useUiModeStore.getState().tabUiMode).toBe('user');

    // 4. guardAdminAction blocks callback and shows localized RU & EN alerts
    setCurrentLocale('ru-RU');
    const blockedFn = vi.fn();
    expect(guardAdminAction(FEATURE_IDS.ADMIN_ACCESS, blockedFn)).toBe(false);
    expect(blockedFn).not.toHaveBeenCalled();
    expect(alertCalls.at(-1)?.title).toBe('Требуется лицензия Мастера');

    setCurrentLocale('en-EN');
    expect(guardAdminAction(FEATURE_IDS.GM_LOOT_TRADE, blockedFn)).toBe(false);
    expect(alertCalls.at(-1)?.title).toBe('Game Master License Required');

    // 5. GM store & DB operations reject with ADMIN_LICENSE_REQUIRED
    await expect(useRoomStore.getState().createRoom({ name: 'Закрытая кампания' })).rejects.toMatchObject({
      code: ADMIN_LICENSE_ERROR,
    });
    await expect(useRoomStore.getState().joinRoom({ code: 'GM-7Q3K9M', role: 'gm' })).rejects.toMatchObject({
      code: ADMIN_LICENSE_ERROR,
    });
    await expect(
      useRoomStore.getState().openRoomSession({
        code: 'GM-7Q3K9M',
        session: { containerId: 's1', kind: CONTAINER_KIND.LOOT, name: 'Тайник', items: [] },
      }),
    ).rejects.toMatchObject({
      code: ADMIN_LICENSE_ERROR,
    });
    await expect(
      useRoomStore.getState().updateRoomSessionRates({ code: 'GM-7Q3K9M', caps: 100 }),
    ).rejects.toMatchObject({
      code: ADMIN_LICENSE_ERROR,
    });
    await expect(
      useRoomStore.getState().closeRoomSession({ code: 'GM-7Q3K9M', sessionId: 's1' }),
    ).rejects.toMatchObject({
      code: ADMIN_LICENSE_ERROR,
    });

    await expect(db.saveGmContainer(savedChest)).rejects.toMatchObject({ code: ADMIN_LICENSE_ERROR });
    await expect(db.duplicateGmContainer('cnt_license_keep_474')).rejects.toMatchObject({
      code: ADMIN_LICENSE_ERROR,
    });
    await expect(db.deleteGmContainer('cnt_license_keep_474')).rejects.toMatchObject({
      code: ADMIN_LICENSE_ERROR,
    });

    // 6. Activating permanent non-expiring license restores full access and keeps previously saved containers intact
    const activated = activateAdminLicense({
      keyId: 'POS-GM-PERMANENT-001',
      accountSubHash: 'gm-sub-hash-001',
    });
    expect(activated.plan).toBe('licensed');
    expect(activated.expiresAt).toBeNull();
    expect(isAdminLicensed()).toBe(true);
    expect(isGmCampaignsLicensed()).toBe(true);
    expect(isGmLootTradeLicensed()).toBe(true);

    const restoredList = await db.getGmContainersList();
    expect(restoredList.find((c) => c.id === 'cnt_license_keep_474')?.items?.[0]?.quantity).toBe(55);
    await db.deleteGmContainer('cnt_license_keep_474');
  });

  it('keeps all Player room connection and Loot/Trade actions completely free when local Admin entitlement is disabled', async () => {
    // Remote licensed GM creates room & joins as GM via raw WS client
    const gmMessages = [];
    const remoteGm = createRoomClient({
      url: wsUrl,
      clientId: 'gm-remote-474',
      webSocketFactory: (u) => new WebSocket(u),
      onStatus: () => {},
      onMessage: (m) => gmMessages.push(m),
    });

    try {
      await waitFor(() => remoteGm.getStatus() === 'online');
      remoteGm.send(
        MESSAGE.ROOM_CREATE,
        { name: 'Комната Ведущего', requestId: 'create-474' },
        null,
      );
      const createdMsg = await waitFor(() =>
        gmMessages.find((m) => m.type === MESSAGE.ROOM_CREATED && m.payload?.requestId === 'create-474'),
      );
      const roomCode = createdMsg.payload.code;

      remoteGm.send(
        MESSAGE.ROOM_JOIN,
        { code: roomCode, name: 'GM', role: 'gm', requestId: 'gm-join-474' },
        roomCode,
      );
      await waitFor(() =>
        gmMessages.find((m) => m.type === MESSAGE.ROOM_STATE && m.payload?.requestId === 'gm-join-474'),
      );

      // Local device is a FREE player without Admin license
      setEntitlement({
        plan: 'free',
        allFeatures: false,
        features: [],
        expiresAt: null,
      });
      expect(isAdminLicensed()).toBe(false);

      // Free player joins GM's room via roomStore without error
      await useRoomStore.getState().joinRoom({ code: roomCode, name: 'Выживший', role: 'player' });
      expect(useRoomStore.getState().rooms[roomCode]?.joined).toBe(true);

      // Remote GM opens a loot session for the room
      remoteGm.send(
        MESSAGE.SESSION_OPEN,
        {
          code: roomCode,
          requestId: 'open-474',
          session: {
            containerId: 'cnt_free_player_474',
            kind: 'loot',
            name: 'Ящик у дороги',
            targetType: 'room',
            items: [
              {
                entryId: 'line_stim_474',
                itemId: 'chem_stimpak',
                itemType: 'chem',
                name: 'Стимулятор',
                quantity: 2,
              },
            ],
          },
        },
        roomCode,
      );

      await waitFor(() => useRoomStore.getState().rooms[roomCode]?.activeSession?.containerId === 'cnt_free_player_474');
      const activeSession = useRoomStore.getState().rooms[roomCode].activeSession;

      // Free player takes 1 item and closes their window — both succeed without license error
      const takeRes = await useRoomStore.getState().takeFromLootSession({
        code: roomCode,
        sessionId: activeSession.sessionId,
        characterId: 'char_player_1',
        takes: [{ entryId: 'line_stim_474', quantity: 1 }],
      });
      expect(takeRes?.session?.items?.[0]?.quantity).toBe(1);

      const closeRes = await useRoomStore.getState().playerCloseRoomSession({
        code: roomCode,
        sessionId: activeSession.sessionId,
      });
      expect(closeRes).toBeTruthy();
    } finally {
      remoteGm.close();
    }
  });

  it('ships complete RU and EN guides without technical code/protocol jargon', () => {
    const ruPath = path.resolve(process.cwd(), 'docs/guides/admin-and-loot-trade.ru.md');
    const enPath = path.resolve(process.cwd(), 'docs/guides/admin-and-loot-trade.en.md');

    expect(fs.existsSync(ruPath)).toBe(true);
    expect(fs.existsSync(enPath)).toBe(true);

    const ruText = fs.readFileSync(ruPath, 'utf8');
    const enText = fs.readFileSync(enPath, 'utf8');

    expect(ruText.length).toBeGreaterThan(2500);
    expect(enText.length).toBeGreaterThan(2500);

    // Core user-facing mechanics covered in both languages
    expect(ruText).toContain('Список кампаний');
    expect(ruText).toContain('Добыча/Торговля');
    expect(ruText).toContain('Локации');
    expect(ruText).toContain('GM-XXX-XXX');
    expect(ruText).toContain('🔒');

    expect(enText).toContain('Campaigns');
    expect(enText).toContain('Loot/Trade');
    expect(enText).toContain('Locations');
    expect(enText).toContain('GM-XXX-XXX');
    expect(enText).toContain('🔒');

    // Free of developer / protocol jargon
    const forbiddenJargon = [
      'WebSocket',
      'SQLite',
      'JSON',
      'roomStore',
      'useUiModeStore',
      'appDataFolder',
      'sanitizeSessionForMember',
      'Zustand',
    ];
    for (const term of forbiddenJargon) {
      expect(ruText).not.toContain(term);
      expect(enText).not.toContain(term);
    }
  });
});
