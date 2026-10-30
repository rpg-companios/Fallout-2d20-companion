import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WebSocket from 'ws';

vi.mock('react-native', () => ({
  Platform: { OS: 'web' },
  StyleSheet: {
    create: (s) => s,
    flatten: (s) => (Array.isArray(s) ? Object.assign({}, ...s.filter(Boolean)) : (s || {})),
  },
  View: 'View',
  Text: 'Text',
  Image: 'Image',
  TouchableOpacity: 'TouchableOpacity',
  ScrollView: 'ScrollView',
  Modal: 'Modal',
  Pressable: 'Pressable',
  TextInput: 'TextInput',
}));

vi.mock('@expo/vector-icons', () => ({
  MaterialCommunityIcons: 'MaterialCommunityIcons',
  Ionicons: 'Ionicons',
  FontAwesome5: 'FontAwesome5',
}));

vi.mock('@react-navigation/material-top-tabs', () => ({
  createMaterialTopTabNavigator: () => ({
    Navigator: 'Navigator',
    Screen: 'Screen',
  }),
}));

vi.mock('../../db', () => import('../../db/Database.web.js'));
vi.mock('../../db/Database', () => import('../../db/Database.web.js'));

const alertsLog = [];
vi.mock('../../components/alerts/alertService', () => ({
  showRawAlert: (payload) => { alertsLog.push(payload); },
  showAlert: (id) => { alertsLog.push({ id }); },
  confirmAlert: vi.fn().mockResolvedValue(true),
}));

vi.mock('../../components/cloudSync/googleDriveSync', () => ({
  syncCharacterToCloudIfEnabled: vi.fn().mockResolvedValue({ ok: true }),
  deleteCharacterFromCloudIfEnabled: vi.fn().mockResolvedValue({ ok: true }),
  syncGmContainerToCloudIfEnabled: vi.fn().mockResolvedValue({ ok: true }),
  deleteGmContainerFromCloudIfEnabled: vi.fn().mockResolvedValue({ ok: true }),
  syncGmRoomToCloudIfEnabled: vi.fn().mockResolvedValue({ ok: true }),
  deleteGmRoomFromCloudIfEnabled: vi.fn().mockResolvedValue({ ok: true }),
  syncAllCharactersWithCloud: vi.fn().mockResolvedValue({ uploaded: 0, downloaded: 0 }),
  openCloudFolderInDrive: vi.fn().mockResolvedValue(undefined),
}));

import * as db from '../../db/Database.web.js';
import { createRoomServer } from '../../server/roomServer.js';
import { createRoomClient } from '../../src/room/roomClient';
import { ROOM_MESSAGE } from '../../src/room/roomProtocol';
import useRoomStore, {
  resetRoomClientForTests,
  setRoomClientFactoryForTests,
} from '../../src/room/roomStore';
import useUiModeStore from '../../src/room/uiModeStore';
import useCharacterStore from '../../src/store/characterStore';
import { extractGmCharacterSummary } from '../../modules/fallout/gm/gmCharacterSummary';
import { GM_DIRECTIVE_KIND } from '../../modules/fallout/gm/gmDirectives';
import {
  processPendingDirectivesForPlayer,
  resetAppliedDirectivesForTests,
} from '../../components/gm/PlayerDirectiveOverlay';

const ROOT = path.resolve(__dirname, '../..');

function createWsAdapter(url) {
  const raw = new WebSocket(url);
  const adapter = {
    get readyState() { return raw.readyState; },
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
    send: (data) => raw.send(data),
    close: () => raw.close(),
  };
  raw.on('open', () => {
    adapter.onopen?.();
  });
  raw.on('message', (buf) => {
    adapter.onmessage?.({ data: buf.toString('utf8') });
  });
  raw.on('close', () => {
    adapter.onclose?.();
  });
  raw.on('error', (err) => {
    adapter.onerror?.(err);
  });
  return adapter;
}

const waitUntil = async (predicate, timeoutMs = 4000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error('Timeout waiting for condition');
};

describe('Патч 481: отдельный навигатор Мастера (navbar2), readonly-карточки со спойлерами и команды с ack-очередью', () => {
  let serverInstance = null;

  beforeEach(async () => {
    alertsLog.length = 0;
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear();
    }
    await db.initDatabase();
    await resetAppliedDirectivesForTests();
  });

  afterEach(async () => {
    if (serverInstance) {
      await serverInstance.close();
      serverInstance = null;
    }
    delete process.env.EXPO_PUBLIC_ROOM_SERVER_URL;
  });

  it('App.js и HomeScreen.js разводят навигатор Игрока и navbar2 Мастера без загрузки чужого листа в characterStore', () => {
    const appSrc = fs.readFileSync(path.join(ROOT, 'App.js'), 'utf8');
    expect(appSrc).toContain('\x3cGmWorkspaceNavigator');
    expect(appSrc).toContain('\x3cPlayerDirectiveOverlay />');
    expect(appSrc).toContain('const characterSheetTabsActive = !isGmMode && moduleTabsActive;');

    const gmNavSrc = fs.readFileSync(path.join(ROOT, 'components/gm/GmWorkspaceNavigator.js'), 'utf8');
    expect(gmNavSrc).toContain('id="GmNavbar2"');
    expect(gmNavSrc).toContain('swipeEnabled: true');
    expect(gmNavSrc).toContain('GM_TAB_ROUTES');

    const homeSrc = fs.readFileSync(path.join(ROOT, 'components/screens/HomeScreen/HomeScreen.js'), 'utf8');
    expect(homeSrc).toContain('\x3cGmRoomCharacterCard');
    expect(homeSrc).toContain('\x3cGmCommandModal');
    expect(homeSrc).not.toContain('loadCharacterFromRoomSnapshot');
  });

  it('extractGmCharacterSummary строит readonly-сводку со статами, ПП навыков, бронёй по зонам, оружием и патронами, не трогая useCharacterStore', () => {
    useCharacterStore.getState().resetCharacterStore();
    useCharacterStore.getState().setCharacterName('Локальный Герой Игрока');
    useCharacterStore.getState().setLevel(7);

    const snapshotPayload = {
      characterId: 'char_vault_1',
      name: 'Нейт',
      level: 6,
      originName: 'vaultDweller',
      updatedAt: Date.now(),
      avatarDataUrl: null,
      data: {
        schemaVersion: 22,
        characterName: 'Нейт',
        level: 6,
        origin: { id: 'vaultDweller' },
        caps: 140,
        currentHealth: 11,
        radiation: 2,
        luckPoints: 5,
        attributes: [
          { name: 'STR', value: 5 },
          { name: 'PER', value: 7 },
          { name: 'END', value: 6 },
          { name: 'CHA', value: 5 },
          { name: 'INT', value: 6 },
          { name: 'AGI', value: 8 },
          { name: 'LCK', value: 6 },
        ],
        skills: [
          { name: 'SMALL_GUNS', value: 3 },
          { name: 'MEDICINE', value: 2 },
        ],
        selectedSkills: ['SMALL_GUNS'],
        selectedPerks: [{ id: 'gunNut', rank: 2 }],
        equippedArmor: {
          head: { armor: null, clothing: null },
          body: {
            armor: { id: 'armor_leather_chest', physicalDamageRating: 1, energyDamageRating: 2, radiationDamageRating: 0, name: 'Кожаный нагрудник' },
            clothing: { id: 'cloth_vault_jumpsuit', physicalDamageRating: 0, energyDamageRating: 1, radiationDamageRating: 2, name: 'Комбинезон Убежища' },
          },
          leftArm: { armor: null, clothing: null },
          rightArm: { armor: null, clothing: null },
          leftLeg: { armor: null, clothing: null },
          rightLeg: { armor: null, clothing: null },
        },
        equippedWeapons: [
          { id: 'weapon_10mm_pistol', name: '10-мм пистолет', damage: 4, fireRate: 2, range: 'C', ammoId: 'ammo_10mm' },
        ],
        equipment: {
          items: [
            { id: 'weapon_10mm_pistol', name: '10-мм пистолет', weight: 2, quantity: 1, equipped: true },
            { id: 'ammo_10mm', type: 'ammo', name: '10-мм патроны', weight: 0, quantity: 24 },
            { id: 'chem_stimpak', itemType: 'chem', name: 'Стимулятор', weight: 0.5, quantity: 3 },
          ],
        },
      },
    };

    const summary = extractGmCharacterSummary(snapshotPayload, {
      locale: 'ru-RU',
      moduleLocale: 'ru-RU',
    });

    // Локальный characterStore остался полностью нетронутым!
    expect(useCharacterStore.getState().characterName).toBe('Локальный Герой Игрока');
    expect(useCharacterStore.getState().level).toBe(7);

    expect(summary.name).toBe('Нейт');
    expect(summary.level).toBe(6);
    // maxHealth = END(6) + LCK(6) + (6 - 1) = 17; с радиацией 2 потолок = 15
    expect(summary.vitals.maxHealth).toBe(17);
    expect(summary.vitals.effectiveMaxHealth).toBe(15);
    expect(summary.vitals.currentHealth).toBe(11);
    expect(summary.vitals.radiation).toBe(2);
    expect(summary.vitals.initiative).toBe(15); // PER 7 + AGI 8
    expect(summary.vitals.defense).toBe(1); // AGI 8 -> 1
    expect(summary.vitals.caps).toBe(140);

    const smallGuns = summary.skills.find((s) => s.key === 'SMALL_GUNS');
    expect(smallGuns.tagged).toBe(true);
    expect(smallGuns.rank).toBe(3);
    expect(smallGuns.tn).toBe(11); // AGI 8 + rank 3

    const torsoZone = summary.armorZones.find((z) => z.key === 'body');
    expect(torsoZone.phys).toBe(1);
    expect(torsoZone.energy).toBe(2);
    expect(torsoZone.rad).toBe(2);

    expect(summary.weapons).toHaveLength(1);
    expect(summary.weapons[0].ammoCount).toBe(24);
    expect(summary.perks).toHaveLength(1);
    expect(summary.perks[0].rank).toBe(2);

    // Сводка Робота (Мистер Помощник — иммунитеты к радиации/яду и зоны корпуса робота)
    const robotSummary = extractGmCharacterSummary({
      characterId: 'char_bot_1',
      name: 'Кодсворт',
      level: 4,
      data: {
        schemaVersion: 22,
        characterName: 'Кодсворт',
        level: 4,
        origin: { id: 'misterHandy' },
        equippedRobotSlots: {
          optics: { armor: { physicalDamageRating: 2, energyDamageRating: 1 } },
          body: { armor: { physicalDamageRating: 3, energyDamageRating: 2 } },
        },
      },
    }, { locale: 'ru-RU', moduleLocale: 'ru-RU' });
    expect(robotSummary.isRobot).toBe(true);
    expect(robotSummary.immunities.length).toBeGreaterThanOrEqual(2);
    expect(robotSummary.armorZones.length).toBeGreaterThanOrEqual(4);
  });

  it('команда Мастера «+1 уровень всем» доставляется онлайн-игроку сразу, а «уснувшему» телефону — при реконнекте ровно 1 раз с ack', async () => {
    serverInstance = createRoomServer({ port: 0, host: '127.0.0.1', distDir: '/nonexistent' });
    const { port } = await serverInstance.start();
    const wsUrl = `ws://127.0.0.1:${port}/ws`;
    process.env.EXPO_PUBLIC_ROOM_SERVER_URL = wsUrl;

    const gmMessages = [];
    const gmWs = createRoomClient({
      url: wsUrl,
      clientId: 'gm-master-481',
      onStatus: () => {},
      onMessage: (msg) => { gmMessages.push(msg); },
      webSocketFactory: createWsAdapter,
    });

    gmWs.send(ROOM_MESSAGE.ROOM_CREATE, { name: 'Кампания Пустоши', requestId: 'req-create' }, null);
    await waitUntil(() => gmMessages.some((m) => m.payload?.requestId === 'req-create'));
    const createdMsg = gmMessages.find((m) => m.payload?.requestId === 'req-create');
    const roomCode = createdMsg.payload.code;
    const ownerToken = createdMsg.payload.ownerToken;

    gmWs.send(ROOM_MESSAGE.ROOM_JOIN, {
      code: roomCode,
      name: 'GM',
      role: 'gm',
      ownerToken,
      requestId: 'req-gm-join',
    }, roomCode);
    await waitUntil(() => gmMessages.some((m) => m.payload?.requestId === 'req-gm-join'));

    useUiModeStore.setState({ tabUiMode: 'user', gmInspectingCharacter: false });

    useCharacterStore.getState().resetCharacterStore();
    useCharacterStore.setState({
      currentCharacterId: 'char_online_1',
      characterName: 'Пайпер',
      level: 2,
      currency: 30,
      attributesSaved: true,
      skillsSaved: true,
      isSaved: true,
    });
    await db.saveCharacter('char_online_1', 'Пайпер', 2, 'survivor', {
      characterName: 'Пайпер',
      level: 2,
      origin: { id: 'survivor' },
      caps: 30,
      attributesSaved: true,
      skillsSaved: true,
      attributes: [
        { name: 'STR', value: 5 }, { name: 'PER', value: 6 }, { name: 'END', value: 5 },
        { name: 'CHA', value: 7 }, { name: 'INT', value: 6 }, { name: 'AGI', value: 6 }, { name: 'LCK', value: 5 },
      ],
    });
    await db.setCharacterRoomBinding('char_online_1', roomCode);

    resetRoomClientForTests();
    setRoomClientFactoryForTests(({ url, onStatus, onMessage }) => (
      createRoomClient({
        url,
        clientId: 'player-device-1:t-p1',
        onStatus,
        onMessage,
        webSocketFactory: createWsAdapter,
      })
    ));
    useRoomStore.setState({ status: 'offline', rooms: {}, lastError: null });

    await useRoomStore.getState().joinRoom({ code: roomCode, name: 'Пайпер', role: 'player' });
    await useRoomStore.getState().publishCharacter({
      code: roomCode,
      characterId: 'char_online_1',
      revision: 1,
      snapshot: {
        characterId: 'char_online_1',
        name: 'Пайпер',
        level: 2,
        originName: 'survivor',
        updatedAt: Date.now(),
        avatarDataUrl: null,
        data: { characterName: 'Пайпер', level: 2, caps: 30 },
      },
    });

    // Второй игрок («спящий телефон») сначала зарегистрировал снапшот и отключился до команды Мастера
    const sleeperMsgs = [];
    const sleeperWs1 = createRoomClient({
      url: wsUrl,
      clientId: 'player-sleeper-2',
      onStatus: () => {},
      onMessage: (m) => { sleeperMsgs.push(m); },
      webSocketFactory: createWsAdapter,
    });
    sleeperWs1.send(ROOM_MESSAGE.ROOM_JOIN, { code: roomCode, name: 'Ник', role: 'player', requestId: 's-join-1' }, roomCode);
    await waitUntil(() => sleeperMsgs.some((m) => m.payload?.requestId === 's-join-1'));
    sleeperWs1.send(ROOM_MESSAGE.CHAR_PUBLISH, {
      characterId: 'char_sleeper_2',
      revision: 1,
      snapshot: {
        characterId: 'char_sleeper_2',
        name: 'Ник',
        level: 4,
        originName: 'synth',
        updatedAt: Date.now(),
        avatarDataUrl: null,
        data: { characterName: 'Ник', level: 4, origin: { id: 'synth' }, caps: 50 },
      },
    }, roomCode);
    await waitUntil(() => gmMessages.some((m) => m.type === ROOM_MESSAGE.CHAR_PUBLISH && m.payload?.characterId === 'char_sleeper_2'));
    sleeperWs1.close();

    // Попытка обычного игрока выпустить директиву отклоняется сервером (NOT_ROOM_OWNER)
    const rogueMsgs = [];
    const rogueWs = createRoomClient({
      url: wsUrl,
      clientId: 'rogue-player-99',
      onStatus: () => {},
      onMessage: (m) => { rogueMsgs.push(m); },
      webSocketFactory: createWsAdapter,
    });
    rogueWs.send(ROOM_MESSAGE.ROOM_JOIN, { code: roomCode, name: 'Читер', role: 'player', requestId: 'r-join' }, roomCode);
    await waitUntil(() => rogueMsgs.some((m) => m.payload?.requestId === 'r-join'));
    rogueWs.send(ROOM_MESSAGE.GM_DIRECTIVE, {
      code: roomCode,
      ownerToken: 'wrong-token',
      directiveId: 'dir_rogue_99',
      kind: GM_DIRECTIVE_KIND.CAPS_DELTA,
      amount: 9999,
      requestId: 'r-dir',
    }, roomCode);
    await waitUntil(() => rogueMsgs.some((m) => m.type === ROOM_MESSAGE.ERROR && m.payload?.requestId === 'r-dir'));
    expect(rogueMsgs.find((m) => m.type === ROOM_MESSAGE.ERROR && m.payload?.requestId === 'r-dir').payload.code).toBe('NOT_ROOM_OWNER');
    rogueWs.close();

    // Мастер отправляет команду «+1 уровень всем» с комментарием
    gmWs.send(ROOM_MESSAGE.GM_DIRECTIVE, {
      code: roomCode,
      ownerToken,
      directiveId: 'dir_lvlup_all_1',
      kind: GM_DIRECTIVE_KIND.LEVEL_GRANT,
      amount: 1,
      note: 'За спасение каравана',
      targetType: 'room',
      targetCharacterIds: ['char_online_1', 'char_sleeper_2'],
      requestId: 'req-dir-1',
    }, roomCode);

    await waitUntil(() => (useRoomStore.getState().rooms[roomCode]?.directives || []).length === 1);

    // 1. Онлайн-игрок (Пайпер) мгновенно применяет команду: ур. 2 -> 3, skillsSaved -> false, отправляет ack!
    const appliedOnline = await processPendingDirectivesForPlayer();
    expect(appliedOnline).toHaveLength(1);
    expect(useCharacterStore.getState().level).toBe(3);
    expect(useCharacterStore.getState().skillsSaved).toBe(false);
    expect(alertsLog.some((a) => String(a.message || '').includes('3') && String(a.message || '').includes('За спасение каравана'))).toBe(true);

    // Повторный вызов НЕ применяет команду второй раз (дедупликация!)
    const duplicateTry = await processPendingDirectivesForPlayer();
    expect(duplicateTry).toHaveLength(0);
    expect(useCharacterStore.getState().level).toBe(3);

    // У Мастера счётчик доставки стал 1/2 (Пайпер подтвердила, Ник ещё спит)
    await waitUntil(() => gmMessages.some(
      (m) => m.type === ROOM_MESSAGE.GM_DIRECTIVE_STATE
        && m.payload?.directive?.directiveId === 'dir_lvlup_all_1'
        && (m.payload?.directive?.ackedByCharacterIds || []).includes('char_online_1'),
    ));

    // 2. Теперь «просыпается» телефон второго игрока (Ника), причём лист Ника лежит в SQLite (не открыт в сторе)
    await db.setCharacterRoomBinding('char_online_1', null);
    await db.saveCharacter('char_sleeper_2', 'Ник', 4, 'synth', {
      characterName: 'Ник',
      level: 4,
      origin: { id: 'synth' },
      caps: 50,
      attributesSaved: true,
      skillsSaved: true,
      attributes: [
        { name: 'STR', value: 5 }, { name: 'PER', value: 7 }, { name: 'END', value: 5 },
        { name: 'CHA', value: 5 }, { name: 'INT', value: 8 }, { name: 'AGI', value: 6 }, { name: 'LCK', value: 4 },
      ],
    });
    await db.setCharacterRoomBinding('char_sleeper_2', roomCode);
    useCharacterStore.getState().resetCharacterStore(); // Ник сидит на главном экране, стор пуст

    resetRoomClientForTests();
    setRoomClientFactoryForTests(({ url, onStatus, onMessage }) => (
      createRoomClient({
        url,
        clientId: 'player-sleeper-2:reconnected',
        onStatus,
        onMessage,
        webSocketFactory: createWsAdapter,
      })
    ));
    useRoomStore.setState({ status: 'offline', rooms: {}, lastError: null });

    const joinRes = await useRoomStore.getState().joinRoom({ code: roomCode, name: 'Ник', role: 'player' });
    expect((joinRes.directives || []).some((d) => d.directiveId === 'dir_lvlup_all_1')).toBe(true);

    const appliedSleeper = await processPendingDirectivesForPlayer();
    expect(appliedSleeper).toHaveLength(1);

    const updatedNickRow = await db.loadCharacterById('char_sleeper_2');
    expect(updatedNickRow.level).toBe(5);
    expect(updatedNickRow.data.level).toBe(5);
    expect(updatedNickRow.data.skillsSaved).toBe(false);

    // И Мастер получает финальный статус доставки 2/2 И обновлённый снапшот Ника 5-го уровня!
    await waitUntil(() => gmMessages.some(
      (m) => m.type === ROOM_MESSAGE.GM_DIRECTIVE_STATE
        && m.payload?.directive?.directiveId === 'dir_lvlup_all_1'
        && (m.payload?.directive?.ackedByCharacterIds || []).length === 2,
    ));
    await waitUntil(() => gmMessages.some(
      (m) => m.type === ROOM_MESSAGE.CHAR_PUBLISH
        && m.payload?.characterId === 'char_sleeper_2'
        && m.payload?.snapshot?.level === 5,
    ));

    // 3. Проверка иммунитета к радиации у синта при адресной команде rad.adjust (+3 рад)
    gmWs.send(ROOM_MESSAGE.GM_DIRECTIVE, {
      code: roomCode,
      ownerToken,
      directiveId: 'dir_rad_synth_1',
      kind: GM_DIRECTIVE_KIND.RAD_ADJUST,
      amount: 3,
      targetType: 'character',
      targetCharacterId: 'char_sleeper_2',
      requestId: 'req-dir-rad',
    }, roomCode);

    await waitUntil(() => (useRoomStore.getState().rooms[roomCode]?.directives || []).some((d) => d.directiveId === 'dir_rad_synth_1'));
    await processPendingDirectivesForPlayer();

    const nickAfterRad = await db.loadCharacterById('char_sleeper_2');
    expect(nickAfterRad.data.radiation || 0).toBe(0);

    gmWs.close();
    resetRoomClientForTests();
  });
});
