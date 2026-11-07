// Патч 560 — «каждый персонаж видит свою трансляцию».
//
// Слово владельца: «Трансляция доступна только тому персонажу, за которого
// вошли. Если 2 персонажа в 2 серверных комнатах получают 2 трансляции, каждый
// персонаж видит свою… пока не войдёшь другим — ничего не увидишь. А сигнал о
// новой трансляции или эффекте — цвет иконки сервера».
//
// Здесь проверяем само поведение окна: два персонажа в двух комнатах, открыт
// один — видно только его трансляцию; и что просмотр гасит сигнал на карточке.
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { create, act } from 'react-test-renderer';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-native', () => {
  const React = require('react');
  const host = (name) => ({ children, ...props }) => React.createElement(name, props, children);
  return {
    Platform: { OS: 'web' },
    StyleSheet: {
      create: (styles) => styles,
      flatten: (styles) => (Array.isArray(styles) ? Object.assign({}, ...styles.filter(Boolean)) : styles || {}),
    },
    Modal: ({ visible, children, ...props }) => (visible ? React.createElement('Modal', props, children) : null),
    View: host('View'),
    Text: host('Text'),
    TextInput: host('TextInput'),
    TouchableOpacity: host('TouchableOpacity'),
    ScrollView: host('ScrollView'),
    Image: host('Image'),
    useWindowDimensions: () => ({ width: 420, height: 800 }),
  };
});

vi.mock('@expo/vector-icons', () => ({
  MaterialCommunityIcons: ({ name, ...props }) => React.createElement('MaterialCommunityIcons', { name, ...props }),
}));

vi.mock('../../db', () => ({
  getCharacterRoomBindings: vi.fn(async () => [
    { character_id: 'char_a', code: 'ROOM1' },
    { character_id: 'char_b', code: 'ROOM2' },
  ]),
  // Имена нужны оверлею: привязка без имени персонажа в списке не участвует.
  getCharactersList: vi.fn(async () => [
    { id: 'char_a', name: 'Пайпер' },
    { id: 'char_b', name: 'Ник' },
  ]),
}));

vi.mock('../../components/alerts/alertService', () => ({ showRawAlert: vi.fn() }));
vi.mock('../../src/saves/characterSaves', () => ({
  loadCharacter: vi.fn(async () => true),
  saveCharacter: vi.fn(async () => true),
}));
vi.mock('../../src/lootTrade/grantCharacterItems', () => ({
  applyCommittedMerchantTradeToCharacter: vi.fn(),
  getSellablePlayerInventoryItems: vi.fn(() => []),
  grantLootEntriesToCharacter: vi.fn(),
}));
vi.mock('../../modules/fallout/assets/backgrounds/caps.png', () => ({ default: 'caps.png' }));
vi.mock('../../assets/CD.png', () => ({ default: 'cd.png' }));
vi.mock('../../components/lootTrade/LockPickingModal', () => ({
  default: () => React.createElement('LockPickingModal', { mock: true }),
}));
vi.mock('../../components/lootTrade/TerminalHackingModal', () => ({
  default: () => React.createElement('TerminalHackingModal', { mock: true }),
}));
vi.mock('../../components/lootTrade/StandaloneCheckModal', () => ({
  default: () => React.createElement('StandaloneCheckModal', { mock: true }),
}));
vi.mock('../../i18n/locale', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useLocale: () => 'ru-RU',
    getCurrentLocale: () => 'ru-RU',
    useModuleLocale: () => 'ru-RU',
  };
});

const { default: PlayerLootTradeOverlay } = await import('../../components/lootTrade/PlayerLootTradeOverlay');
const { default: useCharacterStore } = await import('../../src/store/characterStore');
const { default: useRoomStore } = await import('../../src/room/roomStore');
const { default: useUiModeStore } = await import('../../src/room/uiModeStore');
const { default: usePlayerFocusStore } = await import('../../src/room/playerFocusStore');
const transmissionSeen = await import('../../src/room/transmissionSeenStore');
const useTransmissionSeenStore = transmissionSeen.default;
const { hasUnseenTransmission, sessionTargetsCharacter } = transmissionSeen;

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

const session = (id, name, nodeName) => ({
  sessionId: id,
  containerId: `${id}-root`,
  kind: 'hub',
  name,
  targetType: 'character',
  targetCharacterId: id === 'sess-a' ? 'char_a' : 'char_b',
  nodes: [
    {
      containerId: `${id}-node`,
      kind: 'loot',
      name: nodeName,
      parentIds: [`${id}-root`],
      childIds: [],
      items: [],
    },
  ],
});

const SESSION_A = session('sess-a', 'Убежище Пайпер', 'Дом у дороги');
const SESSION_B = session('sess-b', 'Склад Ника', 'Ящик в подвале');

const mount = async ({ currentCharacterId, homeFocused = false, rooms }) => {
  useUiModeStore.setState({ tabUiMode: 'user', gmInspectingCharacter: false });
  usePlayerFocusStore.setState({ homeFocused });
  useCharacterStore.setState({ currentCharacterId, characterName: 'Кто-то', items: {}, currency: 0 });
  useRoomStore.setState({
    clientId: 'player-client',
    status: 'online',
    rooms,
  });
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(PlayerLootTradeOverlay));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return renderer;
};

const allText = (renderer) => {
  const out = [];
  const walk = (node) => {
    if (!node) return;
    if (typeof node === 'string') { out.push(node); return; }
    if (Array.isArray(node)) { node.forEach(walk); return; }
    walk(node.children);
  };
  walk(renderer.toJSON());
  return out.join(' ');
};

const room = (sessionPayload) => ({
  joined: true,
  members: [{ clientId: 'player-client', role: 'player' }],
  capabilities: { terminalHacking: true, lockPicking: true },
  activeSession: sessionPayload,
  terminalStates: {},
});

describe('Патч 560: трансляция — только тому персонажу, за которого вошли', () => {
  beforeEach(async () => {
    await useTransmissionSeenStore.getState().resetForTests();
    usePlayerFocusStore.getState().resetForTests();
  });

  it('персонаж A видит свою трансляцию и не видит трансляцию персонажа B', async () => {
    const renderer = await mount({
      currentCharacterId: 'char_a',
      rooms: { ROOM1: room(SESSION_A), ROOM2: room(SESSION_B) },
    });
    const text = allText(renderer);
    expect(text).toContain('Дом у дороги');
    expect(text).not.toContain('Ящик в подвале');
  });

  it('персонаж B видит свою и не видит чужую', async () => {
    const renderer = await mount({
      currentCharacterId: 'char_b',
      rooms: { ROOM1: room(SESSION_A), ROOM2: room(SESSION_B) },
    });
    const text = allText(renderer);
    expect(text).toContain('Ящик в подвале');
    expect(text).not.toContain('Дом у дороги');
  });

  it('на списке персонажей плашки нет вовсе', async () => {
    const renderer = await mount({
      currentCharacterId: 'char_a',
      homeFocused: true,
      rooms: { ROOM1: room(SESSION_A), ROOM2: room(SESSION_B) },
    });
    const text = allText(renderer);
    expect(text).not.toContain('Дом у дороги');
    expect(text).not.toContain('Ящик в подвале');
  });

  it('просмотр своей трансляции гасит сигнал на карточке этого персонажа', async () => {
    const store = useTransmissionSeenStore.getState();
    expect(hasUnseenTransmission(store.seen, room(SESSION_A), 'char_a')).toBe(true);
    expect(hasUnseenTransmission(store.seen, room(SESSION_A), 'char_b')).toBe(false);

    await mount({
      currentCharacterId: 'char_a',
      rooms: { ROOM1: room(SESSION_A), ROOM2: room(SESSION_B) },
    });

    const seen = useTransmissionSeenStore.getState().seen;
    expect(seen.char_a).toBe('sess-a');
    // Чужая трансляция так и остаётся непросмотренной — персонаж B её ещё не видел.
    expect(hasUnseenTransmission(seen, room(SESSION_B), 'char_b')).toBe(true);
    expect(hasUnseenTransmission(seen, room(SESSION_A), 'char_a')).toBe(false);
  });

  it('адресат сессии: комната целиком или конкретный персонаж', () => {
    expect(sessionTargetsCharacter({ targetType: 'room' }, 'char_a')).toBe(true);
    expect(sessionTargetsCharacter({ targetType: 'character', targetCharacterId: 'char_a' }, 'char_a')).toBe(true);
    expect(sessionTargetsCharacter({ targetType: 'character', targetCharacterId: 'char_b' }, 'char_a')).toBe(false);
    expect(sessionTargetsCharacter(null, 'char_a')).toBe(false);
  });

  it('карточка в списке сигналит синёй иконкой и на трансляцию, и на эффект', () => {
    const homeSrc = read('components/screens/HomeScreen/HomeScreen.js');
    expect(homeSrc).toContain('hasUnseenTransmission(seenTransmissions, roomRooms[boundCode], item.id)');
    expect(homeSrc).toContain('const signalCount = unreadNoticeCountFor(notices, item.id) + (hasUnseen ? 1 : 0);');
    expect(homeSrc).toContain('noticesCount={signalCount}');
    expect(homeSrc).toContain(
      "const serverIconColor = hasNotices ? '#3b82f6' : (serverOnline ? '#16a34a' : '#9ca3af');",
    );
  });

  it('окно локации не менялось: отбор сессии по адресату прежний', () => {
    const overlaySrc = read('components/lootTrade/PlayerLootTradeOverlay.js');
    expect(overlaySrc).toContain("if (session.targetType === 'room' || session.targetCharacterId === bind.characterId)");
    expect(overlaySrc).toContain('return bindings.filter((bind) => bind.characterId === currentCharacterId);');
    expect(overlaySrc).toContain('useTransmissionSeenStore.getState().markSeen(');
  });
});
