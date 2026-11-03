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
vi.mock('../../components/lootTrade/TerminalHackingModal', () => ({
  default: ({ terminal, autoStart }) => React.createElement('TerminalHackingModal', {
    containerId: terminal?.containerId,
    autoStart,
  }),
}));

import PlayerLootTradeOverlay from '../../components/lootTrade/PlayerLootTradeOverlay';
import useCharacterStore from '../../src/store/characterStore';
import useRoomStore from '../../src/room/roomStore';
import useUiModeStore from '../../src/room/uiModeStore';
import { encodeTerminalNodeMarker } from '../../domain/lootTrade.js';

describe('player opening a GM-issued location', () => {
  beforeEach(() => {
    useUiModeStore.setState({ tabUiMode: 'user', gmInspectingCharacter: false });
    useCharacterStore.setState({ currentCharacterId: 'player-char', characterName: 'Player', items: [], currency: 0 });
    useRoomStore.setState({
      clientId: 'player-client',
      status: 'online',
      rooms: {
        ROOM1: {
          joined: true,
          members: [{ clientId: 'player-client', role: 'player' }],
          activeSession: null,
          terminalStates: {},
        },
      },
    });
  });

  it('renders the room location with a linked terminal without changing hook order', async () => {
    let renderer;
    await act(async () => {
      renderer = TestRenderer.create(<PlayerLootTradeOverlay />);
      await Promise.resolve();
    });
    await act(async () => {
      useRoomStore.setState((state) => ({
        rooms: {
          ...state.rooms,
          ROOM1: {
            ...state.rooms.ROOM1,
            activeSession: {
              sessionId: 'session-1',
              kind: 'hub',
              name: 'Vault',
              targetType: 'room',
              nodes: [{
                containerId: 'terminal-1',
                kind: 'terminal',
                name: 'Vault terminal',
                difficulty: 3,
                items: [],
              }],
            },
          },
        },
      }));
      await Promise.resolve();
    });
    expect(renderer.root.findByProps({ name: 'console' })).toBeTruthy();
    await act(async () => renderer.unmount());
  });

  it('treats a room-registered terminal as a terminal even if a stale session calls it loot', async () => {
    let renderer;
    await act(async () => {
      renderer = TestRenderer.create(<PlayerLootTradeOverlay />);
      await Promise.resolve();
    });
    await act(async () => {
      useRoomStore.setState((state) => ({
        rooms: {
          ...state.rooms,
          ROOM1: {
            ...state.rooms.ROOM1,
            terminalStates: {
              'terminal-1': {
                containerId: 'terminal-1',
                config: {
                  containerId: 'terminal-1',
                  name: 'Vault terminal',
                  difficulty: 3,
                },
                locked: false,
                game: null,
              },
            },
            activeSession: {
              sessionId: 'session-stale-kind',
              kind: 'hub',
              name: 'Vault',
              targetType: 'room',
              nodes: [{
                containerId: 'terminal-1',
                kind: 'loot',
                name: 'Vault terminal',
                difficulty: 0,
                items: [],
              }],
            },
          },
        },
      }));
      await Promise.resolve();
    });

    expect(renderer.root.findByProps({ name: 'console' })).toBeTruthy();
    const hackButton = renderer.root.findByProps({ testID: 'terminal-hack-button' });
    await act(async () => hackButton.props.onPress());
    expect(renderer.root.findByType('TerminalHackingModal').props).toMatchObject({
      containerId: 'terminal-1',
      autoStart: true,
    });
    await act(async () => renderer.unmount());
  });

  it('opens the hacking modal for a terminal downgraded to loot by a legacy room server', async () => {
    let renderer;
    await act(async () => {
      renderer = TestRenderer.create(<PlayerLootTradeOverlay />);
      await Promise.resolve();
    });
    await act(async () => {
      useRoomStore.setState((state) => ({
        rooms: {
          ...state.rooms,
          ROOM1: {
            ...state.rooms.ROOM1,
            // Ни capabilities, ни terminalStates: сервер старой версии.
            terminalStates: {},
            activeSession: {
              sessionId: 'session-legacy-server',
              kind: 'hub',
              name: 'Vault',
              targetType: 'room',
              nodes: [{
                containerId: 'terminal-1',
                kind: 'loot',
                name: 'Vault terminal',
                description: '',
                locked: false,
                lockLabel: encodeTerminalNodeMarker({ difficulty: 3 }),
                difficulty: 0,
                items: [],
              }],
            },
          },
        },
      }));
      await Promise.resolve();
    });

    expect(renderer.root.findByProps({ name: 'console' })).toBeTruthy();
    expect(renderer.root.findAllByProps({ name: 'treasure-chest' })).toHaveLength(0);
    expect(renderer.root.findAllByProps({ testID: 'terminal-hack-button' }).length).toBeGreaterThan(0);
    expect(renderer.root.findAllByProps({ testID: 'terminal-view-button' }).length).toBeGreaterThan(0);
    const hackButton = renderer.root.findByProps({ testID: 'terminal-hack-button' });
    await act(async () => hackButton.props.onPress());
    expect(renderer.root.findByType('TerminalHackingModal').props).toMatchObject({
      containerId: 'terminal-1',
      autoStart: true,
    });
    await act(async () => renderer.unmount());
  });

});
