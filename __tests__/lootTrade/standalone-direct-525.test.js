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

const CHECK = {
  containerId: 'lock-1', kind: 'lock', name: 'Замок', description: '', difficulty: 2,
};

const room = () => ({
  joined: true,
  members: [{ clientId: 'player-client', role: 'player' }],
  activeSession: null,
  capabilities: { terminalHacking: true, lockPicking: true },
  terminalStates: {
    'lock-1': {
      containerId: 'lock-1',
      standaloneIssued: true,
      accessId: 'broadcast-1',
      config: CHECK,
      game: null,
      closed: false,
      locked: false,
    },
  },
});

const mount = async () => {
  let renderer;
  await act(async () => {
    renderer = TestRenderer.create(<PlayerLootTradeOverlay />);
    await Promise.resolve();
  });
  return renderer;
};

describe('525: отдельно выданный замок через terminal.issue', () => {
  beforeEach(() => {
    useUiModeStore.setState({ tabUiMode: 'user', gmInspectingCharacter: false });
    useCharacterStore.setState({
      currentCharacterId: 'player-char', characterName: 'Player', items: {}, currency: 0,
    });
    useRoomStore.setState({
      clientId: 'player-client',
      status: 'online',
      rooms: { ROOM1: room() },
    });
  });

  it('сначала входная модалка, мини-игры ещё нет и «Покинуть локацию» нет', async () => {
    const renderer = await mount();
    const entry = renderer.root.findByType('StandaloneCheckModal');
    expect(entry.props.visible).toBe(true);
    expect(renderer.root.findAllByType('LockPickingModal')).toHaveLength(0);
    expect(renderer.root.findAllByProps({ testID: 'leave-hub-button' })).toHaveLength(0);
    await act(async () => renderer.unmount());
  });

  it('«Взломать» монтирует доску с autoStart, входная модалка скрыта', async () => {
    const renderer = await mount();
    const entry = renderer.root.findByType('StandaloneCheckModal');
    await act(async () => { entry.props.onHack(); await Promise.resolve(); });
    const modal = renderer.root.findByType('LockPickingModal');
    expect(modal.props).toMatchObject({ containerId: 'lock-1', visible: true, autoStart: true });
    expect(renderer.root.findByType('StandaloneCheckModal').props.visible).toBe(false);
    await act(async () => renderer.unmount());
  });

  it('«Смотреть» открывает окно доски без автозапуска партии', async () => {
    const renderer = await mount();
    const entry = renderer.root.findByType('StandaloneCheckModal');
    await act(async () => { entry.props.onView(); await Promise.resolve(); });
    const modal = renderer.root.findByType('LockPickingModal');
    expect(modal.props).toMatchObject({ containerId: 'lock-1', visible: true, autoStart: false });
    await act(async () => renderer.unmount());
  });
});
