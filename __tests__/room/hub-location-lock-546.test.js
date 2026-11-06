// Патч 546: замок на локации — преграда входа, а не просто бейдж Мастера.
// Сценарий владельца: «Подвал доктора» заперт «Запертым люком», внутри
// торговец «Безумный доктор»; «Тапхаус» заперт «Запертой дверью». Игрок не
// должен входить, видеть содержимое, лутать или торговать до взлома — ни в
// окне, ни прямым WS-запросом. Страховка работает и со старым сервером,
// который потерял флаг locked, но сохранил маркер требования.
import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { create, act } from 'react-test-renderer';
import {
  CONTAINER_KIND,
  buildLocationSessionNodes,
  normalizeContainerEntity,
} from '../../domain/lootTrade.js';
import {
  accessBarrierPending,
  hasAccessChecks,
  isAccessStateOpen,
  makeCheckToken,
  makeOpToken,
} from '../../server/accessExpression.js';
import {
  normalizeActiveSession,
  applyKeyAccessToSession,
  sanitizeSessionForMember,
  applyAtomicLootTake,
  applyAtomicTradeCommit,
} from '../../server/lootTradeSession.js';
import { resolveKeyAccess } from '../../server/keyAccess.js';

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
  getCharacterRoomBindings: vi.fn(async () => [{ character_id: 'player-char', code: 'ROOM1' }]),
  getCharactersList: vi.fn(async () => [{ id: 'player-char', name: 'Player' }]),
}));
vi.mock('../../components/alerts/alertService', () => ({ showRawAlert: vi.fn() }));
vi.mock('../../src/saves/characterSaves', () => ({ loadCharacter: vi.fn(async () => true) }));
vi.mock('../../src/lootTrade/grantCharacterItems', () => ({
  applyCommittedMerchantTradeToCharacter: vi.fn(),
  getSellablePlayerInventoryItems: vi.fn(() => []),
  grantLootEntriesToCharacter: vi.fn(),
}));
vi.mock('../../modules/fallout/assets/backgrounds/caps.png', () => ({ default: 'caps.png' }));
vi.mock('../../assets/CD.png', () => ({ default: 'cd.png' }));
vi.mock('../../components/lootTrade/LockPickingModal', () => ({
  default: ({ lock, visible, autoStart }) => React.createElement('LockPickingModal', {
    containerId: lock?.containerId, visible, autoStart,
  }),
}));
vi.mock('../../components/lootTrade/TerminalHackingModal', () => ({
  default: ({ terminal, visible, autoStart }) => React.createElement('TerminalHackingModal', {
    containerId: terminal?.containerId, visible, autoStart,
  }),
}));
vi.mock('../../components/lootTrade/StandaloneCheckModal', () => ({
  default: ({ visible }) => React.createElement('StandaloneCheckModal', { visible }),
}));

import PlayerLootTradeOverlay from '../../components/lootTrade/PlayerLootTradeOverlay.js';
import useCharacterStore from '../../src/store/characterStore.js';
import useRoomStore from '../../src/room/roomStore.js';
import useUiModeStore from '../../src/room/uiModeStore.js';

describe('546: единый предикат преграды', () => {
  it('нет проверки — нет преграды; есть непройденная проверка — преграда', () => {
    expect(accessBarrierPending({ kind: 'hub' })).toBe(false);
    expect(accessBarrierPending({ kind: 'hub', linkedCheckIds: ['hatch'] })).toBe(true);
    expect(accessBarrierPending({ kind: 'hub', accessExpression: [makeCheckToken('hatch')] })).toBe(true);
    expect(hasAccessChecks({ linkedCheckIds: ['hatch'] })).toBe(true);
    expect(isAccessStateOpen('open')).toBe(true);
    expect(isAccessStateOpen('none')).toBe(false);
  });

  it('явное решение сервера важнее голого требования', () => {
    const gate = { linkedCheckIds: ['hatch'] };
    expect(accessBarrierPending({ ...gate, keyAccessState: 'open' })).toBe(false);
    expect(accessBarrierPending({ ...gate, keyAccessState: 'open-by-key' })).toBe(false);
    expect(accessBarrierPending({ ...gate, keyAccessState: 'needs-check' })).toBe(true);
    expect(accessBarrierPending({ ...gate, keyAccessState: 'denied' })).toBe(true);
    expect(accessBarrierPending({ ...gate, keyUnlocked: true })).toBe(false);
    expect(accessBarrierPending({ ...gate, locked: true })).toBe(true);
    expect(accessBarrierPending({ ...gate, passageBlocked: true })).toBe(true);
  });

  it('И/ИЛИ вычисляется по пройденным источникам', () => {
    const expr = [makeCheckToken('a'), makeOpToken('+'), makeCheckToken('b'), makeOpToken('/'), makeCheckToken('c')];
    const node = { accessExpression: expr };
    expect(accessBarrierPending(node, { isPassed: (id) => id === 'a' })).toBe(true);
    expect(accessBarrierPending(node, { isPassed: (id) => id === 'a' || id === 'b' })).toBe(false);
    expect(accessBarrierPending(node, { isPassed: (id) => id === 'c' })).toBe(false);
    expect(accessBarrierPending(node, { isPassed: () => false })).toBe(true);
  });
});

const cards = () => [
  normalizeContainerEntity({
    id: 'diamond', kind: CONTAINER_KIND.HUB, name: 'Даймонд-сити',
    links: [
      { containerId: 'basement', locked: false },
      { containerId: 'piper', locked: false },
      { containerId: 'tap', locked: false },
    ],
  }),
  normalizeContainerEntity({
    id: 'basement', kind: CONTAINER_KIND.HUB, name: 'Подвал доктора',
    parentLocationId: 'diamond',
    accessExpression: [makeCheckToken('hatch')],
    linkedCheckIds: ['hatch'],
    links: [
      { containerId: 'doctor', locked: false },
      { containerId: 'basement-chest', locked: false },
      { containerId: 'hatch', locked: false },
    ],
  }),
  normalizeContainerEntity({
    id: 'doctor', kind: CONTAINER_KIND.MERCHANT, name: 'Безумный доктор',
    caps: 500,
    items: [{ entryId: 'med1', itemType: 'chem', name: 'Стимулятор', quantity: 5, cost: 10 }],
  }),
  normalizeContainerEntity({
    id: 'basement-chest', kind: CONTAINER_KIND.LOOT, name: 'Ящик подвала',
    items: [{ entryId: 'loot1', itemType: 'misc', name: 'Крышки', quantity: 3 }],
  }),
  normalizeContainerEntity({ id: 'hatch', kind: CONTAINER_KIND.LOCK, name: 'Запертый люк', difficulty: 2 }),
  normalizeContainerEntity({
    id: 'piper', kind: CONTAINER_KIND.HUB, name: 'Дом Пайпер', parentLocationId: 'diamond',
    links: [{ containerId: 'piper-chest', locked: false }],
  }),
  normalizeContainerEntity({
    id: 'piper-chest', kind: CONTAINER_KIND.LOOT, name: 'Сундук Пайпер',
    items: [{ entryId: 'loot2', itemType: 'misc', name: 'Записка', quantity: 1 }],
  }),
  normalizeContainerEntity({
    id: 'tap', kind: CONTAINER_KIND.HUB, name: 'Тапхаус',
    parentLocationId: 'diamond',
    accessExpression: [makeCheckToken('door')],
    linkedCheckIds: ['door'],
    links: [
      { containerId: 'tap-chest', locked: false },
      { containerId: 'door', locked: false },
    ],
  }),
  normalizeContainerEntity({
    id: 'tap-chest', kind: CONTAINER_KIND.LOOT, name: 'Касса тапхауса',
    items: [{ entryId: 'loot3', itemType: 'misc', name: 'Крышки', quantity: 7 }],
  }),
  normalizeContainerEntity({ id: 'door', kind: CONTAINER_KIND.LOCK, name: 'Запертая дверь', difficulty: 3 }),
];

const ownerSession = () => {
  const all = cards();
  const root = all.find((c) => c.id === 'diamond');
  return normalizeActiveSession({
    sessionId: 's546', containerId: 'diamond', kind: 'hub', name: 'Даймонд-сити',
    targetType: 'room', nodes: buildLocationSessionNodes(root, all),
  }, 1000);
};
const resolveWith = (passed = {}) => (requirement) => resolveKeyAccess(requirement, {
  storage: { entries: [] }, terminalStates: {}, accessEvents: passed,
});

describe('546: сервер держит границу локации с замком', () => {
  it('без взлома игрок не видит содержимое запертых локаций', () => {
    const keyed = applyKeyAccessToSession(ownerSession(), resolveWith());
    expect(keyed.nodes.find((n) => n.containerId === 'basement').locked).toBe(true);
    expect(keyed.nodes.find((n) => n.containerId === 'basement').keyAccessState).toBe('needs-check');
    expect(keyed.nodes.find((n) => n.containerId === 'tap').locked).toBe(true);
    const member = sanitizeSessionForMember(keyed, { isGm: false });
    const ids = member.nodes.map((n) => n.containerId);
    expect(ids).toContain('basement');
    expect(ids).toContain('piper');
    expect(ids).toContain('tap');
    expect(ids).not.toContain('doctor');
    expect(ids).not.toContain('basement-chest');
    expect(ids).not.toContain('tap-chest');
  });

  it('прямой WS-лут и торговля за замком отклоняются', () => {
    const keyed = applyKeyAccessToSession(ownerSession(), resolveWith());
    const loot = applyAtomicLootTake(keyed, {
      sessionId: 's546', characterId: 'p1', nodeContainerId: 'basement-chest',
      takes: [{ entryId: 'loot1', quantity: 1 }],
    }, 2000);
    expect(loot.error).toBe('CONTAINER_LOCKED');
    const trade = applyAtomicTradeCommit(keyed, {
      sessionId: 's546', characterId: 'p1', nodeContainerId: 'doctor',
      buyItems: [{ entryId: 'med1', quantity: 1 }], playerCapsAvailable: 1000,
    }, 2000);
    expect(trade.error).toBe('CONTAINER_LOCKED');
  });

  it('взлом люка открывает подвал: содержимое, лут и торговля доступны', () => {
    const keyed = applyKeyAccessToSession(ownerSession(), resolveWith({ hatch: { containerId: 'hatch' } }));
    expect(keyed.nodes.find((n) => n.containerId === 'basement').locked).toBe(false);
    expect(keyed.nodes.find((n) => n.containerId === 'basement').keyAccessState).toBe('open');
    // Тапхаус всё ещё заперт своей дверью — адресность сохраняется.
    expect(keyed.nodes.find((n) => n.containerId === 'tap').locked).toBe(true);
    const member = sanitizeSessionForMember(keyed, { isGm: false });
    expect(member.nodes.map((n) => n.containerId)).toContain('doctor');
    const loot = applyAtomicLootTake(keyed, {
      sessionId: 's546', characterId: 'p1', nodeContainerId: 'basement-chest',
      takes: [{ entryId: 'loot1', quantity: 1 }],
    }, 2000);
    expect(loot.error).toBeUndefined();
    expect(loot.granted).toHaveLength(1);
    const trade = applyAtomicTradeCommit(keyed, {
      sessionId: 's546', characterId: 'p1', nodeContainerId: 'doctor',
      buyItems: [{ entryId: 'med1', quantity: 1 }], playerCapsAvailable: 1000,
    }, 2000);
    expect(trade.error).toBeUndefined();
    expect(trade.committed.boughtEntries).toHaveLength(1);
  });

  it('непройденная проверка держит границу даже без флага locked', () => {
    // Сессия не пересчитана (старый путь/ручной снимок): флаг потерян,
    // требование на месте — содержимое всё равно не уходит игроку.
    const raw = ownerSession();
    const stripped = {
      ...raw,
      nodes: raw.nodes.map((n) => ({ ...n, locked: false, keyAccessState: 'none' })),
    };
    const member = sanitizeSessionForMember(stripped, { isGm: false });
    expect(member.nodes.map((n) => n.containerId)).not.toContain('doctor');
    const loot = applyAtomicLootTake(stripped, {
      sessionId: 's546', characterId: 'p1', nodeContainerId: 'basement-chest',
      takes: [{ entryId: 'loot1', quantity: 1 }],
    }, 2000);
    expect(loot.error).toBe('CONTAINER_LOCKED');
  });
});

/** Старый сервер: kind понижён, locked/keyAccessState потеряны, маркер жив. */
const legacyServerNode = (node) => ({
  containerId: node.containerId,
  kind: 'loot',
  name: node.name,
  description: node.description,
  locked: false,
  lockLabel: String(node.lockLabel || '').trim(),
  caps: node.caps || 0,
  saleMarkupPercent: 0,
  buyDepreciationPercent: 50,
  characterOverrides: {},
  items: node.items || [],
});

const legacySession = () => {
  const all = cards();
  const root = all.find((c) => c.id === 'diamond');
  const nodes = buildLocationSessionNodes(root, all).map(legacyServerNode);
  return {
    sessionId: 'ui-546', containerId: 'diamond', kind: 'hub', name: 'Даймонд-сити',
    targetType: 'room', nodes,
  };
};

const mount = async (activeSession) => {
  useUiModeStore.setState({ tabUiMode: 'user', gmInspectingCharacter: false });
  useCharacterStore.setState({ currentCharacterId: 'player-char', characterName: 'Player', items: {}, currency: 0 });
  useRoomStore.setState({
    clientId: 'player-client', status: 'online',
    rooms: {
      ROOM1: {
        joined: true,
        members: [{ clientId: 'player-client', role: 'player' }],
        capabilities: { terminalHacking: true, lockPicking: true },
        activeSession,
        accessEvents: {},
        terminalStates: {
          hatch: {
            containerId: 'hatch',
            config: { containerId: 'hatch', kind: 'lock', name: 'Запертый люк', difficulty: 2 },
            game: null, closed: false, locked: false,
          },
          door: {
            containerId: 'door',
            config: { containerId: 'door', kind: 'lock', name: 'Запертая дверь', difficulty: 3 },
            game: null, closed: false, locked: false,
          },
        },
      },
    },
  });
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(PlayerLootTradeOverlay));
    await Promise.resolve();
  });
  return renderer;
};
const tap = async (renderer, testID) => {
  const [button] = renderer.root.findAllByType('TouchableOpacity').filter((n) => n.props.testID === testID);
  expect(button, testID).toBeTruthy();
  await act(async () => { button.props.onPress(); await Promise.resolve(); });
};
const allText = (renderer) => renderer.root.findAllByType('Text').map((n) => String(n.props.children ?? '')).join(' | ');

describe('546: окно игрока со старым сервером — замок не обходится', () => {
  it('вход в Подвал доктора показывает люк, а не торговца и не ящик', async () => {
    const renderer = await mount(legacySession());
    expect(allText(renderer)).toContain('Подвал доктора');
    expect(allText(renderer)).not.toContain('Безумный доктор');
    await tap(renderer, 'hub-node-enter-basement');
    expect(renderer.root.findAllByProps({ testID: 'current-gate-hack-hatch' }).length).toBeGreaterThan(0);
    expect(allText(renderer)).not.toContain('Безумный доктор');
    expect(allText(renderer)).not.toContain('Ящик подвала');
    await tap(renderer, 'current-gate-hack-hatch');
    expect(renderer.root.findByType('LockPickingModal').props.containerId).toBe('hatch');
    await act(async () => renderer.unmount());
  });

  it('после победы люка торговец и ящик становятся доступны', async () => {
    const renderer = await mount(legacySession());
    await tap(renderer, 'hub-node-enter-basement');
    await act(async () => {
      useRoomStore.setState((state) => ({
        rooms: {
          ...state.rooms,
          ROOM1: {
            ...state.rooms.ROOM1,
            terminalStates: {
              ...state.rooms.ROOM1.terminalStates,
              hatch: { ...state.rooms.ROOM1.terminalStates.hatch, game: { status: 'won' } },
            },
          },
        },
      }));
      await Promise.resolve();
    });
    expect(allText(renderer)).toContain('Безумный доктор');
    expect(allText(renderer)).toContain('Ящик подвала');
    await tap(renderer, 'hub-node-enter-basement-chest');
    expect(allText(renderer)).toMatch(/Take 1|Взять 1/);
    await act(async () => renderer.unmount());
  });

  it('Тапхаус заперт своей дверью независимо от подвала', async () => {
    const renderer = await mount(legacySession());
    await tap(renderer, 'hub-node-enter-tap');
    expect(renderer.root.findAllByProps({ testID: 'current-gate-hack-door' }).length).toBeGreaterThan(0);
    expect(allText(renderer)).not.toContain('Касса тапхауса');
    await act(async () => renderer.unmount());
  });
});
