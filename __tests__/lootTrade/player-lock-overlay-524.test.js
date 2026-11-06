import React, { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-native', () => {
  const mk = (tag) => ({ children, ...props }) => React.createElement(tag, props, children);
  return {
    Platform: { OS: 'web' },
    StyleSheet: {
      create: (styles) => styles,
      flatten: (styles) => (Array.isArray(styles) ? Object.assign({}, ...styles.filter(Boolean)) : styles || {}),
    },
    Modal: ({ visible, children, ...props }) => (visible ? React.createElement('Modal', props, children) : null),
    View: mk('View'),
    Text: mk('Text'),
    TextInput: mk('TextInput'),
    TouchableOpacity: mk('TouchableOpacity'),
    ScrollView: mk('ScrollView'),
    Image: mk('Image'),
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
  default: ({ visible, onHack, onView }) => React.createElement('StandaloneCheckModal', {
    visible, onHack, onView,
  }),
}));

import PlayerLootTradeOverlay from '../../components/lootTrade/PlayerLootTradeOverlay';
import useCharacterStore from '../../src/store/characterStore';
import useRoomStore from '../../src/room/roomStore';
import useUiModeStore from '../../src/room/uiModeStore';

// Патч 542: замок больше не рисуется строкой игрока (lock_never_standalone),
// поэтому для проверки берём терминал — законная самостоятельная дочерняя точка.
const location = () => ({
  sessionId: 'session-524',
  containerId: 'vault',
  kind: 'hub',
  name: 'Убежище',
  targetType: 'room',
  nodes: [
    { containerId: 'term-1', kind: 'terminal', name: 'Терминал', difficulty: 2, parentIds: ['vault'], childIds: [] },
    { containerId: 'box-1', kind: 'loot', name: 'Сундук', parentIds: ['vault'], childIds: [], items: [] },
  ],
});

const standaloneLock = () => ({
  sessionId: 'session-standalone-524',
  containerId: 'lock-1',
  kind: 'hub',
  name: 'Замок',
  targetType: 'room',
  nodes: [
    { containerId: 'lock-1', kind: 'lock', name: 'Замок', difficulty: 2, parentIds: [], childIds: [] },
  ],
});

const mount = async (session) => {
  let renderer;
  await act(async () => {
    renderer = TestRenderer.create(<PlayerLootTradeOverlay />);
    await Promise.resolve();
  });
  await act(async () => {
    useRoomStore.setState((state) => ({
      rooms: {
        ...state.rooms,
        ROOM1: { ...state.rooms.ROOM1, activeSession: session },
      },
    }));
    await Promise.resolve();
  });
  return renderer;
};

describe('524: окно локации и «Покинуть локацию»', () => {
  beforeEach(() => {
    useUiModeStore.setState({ tabUiMode: 'user', gmInspectingCharacter: false });
    useCharacterStore.setState({
      currentCharacterId: 'player-char', characterName: 'Player',
      items: {}, currency: 0,
    });
    useRoomStore.setState({
      clientId: 'player-client',
      status: 'online',
      rooms: {
        ROOM1: {
          joined: true,
          members: [{ clientId: 'player-client', role: 'player' }],
          activeSession: null,
          terminalStates: {
            'term-1': {
              containerId: 'term-1',
              config: {
                containerId: 'term-1', kind: 'terminal', name: 'Терминал', difficulty: 2,
              },
              game: null,
              closed: false,
              locked: false,
            },
          },
        },
      },
    });
  });

  it('при открытой мини-игре окно локации не торчит позади неё', async () => {
    const renderer = await mount(location());
    expect(renderer.root.findAllByProps({ testID: 'leave-hub-button' }).length).toBeGreaterThan(0);
    const hack = renderer.root.findAllByProps({ testID: 'terminal-hack-button' })[0];
    await act(async () => { hack.props.onPress(); await Promise.resolve(); });
    expect(renderer.root.findAllByType('TerminalHackingModal').length).toBeGreaterThan(0);
    // visible={!terminalSelection}: кнопка «Покинуть локацию» больше не видна
    // и не «залипает» под затемнением мини-игры.
    expect(renderer.root.findAllByProps({ testID: 'leave-hub-button' })).toHaveLength(0);
    await act(async () => renderer.unmount());
  });

  it('«Покинуть локацию» закрывает окно даже когда сервер отказал', async () => {
    const playerCloseRoomSession = vi.fn(async () => { throw new Error('UNKNOWN_TYPE'); });
    useRoomStore.setState({ playerCloseRoomSession });
    const renderer = await mount(location());
    const leave = renderer.root.findAllByProps({ testID: 'leave-hub-button' })[0];
    await act(async () => { await leave.props.onPress(); await Promise.resolve(); });
    expect(playerCloseRoomSession).toHaveBeenCalledTimes(1);
    expect(renderer.root.findAllByProps({ testID: 'leave-hub-button' })).toHaveLength(0);
    expect(renderer.root.findAllByType('Modal')).toHaveLength(0);
    await act(async () => renderer.unmount());
  });

  it('отдельно выданный замок не становится точкой игрока (542)', async () => {
    // lock_never_standalone: владелец убрал отдельную выдачу замка — такая
    // сессия не открывает для игрока ни окна, ни кнопок.
    const renderer = await mount(standaloneLock());
    expect(renderer.root.findAllByType('StandaloneCheckModal')).toHaveLength(0);
    expect(renderer.root.findAllByType('LockPickingModal')).toHaveLength(0);
    expect(renderer.root.findAllByProps({ testID: 'leave-hub-button' })).toHaveLength(0);
    const texts = renderer.root.findAllByType('Text').map((n) => String(n.props.children ?? ''));
    expect(texts.some((t) => t.includes('Покинуть локацию'))).toBe(false);
    await act(async () => renderer.unmount());
  });
});
