// Патч 547: НАСТОЯЩИЕ модалки взлома передают сигнал об успехе.
// Слово владельца: «показан, успех, кнопка закрыть — передача сигнала об
// успешном взломе — доступ к содержимому». Здесь проверяются сами модалки
// (замок и терминал), а приём сигнала окном игрока — в
// __tests__/room/hack-success-signal-547.test.js.
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
    TouchableOpacity: mk('TouchableOpacity'), Pressable: mk('Pressable'),
    ScrollView: mk('ScrollView'), Image: mk('Image'),
    KeyboardAvoidingView: mk('KeyboardAvoidingView'),
    Animated: {
      View: mk('AnimatedView'),
      Value: class { constructor(v) { this.value = v; } setValue() {} interpolate() { return 0; } },
      timing: () => ({ start() {} }),
    },
    useWindowDimensions: () => ({ width: 390, height: 700 }),
  };
});
vi.mock('@expo/vector-icons', () => ({
  MaterialCommunityIcons: ({ name, ...props }) => React.createElement('MaterialCommunityIcons', { name, ...props }),
}));
vi.mock('../../components/alerts/alertService', () => ({ showRawAlert: vi.fn(async () => 0) }));
vi.mock('../../src/room/roomCharacterSync', () => ({
  pushSavedCharacterToBoundRoomIfAny: vi.fn(async () => true),
}));
vi.mock('../../components/lootTrade/spendBobbyPins', () => ({
  spendBobbyPins: vi.fn(async () => 1),
}));

import LockPickingModal from '../../components/lootTrade/LockPickingModal';
import TerminalHackingModal from '../../components/lootTrade/TerminalHackingModal';
import useCharacterStore from '../../src/store/characterStore';
import useRoomStore from '../../src/room/roomStore';

const LOCK = { containerId: 'l1', name: 'Запертый люк', description: '', difficulty: 2, kind: 'lock' };
const TERMINAL = { containerId: 't1', name: 'Терминал подвала', description: '', difficulty: 2, kind: 'terminal' };

const wonLockGame = () => ({
  status: 'won', kind: 'lock', result: 'ACCESS GRANTED',
  cells: [{ arrow: 'left', state: 'green' }, { arrow: 'up', state: 'green' }],
  rows: [2], cellCount: 2, cursor: 2, per: 8, luck: 4, skill: 3, difficulty: 2,
  pinsRemaining: 2, pinActive: true, brokenPins: 0, revision: 5,
  operatorClientId: 'client-1', operatorCharacterId: 'ch1',
});
const wonTerminalGame = () => ({
  status: 'won', result: 'ACCESS GRANTED', board: 'X'.repeat(408),
  wordRanges: [], bracketRanges: [], guesses: [{ word: 'SECRET', likeness: 6 }],
  wordLength: 6, attempts: 2, maxAttempts: 4, difficulty: 2, effectiveDifficulty: 2,
  revision: 7, operatorClientId: 'client-1', operatorCharacterId: 'ch1', scrollUp: true,
});

const seedRoom = (id, config, game) => {
  useCharacterStore.setState({ currentCharacterId: 'ch1', characterName: 'Сталкер', items: {} });
  useRoomStore.setState({
    clientId: 'client-1',
    rooms: {
      ROOM1: {
        joined: true,
        capabilities: { terminalHacking: true, lockPicking: true },
        terminalStates: {
          [id]: { containerId: id, accessId: 'broadcast-1', config, game, closed: false, locked: false, awaitingGm: false },
        },
      },
    },
  });
};

const renderers = [];
const render = async (element) => {
  let renderer;
  await act(async () => {
    renderer = TestRenderer.create(element);
    await Promise.resolve();
  });
  renderers.push(renderer);
  return renderer;
};
const byTestId = (renderer, testID) => renderer.root
  .findAllByType('TouchableOpacity').filter((n) => n.props.testID === testID);
const tap = async (renderer, testID) => {
  const [button] = byTestId(renderer, testID);
  expect(button, testID).toBeTruthy();
  await act(async () => { button.props.onPress(); await Promise.resolve(); });
};

beforeEach(() => {
  while (renderers.length) {
    const renderer = renderers.pop();
    try { renderer.unmount(); } catch { /* уже размонтирован */ }
  }
});

describe('547: модалка замка после ACCESS GRANTED', () => {
  it('не предлагает «Ещё подход», показывает успех и «Закрыть»', async () => {
    seedRoom('l1', LOCK, wonLockGame());
    const renderer = await render(
      <LockPickingModal visible lock={LOCK} roomCode="ROOM1" onClose={() => {}} onHacked={() => {}} />,
    );
    expect(renderer.root.findAllByProps({ testID: 'lock-won-panel' }).length).toBeGreaterThan(0);
    expect(byTestId(renderer, 'lock-success-close').length).toBeGreaterThan(0);
    expect(byTestId(renderer, 'lock-new-attempt-button')).toHaveLength(0);
  });

  it('передаёт сигнал о взломе ровно один раз', async () => {
    seedRoom('l1', LOCK, wonLockGame());
    const onHacked = vi.fn();
    await render(
      <LockPickingModal visible lock={LOCK} roomCode="ROOM1" onClose={() => {}} onHacked={onHacked} />,
    );
    expect(onHacked).toHaveBeenCalledTimes(1);
    expect(onHacked).toHaveBeenCalledWith({ containerId: 'l1', kind: 'lock', local: false });
  });

  it('кнопка «Закрыть» закрывает окно и не теряет сигнал', async () => {
    seedRoom('l1', LOCK, wonLockGame());
    const onHacked = vi.fn();
    const onClose = vi.fn();
    const renderer = await render(
      <LockPickingModal visible lock={LOCK} roomCode="ROOM1" onClose={onClose} onHacked={onHacked} />,
    );
    await tap(renderer, 'lock-success-close');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onHacked).toHaveBeenCalledTimes(1);
  });

  it('крестик окна тоже передаёт сигнал победы', async () => {
    seedRoom('l1', LOCK, wonLockGame());
    const onHacked = vi.fn();
    const onClose = vi.fn();
    const renderer = await render(
      <LockPickingModal visible lock={LOCK} roomCode="ROOM1" onClose={onClose} onHacked={onHacked} />,
    );
    await tap(renderer, 'lock-close-button');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onHacked).toHaveBeenCalledWith({ containerId: 'l1', kind: 'lock', local: false });
  });

  it('без победы сигнал не уходит, «Ещё подход» остаётся на провале', async () => {
    seedRoom('l1', LOCK, { ...wonLockGame(), status: 'awaitingRetry', result: 'OUT OF PINS' });
    const onHacked = vi.fn();
    const onClose = vi.fn();
    const renderer = await render(
      <LockPickingModal visible lock={LOCK} roomCode="ROOM1" onClose={onClose} onHacked={onHacked} />,
    );
    expect(byTestId(renderer, 'lock-new-attempt-button').length).toBeGreaterThan(0);
    expect(byTestId(renderer, 'lock-success-close')).toHaveLength(0);
    await tap(renderer, 'lock-close-button');
    expect(onHacked).not.toHaveBeenCalled();
  });
});

describe('547: модалка терминала после ACCESS GRANTED', () => {
  it('показывает успех и кнопку «Закрыть», передавая сигнал', async () => {
    seedRoom('t1', TERMINAL, wonTerminalGame());
    const onHacked = vi.fn();
    const renderer = await render(
      <TerminalHackingModal visible terminal={TERMINAL} roomCode="ROOM1" onClose={() => {}} onHacked={onHacked} />,
    );
    expect(byTestId(renderer, 'terminal-success-close').length).toBeGreaterThan(0);
    expect(onHacked).toHaveBeenCalledTimes(1);
    expect(onHacked).toHaveBeenCalledWith({ containerId: 't1', kind: 'terminal', local: false });
  });

  it('«Закрыть» закрывает окно, сигнал идемпотентен', async () => {
    seedRoom('t1', TERMINAL, wonTerminalGame());
    const onHacked = vi.fn();
    const onClose = vi.fn();
    const renderer = await render(
      <TerminalHackingModal visible terminal={TERMINAL} roomCode="ROOM1" onClose={onClose} onHacked={onHacked} />,
    );
    await tap(renderer, 'terminal-success-close');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onHacked).toHaveBeenCalledTimes(1);
  });

  it('невзломанный терминал сигнал не передаёт', async () => {
    seedRoom('t1', TERMINAL, null);
    const onHacked = vi.fn();
    const renderer = await render(
      <TerminalHackingModal visible terminal={TERMINAL} roomCode="ROOM1" onClose={() => {}} onHacked={onHacked} />,
    );
    expect(byTestId(renderer, 'terminal-success-close')).toHaveLength(0);
    expect(onHacked).not.toHaveBeenCalled();
  });
});
