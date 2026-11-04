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
    View: mk('View'), Text: mk('Text'), TextInput: mk('TextInput'),
    TouchableOpacity: mk('TouchableOpacity'), ScrollView: mk('ScrollView'), Image: mk('Image'),
    KeyboardAvoidingView: mk('KeyboardAvoidingView'),
    Animated: { Value: class { constructor(v) { this.value = v; } setValue() {} }, timing: () => ({ start() {} }) },
    useWindowDimensions: () => ({ width: 900, height: 700 }),
  };
});
vi.mock('@expo/vector-icons', () => ({
  MaterialCommunityIcons: ({ name, ...props }) => React.createElement('MaterialCommunityIcons', { name, ...props }),
}));
vi.mock('../../components/alerts/alertService', () => ({ showRawAlert: vi.fn() }));
vi.mock('../../src/room/roomCharacterSync', () => ({
  pushSavedCharacterToBoundRoomIfAny: vi.fn(async () => true),
}));

import LockPickingModal from '../../components/lootTrade/LockPickingModal';
import useCharacterStore from '../../src/store/characterStore';
import useRoomStore from '../../src/room/roomStore';
import { showRawAlert } from '../../components/alerts/alertService';

const LOCK = { containerId: 'l1', name: 'Замок', description: '', difficulty: 2, kind: 'lock' };
const FINISHED_GAME = {
  status: 'awaitingRetry',
  result: 'OUT OF PINS',
  cells: [],
  rows: [0],
  cellCount: 0,
  pinsRemaining: 0,
  pinActive: false,
  revision: 3,
  operatorClientId: 'client-1',
  operatorCharacterId: 'ch1',
};

const baseRoom = (game) => ({
  joined: true,
  capabilities: { terminalHacking: true, lockPicking: true },
  terminalStates: {
    l1: {
      containerId: 'l1',
      accessId: 'broadcast-1',
      config: LOCK,
      game,
      closed: false,
      locked: false,
      awaitingGm: Boolean(game),
    },
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  useCharacterStore.setState({
    currentCharacterId: 'ch1',
    characterName: 'Сталкер',
    attributes: { PER: { base: 8 } },
    skills: { LOCKPICK: { base: 3 } },
    items: { p: { weaponId: 'item_bobby_pin', quantity: 4 } },
  });
  useRoomStore.setState({
    clientId: 'client-1',
    rooms: { ROOM1: baseRoom(null) },
    actOnTerminal: vi.fn(async () => ({ game: null })),
  });
});

describe('526: окно замка после завершённого подхода', () => {
  it('показывает «Подход завершён» и «Ещё подход», но не вопрос Мастеру', async () => {
    useRoomStore.setState({ rooms: { ROOM1: baseRoom(FINISHED_GAME) } });
    let renderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <LockPickingModal visible lock={LOCK} roomCode="ROOM1" onClose={() => {}} />,
      );
      await Promise.resolve();
    });
    expect(renderer.root.findAllByProps({ testID: 'lock-approach-finished' }).length).toBeGreaterThan(0);
    expect(renderer.root.findAllByProps({ testID: 'lock-new-attempt-button' }).length).toBeGreaterThan(0);
    expect(renderer.root.findAllByProps({ testID: 'lock-retry-yes' })).toHaveLength(0);
    expect(renderer.root.findAllByProps({ testID: 'lock-retry-no' })).toHaveLength(0);
    expect(renderer.root.findAllByProps({ testID: 'lock-hack-button' })).toHaveLength(0);
    expect(showRawAlert).not.toHaveBeenCalled();
    await act(async () => renderer.unmount());
  });

  it('нажатие «Ещё подход» отправляет newAttempt, а не retry Мастеру', async () => {
    useRoomStore.setState({ rooms: { ROOM1: baseRoom(FINISHED_GAME) } });
    let renderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <LockPickingModal visible lock={LOCK} roomCode="ROOM1" onClose={() => {}} />,
      );
      await Promise.resolve();
    });
    const button = renderer.root.findAllByProps({ testID: 'lock-new-attempt-button' })[0];
    await act(async () => { button.props.onPress(); await Promise.resolve(); });
    const spy = useRoomStore.getState().actOnTerminal;
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toMatchObject({
      code: 'ROOM1', containerId: 'l1', action: 'newAttempt',
    });
    expect(showRawAlert).not.toHaveBeenCalled();
    await act(async () => renderer.unmount());
  });

  it('freshAttempt из входной модалки сразу шлёт newAttempt один раз', async () => {
    let renderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <LockPickingModal visible autoStart freshAttempt lock={LOCK} roomCode="ROOM1" onClose={() => {}} />,
      );
      await Promise.resolve();
      await Promise.resolve();
    });
    const spy = useRoomStore.getState().actOnTerminal;
    const newAttemptCalls = spy.mock.calls.filter(([payload]) => payload.action === 'newAttempt');
    expect(newAttemptCalls).toHaveLength(1);
    expect(spy.mock.calls.filter(([payload]) => payload.action === 'start')).toHaveLength(0);
    await act(async () => renderer.unmount());
  });
});
