// Патч 528: «Если ячейка красится в красный и заколка ломается, сделай
// небольшую паузу перед обновлением цветов. Но если заколка не сломалась,
// красный остается».
import React, { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLockGame, applyLockAction, BREAK_HIGHLIGHT_MS, CELL_STATE } from '../../server/lockPicking.js';
import { initialLocalLockState, applyLocalLockAction } from '../../components/lootTrade/localLockGame.js';

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
    useWindowDimensions: () => ({ width: 390, height: 700 }),
  };
});
vi.mock('@expo/vector-icons', () => ({
  MaterialCommunityIcons: ({ name, ...props }) => React.createElement('MaterialCommunityIcons', { name, ...props }),
}));
vi.mock('../../components/alerts/alertService', () => ({ showRawAlert: vi.fn() }));
vi.mock('../../src/room/roomCharacterSync', () => ({
  pushSavedCharacterToBoundRoomIfAny: vi.fn(async () => true),
}));
vi.mock('../../components/lootTrade/spendBobbyPins', () => ({
  spendBobbyPins: vi.fn(async () => 1),
}));

import LockPickingModal from '../../components/lootTrade/LockPickingModal';
import useCharacterStore from '../../src/store/characterStore';
import useRoomStore from '../../src/room/roomStore';
import { lockLightStyles } from '../../components/lootTrade/lockPickingStyles';

const LOW_SKILL = {
  data: {
    attributes: { PER: { value: 10 }, LCK: { value: 4 } },
    skills: [{ name: 'LOCKPICK', value: 0 }],
    items: [{ itemId: 'item_bobby_pin', quantity: 5 }],
  },
};
const HELD_SKILL = {
  data: { ...LOW_SKILL.data, skills: [{ name: 'LOCKPICK', value: 6 }] },
};

const LOCK = { containerId: 'l1', name: 'Замок', description: '', difficulty: 2, kind: 'lock' };

const boardGame = (overrides = {}) => ({
  status: 'playing',
  kind: 'lock',
  result: 'PIN BROKEN',
  cells: [
    { arrow: null, state: 'red' },
    { arrow: 'left', state: 'grey' },
    { arrow: null, state: 'hidden' },
    { arrow: null, state: 'hidden' },
  ],
  rows: [4],
  cellCount: 4,
  cursor: 0,
  per: 10,
  luck: 4,
  skill: 0,
  difficulty: 1,
  pinsRemaining: 3,
  pinActive: true,
  brokenPins: 1,
  breakHighlight: { durationMs: 15 },
  revision: 7,
  operatorClientId: 'client-1',
  operatorCharacterId: 'ch1',
  ...overrides,
});

const roomWith = (game) => ({
  joined: true,
  capabilities: { terminalHacking: true, lockPicking: true },
  terminalStates: {
    l1: {
      containerId: 'l1', accessId: 'broadcast-1', config: LOCK,
      game, closed: false, locked: false, awaitingGm: false,
    },
  },
});

const renderers = [];
const render = async () => {
  let renderer;
  await act(async () => {
    renderer = TestRenderer.create(
      <LockPickingModal visible lock={LOCK} roomCode="ROOM1" onClose={() => {}} />,
    );
    await Promise.resolve();
  });
  renderers.push(renderer);
  return renderer;
};
const pause = async (ms = 60) => {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
};
const cell = (renderer, idx) => renderer.root.findAllByProps({ testID: `lock-cell-${idx}` })[0];
const cellText = (node) => {
  const text = node.findAllByType('Text')[0];
  return Object.assign({}, ...[].concat(text.props.style).filter(Boolean));
};

beforeEach(() => {
  vi.clearAllMocks();
  useCharacterStore.setState({
    currentCharacterId: 'ch1', characterName: 'Сталкер',
    items: { p: { weaponId: 'item_bobby_pin', quantity: 4 } },
  });
  useRoomStore.setState({
    clientId: 'client-1',
    rooms: { ROOM1: roomWith(boardGame()) },
    actOnTerminal: vi.fn(async () => ({ game: null })),
  });
});

afterEach(async () => {
  for (const renderer of renderers.splice(0)) {
    try { await act(async () => renderer.unmount()); } catch { /* уже снято */ }
  }
});

describe('528: сервер помечает поломку паузой, но не поломку без паузы', () => {
  it('на поломке появляется breakHighlight, красная ячейка сохраняется', () => {
    const game = createLockGame({ config: { difficulty: 1 }, characterSnapshot: LOW_SKILL, rng: () => 0 });
    const broken = applyLockAction({ game, config: {}, action: 'press', value: 'up', rng: () => 0.99 }).game;
    expect(broken.brokenPins).toBe(1);
    expect(broken.breakHighlight).toEqual({ durationMs: BREAK_HIGHLIGHT_MS });
    expect(broken.cells[0]).toEqual({ arrow: null, state: CELL_STATE.RED });
  });

  it('если заколка НЕ сломалась — паузы нет, красный остаётся', () => {
    const game = createLockGame({ config: { difficulty: 1 }, characterSnapshot: HELD_SKILL, rng: () => 0 });
    const wrong = applyLockAction({ game, config: {}, action: 'press', value: 'up', rng: () => 0.99 }).game;
    expect(wrong.brokenPins).toBe(0);
    expect(wrong.breakHighlight).toBeNull();
    expect(wrong.cells[0]).toEqual({ arrow: null, state: CELL_STATE.RED });
  });

  it('следующее нажатие снимает метку паузы и стирает старый красный', () => {
    const game = createLockGame({ config: { difficulty: 1 }, characterSnapshot: LOW_SKILL, rng: () => 0 });
    const broken = applyLockAction({ game, config: {}, action: 'press', value: 'up', rng: () => 0.99 }).game;
    const again = applyLockAction({ game: broken, config: {}, action: 'press', value: 'left', rng: () => 0.99 }).game;
    expect(again.breakHighlight).toBeNull();
    expect(again.cells.filter((c) => c.state === CELL_STATE.RED).length).toBeLessThanOrEqual(1);
  });

  it('локальный резерв доски тоже отдаёт breakHighlight клиенту', () => {
    let state = initialLocalLockState();
    state = applyLocalLockAction(state, 'start', undefined, {
      lock: LOCK, characterId: 'ch1', characterSnapshot: LOW_SKILL, rng: () => 0,
    });
    state = applyLocalLockAction(state, 'press', 'up', {
      lock: LOCK, characterId: 'ch1', characterSnapshot: LOW_SKILL, rng: () => 0.99,
    });
    expect(state.view.brokenPins).toBe(1);
    expect(state.view.breakHighlight).toEqual({ durationMs: BREAK_HIGHLIGHT_MS });
  });
});

describe('528: пауза в окне замка', () => {
  it('красный «?» виден сразу и гаснет только после паузы', async () => {
    const renderer = await render();
    expect(cellText(cell(renderer, 0)).color).toBe('#c1121f');
    await pause();
    expect(cellText(cell(renderer, 0)).color).not.toBe('#c1121f');
  });

  it('на время паузы не перескакиваем в «Подход завершён» даже без заколок', async () => {
    useRoomStore.setState({ rooms: { ROOM1: roomWith(boardGame({
      status: 'awaitingRetry', result: 'OUT OF PINS', pinsRemaining: 0, pinActive: false,
    })) } });
    const renderer = await render();
    expect(renderer.root.findAllByProps({ testID: 'lock-cells-board' }).length).toBeGreaterThan(0);
    expect(renderer.root.findAllByProps({ testID: 'lock-approach-finished' })).toHaveLength(0);
    expect(cellText(cell(renderer, 0)).color).toBe('#c1121f');
    await pause();
    expect(renderer.root.findAllByProps({ testID: 'lock-approach-finished' }).length).toBeGreaterThan(0);
  });

  it('без поломки красный остаётся сколь угодно долго', async () => {
    useRoomStore.setState({ rooms: { ROOM1: roomWith(boardGame({
      result: 'TRY AGAIN', breakHighlight: null, brokenPins: 0,
      cells: [
        { arrow: null, state: 'red' }, { arrow: null, state: 'hidden' },
        { arrow: null, state: 'hidden' }, { arrow: null, state: 'hidden' },
      ],
    })) } });
    const renderer = await render();
    expect(cellText(cell(renderer, 0)).color).toBe('#c1121f');
    await pause();
    expect(cellText(cell(renderer, 0)).color).toBe('#c1121f');
    expect(cell(renderer, 0).props.style).toEqual(expect.arrayContaining([lockLightStyles.cellRed]));
  });
});
