// ПРИЁМОЧНЫЙ (патч 545): удалить при конверсии/приживании.
// Патч 545: перетаскивание меняет порядок позиций в дереве Мастера, и этот
// порядок один-в-один воспроизводится в окне игрока. Канон порядка —
// `childOrder` родителя + `server/locationGraph.js`; сессия несёт его в
// `childIds`, маркер 544 сохраняет рёбра/порядок через старый сервер.
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { create, act } from 'react-test-renderer';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mockLayout = vi.hoisted(() => ({ bounds: {} }));

vi.mock('react-native', () => {
  const React = require('react');
  const host = (name) => ({ children, ...props }) => React.createElement(name, props, children);
  const View = React.forwardRef(({ children, ...props }, ref) => {
    React.useImperativeHandle(ref, () => ({
      measureInWindow: (cb) => {
        const b = mockLayout.bounds[props.testID] || { x: 0, y: 0, width: 200, height: 24 };
        cb(b.x, b.y, b.width, b.height);
      },
    }));
    return React.createElement('View', props, children);
  });
  return {
    Platform: { OS: 'web' },
    StyleSheet: {
      create: (styles) => styles,
      flatten: (styles) => (Array.isArray(styles) ? Object.assign({}, ...styles.filter(Boolean)) : styles || {}),
    },
    Modal: ({ visible, children, ...props }) => (visible ? React.createElement('Modal', props, children) : null),
    View,
    Text: host('Text'),
    TextInput: host('TextInput'),
    TouchableOpacity: host('TouchableOpacity'),
    ScrollView: host('ScrollView'),
    Image: host('Image'),
    useWindowDimensions: () => ({ width: 420, height: 800 }),
    PanResponder: {
      create: (config) => ({
        panHandlers: {
          onStartShouldSetResponder: (e) => (config.onStartShouldSetPanResponder
            ? config.onStartShouldSetPanResponder(e) : false),
          onStartShouldSetResponderCapture: (e) => (config.onStartShouldSetPanResponderCapture
            ? config.onStartShouldSetPanResponderCapture(e) : false),
          onMoveShouldSetResponder: (e) => (config.onMoveShouldSetPanResponder
            ? config.onMoveShouldSetPanResponder(e) : false),
          onMoveShouldSetResponderCapture: (e) => (config.onMoveShouldSetPanResponderCapture
            ? config.onMoveShouldSetPanResponderCapture(e) : false),
          onResponderGrant: (e, g) => config.onPanResponderGrant?.(e, g),
          onResponderMove: (e, g) => config.onPanResponderMove?.(e, g),
          onResponderRelease: (e, g) => config.onPanResponderRelease?.(e, g),
          onResponderTerminate: (e) => config.onPanResponderTerminate?.(e),
          onResponderReject: (e) => config.onPanResponderReject?.(e),
          onResponderTerminationRequest: () => config.onPanResponderTerminationRequest?.() ?? true,
          onShouldBlockNativeResponder: () => config.onShouldBlockNativeResponder?.() ?? false,
        },
      }),
    },
  };
});

vi.mock('@expo/vector-icons', () => ({
  MaterialCommunityIcons: ({ name, ...props }) => React.createElement('MaterialCommunityIcons', { name, ...props }),
}));
vi.mock('../../i18n/locale', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useLocale: () => 'ru-RU', useModuleLocale: () => 'ru-RU' };
});
vi.mock('../../components/screens/LootTradeScreen/logic/lootTradeI18n', () => ({
  tLootTrade: (key) => key,
  formatLootTrade: (template, values) => `${template}:${JSON.stringify(values || {})}`,
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
  default: ({ lock, visible }) => React.createElement('LockPickingModal', { containerId: lock?.containerId, visible }),
}));
vi.mock('../../components/lootTrade/TerminalHackingModal', () => ({
  default: ({ terminal, visible }) => React.createElement('TerminalHackingModal', { containerId: terminal?.containerId, visible }),
}));
vi.mock('../../components/lootTrade/StandaloneCheckModal', () => ({
  default: ({ visible }) => React.createElement('StandaloneCheckModal', { visible }),
}));

import HubTreeView from '../../components/screens/LootTradeScreen/modals/HubTreeView.js';
import PlayerLootTradeOverlay from '../../components/lootTrade/PlayerLootTradeOverlay.js';
import useCharacterStore from '../../src/store/characterStore.js';
import useRoomStore from '../../src/room/roomStore.js';
import useUiModeStore from '../../src/room/uiModeStore.js';
import graph from '../../domain/locationGraph.js';
import {
  CONTAINER_KIND,
  buildLocationSessionNodes,
  normalizeContainerEntity,
} from '../../domain/lootTrade.js';
import { restoreLocationSessionNodes } from '../../domain/locationNodeMarker.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');
const findAll = (root, testID) => root.findAll((node) => node.props?.testID === testID);

const hub = (id, extra = {}) => normalizeContainerEntity({
  id, kind: CONTAINER_KIND.HUB, name: id, roomCodes: ['ROOM1'], ...extra,
});
const child = (id, kind, extra = {}) => normalizeContainerEntity({ id, kind, name: id, ...extra });

// Город: Мастер явно поставил торговца раньше сундука и вложенной мэрии.
// Мэрия: письменный стол раньше сейфа. Сундук общий с другой локацией.
const cards = () => [
  hub('town', {
    childOrder: ['shop', 'chest', 'mayor'],
    links: [{ containerId: 'chest' }, { containerId: 'shop' }],
  }),
  hub('mayor', {
    parentLocationId: 'town',
    childOrder: ['desk', 'safe'],
    links: [{ containerId: 'safe' }, { containerId: 'desk' }],
  }),
  child('chest', CONTAINER_KIND.LOOT),
  child('shop', CONTAINER_KIND.MERCHANT, { caps: 100 }),
  child('desk', CONTAINER_KIND.LOOT),
  child('safe', CONTAINER_KIND.LOOT),
  hub('other', { childOrder: ['chest'], links: [{ containerId: 'chest' }] }),
];

describe('545: канон порядка детей — граф и сессия', () => {
  it('normalizeContainerEntity хранит childOrder без дублей, граф сортирует детей родителя', () => {
    const all = cards();
    expect(all[0].childOrder).toEqual(['shop', 'chest', 'mayor']);
    const dirty = normalizeContainerEntity({ id: 'x', kind: CONTAINER_KIND.HUB, childOrder: [' a ', 'a', '', 'b'] });
    expect(dirty.childOrder).toEqual(['a', 'b']);

    const g = graph.buildLocationGraph(all);
    expect(graph.childIdsOf(g, 'town')).toEqual(['shop', 'chest', 'mayor']);
    expect(graph.childIdsOf(g, 'mayor')).toEqual(['desk', 'safe']);
    // У общего ребёнка каждый родитель держит свой порядок.
    expect(graph.childIdsOf(g, 'other')).toEqual(['chest']);
  });

  it('сессия Мастера и маркер старого сервера сохраняют порядок прямых детей', () => {
    const all = cards();
    const nodes = buildLocationSessionNodes(all[0], all);
    const direct = nodes.filter((n) => n.parentIds.includes('town')).map((n) => n.containerId);
    expect(direct).toEqual(['shop', 'chest', 'mayor']);
    expect(nodes.find((n) => n.containerId === 'mayor').childIds).toEqual(['desk', 'safe']);

    const legacy = nodes.map((n) => ({
      containerId: n.containerId, kind: 'loot', name: n.name, description: n.description,
      locked: false, lockLabel: n.lockLabel, caps: 0, saleMarkupPercent: 0,
      buyDepreciationPercent: 50, characterOverrides: {}, items: [],
    }));
    const restored = restoreLocationSessionNodes(legacy, 'town');
    expect(restored.filter((n) => n.parentIds.includes('town')).map((n) => n.containerId))
      .toEqual(['shop', 'chest', 'mayor']);
    expect(restored.find((n) => n.containerId === 'mayor').childIds).toEqual(['desk', 'safe']);
  });

  it('moveChildInOrder переносит позицию на место цели и не ломает неизвестные id', () => {
    expect(graph.moveChildInOrder(['a', 'b', 'c'], 'a', 'c')).toEqual(['b', 'c', 'a']);
    expect(graph.moveChildInOrder(['a', 'b', 'c'], 'c', 'a')).toEqual(['c', 'a', 'b']);
    expect(graph.moveChildInOrder(['a', 'b'], 'x', 'a')).toEqual(['a', 'b']);
  });
});

const mountTree = (all, onReorderChildren) => {
  let renderer;
  act(() => {
    renderer = create(React.createElement(HubTreeView, {
      hub: all[0], containers: all, keyItems: [],
      onOpenSettings: vi.fn(), onReorderChildren,
    }));
  });
  return renderer;
};

const rowIds = (renderer) => renderer.root
  .findAll((node) => node.type === 'View'
    && typeof node.props?.testID === 'string'
    && node.props.testID.startsWith('hub-tree-row-'))
  .map((node) => node.props.testID.replace('hub-tree-row-', ''));

const setRowBounds = (ids, startY = 0) => {
  ids.forEach((id, index) => {
    mockLayout.bounds[`hub-tree-row-${id}`] = { x: 0, y: startY + index * 30, width: 200, height: 24 };
  });
};

const dragRow = (renderer, childId, targetId) => {
  const [handle] = findAll(renderer.root, `hub-tree-reorder-${childId}`);
  expect(handle, childId).toBeTruthy();
  const target = mockLayout.bounds[`hub-tree-row-${targetId}`];
  act(() => {
    handle.props.onStartShouldSetResponder();
    handle.props.onResponderGrant({}, { x0: 0, y0: 0 });
    handle.props.onResponderMove({}, { moveX: 10, moveY: target.y + 5 });
    handle.props.onResponderRelease();
  });
};

describe('545: дерево Мастера — ручка перетаскивания и новый порядок', () => {
  it('строки идут в childOrder, перетаскивание отдаёт новый порядок родителя', () => {
    const all = cards();
    const onReorderChildren = vi.fn();
    const renderer = mountTree(all, onReorderChildren);
    expect(rowIds(renderer)).toEqual(['shop', 'chest', 'mayor']);
    expect(findAll(renderer.root, 'hub-tree-reorder-chest').length).toBeGreaterThan(0);

    setRowBounds(['shop', 'chest', 'mayor']);
    dragRow(renderer, 'chest', 'shop');
    expect(onReorderChildren).toHaveBeenCalledWith('town', ['chest', 'shop', 'mayor']);

    // После сохранения порядок читается из того же канона.
    all[0] = { ...all[0], childOrder: ['chest', 'shop', 'mayor'] };
    const rerender = mountTree(all, onReorderChildren);
    expect(rowIds(rerender)).toEqual(['chest', 'shop', 'mayor']);
  });

  it('вложенная локация переставляет своих детей отдельно от родителя', () => {
    const all = cards();
    const onReorderChildren = vi.fn();
    const renderer = mountTree(all, onReorderChildren);
    act(() => findAll(renderer.root, 'hub-tree-toggle-mayor')[0].props.onPress());
    expect(rowIds(renderer)).toContain('desk');
    setRowBounds(['desk', 'safe'], 100);
    dragRow(renderer, 'safe', 'desk');
    expect(onReorderChildren).toHaveBeenCalledWith('mayor', ['safe', 'desk']);
  });
});

const mountPlayer = async (nodes) => {
  useUiModeStore.setState({ tabUiMode: 'user', gmInspectingCharacter: false });
  useCharacterStore.setState({ currentCharacterId: 'player-char', characterName: 'Player', items: {}, currency: 0 });
  useRoomStore.setState({
    clientId: 'player-client', status: 'online',
    rooms: {
      ROOM1: {
        joined: true,
        members: [{ clientId: 'player-client', role: 'player' }],
        capabilities: { terminalHacking: true, lockPicking: true },
        activeSession: {
          sessionId: 's545', containerId: 'town', kind: 'hub', name: 'Город', targetType: 'room', nodes,
        },
        terminalStates: {},
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

const enterIds = (renderer) => renderer.root
  .findAll((node) => node.type === 'TouchableOpacity'
    && typeof node.props?.testID === 'string'
    && node.props.testID.startsWith('hub-node-enter-'))
  .map((node) => node.props.testID.replace('hub-node-enter-', ''));

const tap = async (renderer, testID) => {
  const [button] = findAll(renderer.root, testID);
  expect(button, testID).toBeTruthy();
  await act(async () => { button.props.onPress(); await Promise.resolve(); });
};

describe('545: окно игрока повторяет порядок Мастера', () => {
  it('корень и вложенная локация показывают те же позиции в том же порядке', async () => {
    const all = cards();
    const renderer = await mountPlayer(buildLocationSessionNodes(all[0], all));
    expect(enterIds(renderer)).toEqual(['shop', 'chest', 'mayor']);
    await tap(renderer, 'hub-node-enter-mayor');
    expect(enterIds(renderer)).toEqual(['desk', 'safe']);
    await act(async () => renderer.unmount());
  });

  it('старый сервер комнат не сбрасывает порядок (маркер 544 + childIds)', async () => {
    const all = cards();
    const nodes = buildLocationSessionNodes(all[0], all).map((n) => ({
      containerId: n.containerId, kind: 'loot', name: n.name, description: n.description,
      locked: false, lockLabel: n.lockLabel, caps: 0, saleMarkupPercent: 0,
      buyDepreciationPercent: 50, characterOverrides: {}, items: [],
    }));
    const renderer = await mountPlayer(nodes);
    expect(enterIds(renderer)).toEqual(['shop', 'chest', 'mayor']);
    await tap(renderer, 'hub-node-enter-mayor');
    expect(enterIds(renderer)).toEqual(['desk', 'safe']);
    await act(async () => renderer.unmount());
  });
});

describe('545: проводка и парные строки', () => {
  it('экран сохраняет childOrder через persistAndSyncContainer и отдаёт обработчик дереву', () => {
    const screen = read('components/screens/LootTradeScreen/LootTradeScreen.js');
    const tree = read('components/screens/LootTradeScreen/modals/HubTreeView.js');
    expect(screen).toContain('const handleReorderHubChildren');
    expect(screen).toContain('await persistAndSyncContainer({ ...parent, childOrder });');
    expect(screen).toContain('onReorderChildren={handleReorderHubChildren}');
    expect(tree).toContain('onReorderChildren');
    expect(tree).toContain('locationGraph.moveChildInOrder');
    expect(tree).toContain('hub-tree-reorder-');
  });

  it('RU/EN строки перетаскивания добавлены парно', () => {
    const ru = JSON.parse(read('i18n/ru-RU/screens/lootTrade/screen.json'));
    const en = JSON.parse(read('i18n/en-EN/screens/lootTrade/screen.json'));
    expect(ru.detail.hubReorderHandle).toContain('{name}');
    expect(en.detail.hubReorderHandle).toContain('{name}');
    expect(ru.detail.hubReorderHint).toBeTruthy();
    expect(en.detail.hubReorderHint).toBeTruthy();
  });
});
