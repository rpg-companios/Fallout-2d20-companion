// Патч 544: локация не сундук, замок не терминал, вложенность не плоская.
// 1) Маркер пространственного узла переживает старый сервер комнат.
// 2) Сервер не даёт забрать добычу/торговать за запертым родителем.
// 3) Окно игрока: локация → экран замка → сундук → содержимое.
import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { create, act } from 'react-test-renderer';
import {
  CONTAINER_KIND,
  buildLocationSessionNodes,
  normalizeContainerEntity,
} from '../../domain/lootTrade.js';
import {
  restoreLocationSessionNodes,
  decodeLocationNodeMarker,
} from '../../domain/locationNodeMarker.js';
import { nodeHasChildren } from '../../components/lootTrade/hackOutcome.js';
import {
  normalizeActiveSession,
  sanitizeSessionForMember,
  applyAtomicLootTake,
  applyAtomicTradeCommit,
  applySessionUnlock,
} from '../../server/lootTradeSession.js';

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

/** Белый список полей старого сервера: kind понижается, граф выбрасывается. */
const legacyServerNode = (node) => ({
  containerId: node.containerId,
  kind: 'loot',
  name: node.name,
  description: node.description,
  locked: Boolean(node.locked),
  lockLabel: String(node.lockLabel || '').trim(),
  caps: 0,
  saleMarkupPercent: 0,
  buyDepreciationPercent: 50,
  characterOverrides: {},
  items: [],
});

const cards = () => [
  normalizeContainerEntity({
    id: 'vault', kind: CONTAINER_KIND.HUB, name: 'Убежище',
    links: [{ containerId: 'house', locked: false }],
  }),
  normalizeContainerEntity({
    id: 'house', kind: CONTAINER_KIND.HUB, name: 'Дом мэра',
    parentLocationId: 'vault',
    links: [{ containerId: 'chest', locked: false }],
    linkedCheckIds: ['lock-door'],
  }),
  normalizeContainerEntity({
    id: 'chest', kind: CONTAINER_KIND.LOOT, name: 'Сундук в доме',
    items: [{ entryId: 'e1', itemType: 'misc', name: 'Крышки', quantity: 3 }],
  }),
  normalizeContainerEntity({ id: 'lock-door', kind: CONTAINER_KIND.LOCK, name: 'Замок двери', difficulty: 2 }),
];

describe('544: маркер локации переживает старый сервер', () => {
  it('kind=hub и рёбра графа восстанавливаются из lockLabel', () => {
    const all = cards();
    // Мастер запер дом: узел houses несёт требование и детей.
    all[1] = { ...all[1], locked: true };
    const nodes = buildLocationSessionNodes(all[0], all);
    const house = nodes.find((n) => n.containerId === 'house');
    expect(house.kind).toBe(CONTAINER_KIND.HUB);
    expect(decodeLocationNodeMarker(house.lockLabel)).toBeTruthy();

    const stale = nodes.map(legacyServerNode);
    const restored = restoreLocationSessionNodes(stale, 'vault');
    const restoredHouse = restored.find((n) => n.containerId === 'house');
    const restoredChest = restored.find((n) => n.containerId === 'chest');
    expect(restoredHouse.kind).toBe(CONTAINER_KIND.HUB);
    expect(nodeHasChildren(restoredHouse)).toBe(true);
    expect(restoredHouse.childIds).toContain('chest');
    expect(restoredChest.parentIds).toContain('house');
    // Замок-преграда не становится самостоятельной строкой игрока.
    expect(restored.some((n) => n.containerId === 'lock-door' && !n.hiddenForPlayers)).toBe(false);
  });

  it('пустая локация всё равно локация, а не пустой сундук', () => {
    expect(nodeHasChildren({ kind: CONTAINER_KIND.HUB, childIds: [] })).toBe(true);
    expect(nodeHasChildren({ kind: CONTAINER_KIND.LOOT, childIds: [] })).toBe(false);
  });
});

describe('544: серверная граница за запертым родителем', () => {
  const session = () => normalizeActiveSession({
    sessionId: 's544', containerId: 'vault', kind: 'hub', name: 'Убежище', targetType: 'room',
    nodes: [
      {
        containerId: 'house', kind: 'hub', name: 'Дом мэра', locked: true,
        parentIds: ['vault'], childIds: ['chest', 'shop'],
      },
      {
        containerId: 'chest', kind: 'loot', name: 'Сундук', parentIds: ['house'], childIds: [],
        items: [{ entryId: 'e1', itemType: 'misc', name: 'Крышки', quantity: 3 }],
      },
      {
        containerId: 'shop', kind: 'merchant', name: 'Торговец', parentIds: ['house'], childIds: [],
        caps: 100, items: [{ entryId: 'e2', itemType: 'misc', name: 'Патроны', quantity: 2, cost: 5 }],
      },
    ],
  }, 1000);

  it('игрок не видит детей запертой локации, Мастер видит', () => {
    const s = session();
    const player = sanitizeSessionForMember(s, { isGm: false });
    expect(player.nodes.map((n) => n.containerId)).toEqual(['house']);
    expect(sanitizeSessionForMember(s, { isGm: true }).nodes).toHaveLength(3);
  });

  it('прямой WS-запрос добычи за запертым родителем отклоняется', () => {
    const s = session();
    const denied = applyAtomicLootTake(s, {
      sessionId: 's544', characterId: 'p1', nodeContainerId: 'chest',
      takes: [{ entryId: 'e1', quantity: 1 }],
    }, 2000);
    expect(denied.error).toBe('CONTAINER_LOCKED');
    const opened = applySessionUnlock(s, 'house').session;
    const allowed = applyAtomicLootTake(opened, {
      sessionId: 's544', characterId: 'p1', nodeContainerId: 'chest',
      takes: [{ entryId: 'e1', quantity: 1 }],
    }, 3000);
    expect(allowed.error).toBeUndefined();
    expect(allowed.granted).toHaveLength(1);
  });

  it('сделка с торговцем за запертым родителем тоже отклоняется', () => {
    const s = session();
    const denied = applyAtomicTradeCommit(s, {
      sessionId: 's544', characterId: 'p1', nodeContainerId: 'shop',
      buyItems: [{ entryId: 'e2', quantity: 1 }], playerCapsAvailable: 100,
    }, 2000);
    expect(denied.error).toBe('CONTAINER_LOCKED');
  });
});

const uiSession = () => ({
  sessionId: 'ui-544', containerId: 'vault', kind: 'hub', name: 'Убежище', targetType: 'room',
  nodes: [
    {
      containerId: 'house', kind: 'hub', name: 'Дом мэра', locked: true,
      linkedCheckIds: ['lock-door'], parentIds: ['vault'], childIds: ['chest'], items: [],
    },
    {
      containerId: 'chest', kind: 'loot', name: 'Сундук в доме',
      parentIds: ['house'], childIds: [],
      items: [{ entryId: 'e1', itemType: 'misc', name: 'Крышки', quantity: 3 }],
    },
    {
      containerId: 'lock-door', kind: 'lock', name: 'Замок двери', difficulty: 2,
      parentIds: ['vault'], childIds: [], hiddenForPlayers: true,
    },
  ],
});

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
        terminalStates: {
          'lock-door': {
            containerId: 'lock-door',
            config: { containerId: 'lock-door', kind: 'lock', name: 'Замок двери', difficulty: 2 },
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
const iconNames = (renderer) => renderer.root.findAllByType('MaterialCommunityIcons').map((n) => n.props.name);

describe('544: окно игрока — локация, замок, сундук, содержимое', () => {
  it('на корне локация с иконкой карты, сундук внутри не виден', async () => {
    const renderer = await mount(uiSession());
    expect(allText(renderer)).toContain('Дом мэра');
    expect(allText(renderer)).not.toContain('Сундук в доме');
    expect(iconNames(renderer)).toContain('map-marker-multiple');
    expect(iconNames(renderer)).not.toContain('treasure-chest');
    await act(async () => renderer.unmount());
  });

  it('вход в запертую локацию показывает замок, а не терминал и не сундук', async () => {
    const renderer = await mount(uiSession());
    await tap(renderer, 'hub-node-enter-house');
    expect(renderer.root.findAllByProps({ testID: 'current-gate-option-lock-door' }).length).toBeGreaterThan(0);
    expect(allText(renderer)).not.toContain('Сундук в доме');
    await tap(renderer, 'current-gate-hack-lock-door');
    expect(renderer.root.findByType('LockPickingModal').props.containerId).toBe('lock-door');
    expect(renderer.root.findAllByType('TerminalHackingModal')).toHaveLength(0);
    await act(async () => renderer.unmount());
  });

  it('после победы виден сундук, содержимое — только после открытия сундука', async () => {
    const renderer = await mount(uiSession());
    await tap(renderer, 'hub-node-enter-house');
    await act(async () => {
      useRoomStore.setState((state) => ({
        rooms: {
          ...state.rooms,
          ROOM1: {
            ...state.rooms.ROOM1,
            activeSession: {
              ...state.rooms.ROOM1.activeSession,
              nodes: state.rooms.ROOM1.activeSession.nodes.map((n) => (
                n.containerId === 'house' ? { ...n, locked: false } : n
              )),
            },
            terminalStates: {
              ...state.rooms.ROOM1.terminalStates,
              'lock-door': { ...state.rooms.ROOM1.terminalStates['lock-door'], game: { status: 'won' } },
            },
          },
        },
      }));
      await Promise.resolve();
    });
    expect(allText(renderer)).toContain('Сундук в доме');
    expect(allText(renderer)).not.toContain('Контейнер пуст');
    await tap(renderer, 'hub-node-enter-chest');
    // Содержимое сундука открылось: есть кнопки взятия, а не «всё разобрали».
    expect(allText(renderer)).toMatch(/Take 1|Взять 1/);
    expect(allText(renderer)).not.toMatch(/empty|разобрали/i);
    await act(async () => renderer.unmount());
  });
});
