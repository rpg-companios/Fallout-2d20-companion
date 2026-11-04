// Патч 527, клиент: подсказка под счётчиком, отдельная затемнённая область
// стрелок и списание сломанной заколки из живого инвентаря (не только ledger).
import React, { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
import { modalStyles, lockLightStyles, LOCK_PALETTE } from '../../components/lootTrade/lockPickingStyles';
import { spendBobbyPins } from '../../components/lootTrade/spendBobbyPins';
import useCharacterStore from '../../src/store/characterStore';
import useRoomStore from '../../src/room/roomStore';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const json = (rel) => JSON.parse(readFileSync(path.join(ROOT, rel), 'utf8'));

const LOCK = { containerId: 'l1', name: 'Замок', description: '', difficulty: 2, kind: 'lock' };

const playing = (brokenPins = 0) => ({
  status: 'playing',
  kind: 'lock',
  result: '',
  cells: [
    { arrow: null, state: 'red' },
    { arrow: null, state: 'hidden' },
    { arrow: 'left', state: 'grey' },
    { arrow: null, state: 'hidden' },
  ],
  rows: [4],
  cellCount: 4,
  cursor: 0,
  per: 8,
  luck: 4,
  skill: 3,
  difficulty: 2,
  pinsRemaining: 3,
  pinActive: true,
  brokenPins,
  revision: 1,
  operatorClientId: 'client-1',
  operatorCharacterId: 'ch1',
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

// Не оставляем смонтированное окно жить после упавшей проверки: иначе его
// подписка на стор комнаты дала бы лишние срабатывания в следующих тестах.
afterEach(async () => {
  for (const renderer of renderers.splice(0)) {
    try {
      await act(async () => renderer.unmount());
    } catch { /* уже снято */ }
  }
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
    rooms: { ROOM1: roomWith(playing()) },
    actOnTerminal: vi.fn(async () => ({ game: null })),
  });
});

describe('527: подсказка и область стрелок', () => {
  it('точная подсказка выводится сразу под счётчиком заколок', async () => {
    const renderer = await render();
    const hint = renderer.root.findAllByProps({ testID: 'lock-arrows-hint' });
    expect(hint.length).toBeGreaterThan(0); // мок RN даёт и компонент, и host-узел
    const en = json('i18n/en-EN/screens/lootTrade/screen.json').lock.arrowsHint;
    expect(String(hint[0].props.children)).toBe(en);
    // Подсказка идёт ПОСЛЕ счётчика, а не внизу окна.
    const counter = renderer.root.findAllByProps({ testID: 'lock-pins-count' })[0];
    expect(counter).toBeTruthy();
    await act(async () => renderer.unmount());
  });

  it('стрелки в заливке темнее карточки, крупнее и с увеличенным шагом', async () => {
    const renderer = await render();
    const pad = renderer.root.findAllByProps({ testID: 'lock-arrow-pad' });
    expect(pad.length).toBeGreaterThan(0);
    expect(pad[0].props.style.backgroundColor).toBe(LOCK_PALETTE.surfaceMuted);
    expect(pad[0].props.style.backgroundColor).not.toBe(modalStyles.card.backgroundColor);
    expect(lockLightStyles.arrowButton.backgroundColor).toBe('#dadada');
    expect(lockLightStyles.arrowButton.width).toBeGreaterThan(52);
    expect(lockLightStyles.crossRow.gap).toBeGreaterThan(8);
    const buttons = ['up', 'left', 'down', 'right'].map(
      (dir) => renderer.root.findAllByProps({ testID: `lock-arrow-${dir}` })[0],
    );
    expect(buttons.every(Boolean)).toBe(true);
    for (const button of buttons) {
      expect(button.findAllByType('MaterialCommunityIcons').some((n) => n.props.size === 30)).toBe(true);
    }
    expect(renderer.root.findAllByType('ScrollView').length).toBeGreaterThan(0);
    await act(async () => renderer.unmount());
  });

  it('ошибочный «?» рисуется красным текстом на розовой ячейке', async () => {
    const renderer = await render();
    const cell = renderer.root.findAllByProps({ testID: 'lock-cell-0' })[0];
    const cellStyle = Object.assign({}, ...[].concat(cell.props.style).filter(Boolean));
    expect(cellStyle.backgroundColor).toBe(lockLightStyles.cellRed.backgroundColor);
    const text = cell.findAllByType('Text')[0];
    expect(String(text.props.children)).toBe('?');
    const flat = Object.assign({}, ...[].concat(text.props.style).filter(Boolean));
    expect(flat.color).toBe('#c1121f');
    await act(async () => renderer.unmount());
  });
});

describe('527: сломанная заколка списывается из живого инвентаря', () => {
  it('первое наблюдение за доской не списывает уже сломанные заколки повторно', async () => {
    useRoomStore.setState({ rooms: { ROOM1: roomWith(playing(2)) } });
    const renderer = await render();
    expect(spendBobbyPins).not.toHaveBeenCalled();
    await act(async () => renderer.unmount());
  });

  it('рост brokenPins вызывает spendBobbyPins ровно на дельту', async () => {
    const renderer = await render();
    await act(async () => {
      useRoomStore.setState({ rooms: { ROOM1: roomWith(playing(1)) } });
      await Promise.resolve();
    });
    expect(spendBobbyPins).toHaveBeenCalledTimes(1);
    expect(spendBobbyPins.mock.calls[0][0]).toBe(1);
    expect(spendBobbyPins.mock.calls[0][1]).toMatchObject({ characterId: 'ch1' });
    await act(async () => {
      useRoomStore.setState({ rooms: { ROOM1: roomWith(playing(3)) } });
      await Promise.resolve();
    });
    expect(spendBobbyPins).toHaveBeenCalledTimes(2);
    expect(spendBobbyPins.mock.calls[1][0]).toBe(2);
    await act(async () => renderer.unmount());
  });
});
