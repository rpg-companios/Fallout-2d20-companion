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
    TouchableOpacity: mk('TouchableOpacity'),
    ScrollView: mk('ScrollView'),
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
import { pushSavedCharacterToBoundRoomIfAny } from '../../src/room/roomCharacterSync';

const LOCK = { containerId: 'lock-1', name: 'Замок', description: '', difficulty: 2, kind: 'lock' };
const fail = (code) => {
  const error = new Error(code);
  error.code = code;
  return error;
};

const character = () => ({
  currentCharacterId: 'ch1',
  characterName: 'Сталкер',
  attributes: { PER: { base: 9 }, LCK: { base: 5 } },
  skills: { LOCKPICK: { base: 4 } },
  selectedSkills: [],
  selectedPerks: [],
  usedMagazineEffects: [],
  // Каталожный id живёт только в weaponId — старый счётчик таких отмычек не видел.
  items: { pin1: { id: 'pin1', weaponId: 'item_bobby_pin', quantity: 9 } },
  equipment: { items: [] },
});

const room = (extra = {}) => ({ terminalStates: {}, activeSession: null, ...extra });

const render = async (props = {}) => {
  let renderer;
  await act(async () => {
    renderer = TestRenderer.create(
      <LockPickingModal visible autoStart lock={LOCK} roomCode="ROOM1" onClose={() => {}} {...props} />,
    );
    await Promise.resolve();
    await Promise.resolve();
  });
  return renderer;
};

describe('524: окно замка на старом сервере комнат', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCharacterStore.setState(character());
  });

  it('собирает доску локально: ячейки, отмычки и нажимаемые стрелки без terminal.action', async () => {
    const actOnTerminal = vi.fn(async () => { throw fail('UNKNOWN_TYPE'); });
    useRoomStore.setState({ clientId: 'client-1', rooms: { ROOM1: room() }, actOnTerminal });

    const renderer = await render();
    expect(renderer.root.findAllByProps({ testID: 'lock-cell-0' }).length).toBeGreaterThan(0);
    const pins = renderer.root.findByProps({ testID: 'lock-pins-count' });
    expect(String(pins.props.children)).toContain('9');
    const arrowUp = renderer.root.findByProps({ testID: 'lock-arrow-up' });
    expect(arrowUp.props.disabled).toBe(false);
    expect(actOnTerminal).not.toHaveBeenCalled();
    expect(showRawAlert).not.toHaveBeenCalled();
    await act(async () => renderer.unmount());
  });

  it('UNKNOWN_TYPE от обновлённого по виду сервера переключает доску в локальный резерв', async () => {
    const actOnTerminal = vi.fn(async () => { throw fail('UNKNOWN_TYPE'); });
    useRoomStore.setState({
      clientId: 'client-1',
      rooms: { ROOM1: room({ capabilities: { terminalHacking: true, lockPicking: true } }) },
      actOnTerminal,
    });

    const renderer = await render();
    expect(actOnTerminal).toHaveBeenCalledTimes(1);
    expect(renderer.root.findAllByProps({ testID: 'lock-cell-0' }).length).toBeGreaterThan(0);
    expect(showRawAlert).not.toHaveBeenCalled();
    await act(async () => renderer.unmount());
  });
});

describe('524: окно замка на обновлённом сервере', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCharacterStore.setState(character());
  });

  it('приход accessId комнаты больше не посылает второй start', async () => {
    const actOnTerminal = vi.fn(async () => ({ game: null }));
    useRoomStore.setState({
      clientId: 'client-1',
      rooms: { ROOM1: room({ capabilities: { terminalHacking: true, lockPicking: true } }) },
      actOnTerminal,
    });

    const renderer = await render();
    expect(actOnTerminal).toHaveBeenCalledTimes(1);
    await act(async () => {
      useRoomStore.setState((state) => ({
        rooms: {
          ...state.rooms,
          ROOM1: {
            ...state.rooms.ROOM1,
            terminalStates: {
              'lock-1': { containerId: 'lock-1', accessId: 'broadcast-42', config: LOCK, game: null },
            },
          },
        },
      }));
      await Promise.resolve();
    });
    expect(actOnTerminal).toHaveBeenCalledTimes(1);
    expect(showRawAlert).not.toHaveBeenCalled();
    await act(async () => renderer.unmount());
  });

  it('SESSION_FORBIDDEN публикует лист и повторяет взлом без «Действие не выполнено»', async () => {
    let calls = 0;
    const actOnTerminal = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw fail('SESSION_FORBIDDEN');
      return { game: null };
    });
    useRoomStore.setState({
      clientId: 'client-1',
      rooms: { ROOM1: room({ capabilities: { terminalHacking: true, lockPicking: true } }) },
      actOnTerminal,
    });

    const renderer = await render();
    expect(pushSavedCharacterToBoundRoomIfAny).toHaveBeenCalledWith('ch1');
    expect(actOnTerminal).toHaveBeenCalledTimes(2);
    expect(showRawAlert).not.toHaveBeenCalled();
    await act(async () => renderer.unmount());
  });

  it('TERMINAL_ALREADY_ACTIVE — штатный повтор, а не ошибка', async () => {
    const actOnTerminal = vi.fn(async () => { throw fail('TERMINAL_ALREADY_ACTIVE'); });
    useRoomStore.setState({
      clientId: 'client-1',
      rooms: { ROOM1: room({ capabilities: { terminalHacking: true, lockPicking: true } }) },
      actOnTerminal,
    });

    const renderer = await render();
    expect(showRawAlert).not.toHaveBeenCalled();
    await act(async () => renderer.unmount());
  });
});
