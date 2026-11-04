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

import StandaloneCheckModal from '../../components/lootTrade/StandaloneCheckModal';
import LockPickingModal from '../../components/lootTrade/LockPickingModal';
import useCharacterStore from '../../src/store/characterStore';
import useRoomStore from '../../src/room/roomStore';
import { showRawAlert } from '../../components/alerts/alertService';

const CHECK = {
  containerId: 'lock-1', kind: 'lock', name: 'Замок', description: 'Дверь ангара',
  difficulty: 2,
};

const character = () => ({
  currentCharacterId: 'ch1',
  characterName: 'Сталкер',
  attributes: { PER: { base: 9 }, LCK: { base: 5 } },
  skills: { LOCKPICK: { base: 4 } },
  selectedSkills: [],
  selectedPerks: [],
  usedMagazineEffects: [],
  items: { pin1: { id: 'pin1', weaponId: 'item_bobby_pin', quantity: 9 } },
  equipment: { items: [] },
});

beforeEach(() => {
  vi.clearAllMocks();
  useCharacterStore.setState(character());
  useRoomStore.setState({
    clientId: 'client-1',
    rooms: { ROOM1: { terminalStates: {}, activeSession: null } },
    actOnTerminal: vi.fn(async () => ({ game: null })),
  });
});

describe('525: входная модалка отдельной точки проверки', () => {
  it('показывает «Взломать»/«Смотреть» и не содержит «Покинуть локацию»', async () => {
    const onHack = vi.fn();
    const onView = vi.fn();
    const onClose = vi.fn();
    let renderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <StandaloneCheckModal
          visible
          check={CHECK}
          isLock
          onHack={onHack}
          onView={onView}
          onClose={onClose}
        />,
      );
      await Promise.resolve();
    });
    expect(renderer.root.findAllByType('Modal').length).toBeGreaterThan(0);
    expect(renderer.root.findAllByProps({ testID: 'check-hack-button' }).length).toBeGreaterThan(0);
    expect(renderer.root.findAllByProps({ testID: 'check-view-button' }).length).toBeGreaterThan(0);
    expect(renderer.root.findAllByProps({ testID: 'leave-hub-button' })).toHaveLength(0);
    expect(renderer.root.findAllByProps({ testID: 'check-entry-hint' }).length).toBeGreaterThan(0);
    const texts = renderer.root.findAllByType('Text').map((n) => String(n.props.children ?? ''));
    expect(texts.some((t) => /Покинуть локацию|Leave location/.test(t))).toBe(false);
    // Локаль в тестовом окружении может быть и RU, и EN.
    expect(texts.some((t) => /Взломать|Hack|lock\.hack/.test(t))).toBe(true);
    await act(async () => renderer.root.findAllByProps({ testID: 'check-hack-button' })[0].props.onPress());
    expect(onHack).toHaveBeenCalledTimes(1);
    await act(async () => renderer.root.findAllByProps({ testID: 'check-view-button' })[0].props.onPress());
    expect(onView).toHaveBeenCalledTimes(1);
    await act(async () => renderer.unmount());
  });

  it('светлая палитра: карточка точки построена на каркасе формы модалок', async () => {
    let renderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <StandaloneCheckModal visible check={CHECK} onHack={() => {}} onView={() => {}} onClose={() => {}} />,
      );
      await Promise.resolve();
    });
    // modalStyles.card/footer/saveBtn/cancelBtn приходят из lootTradeFormStyles.
    const point = renderer.root.findAllByProps({ testID: 'check-entry-point' })[0];
    // Светлая палитра модалок: белая поднятая поверхность, а не тёмный терминал.
    expect(point.props.style.backgroundColor).toBe('#ffffff');
    expect(point.props.style.borderColor).toBe('#b7b7b7');
    const actions = renderer.root.findAllByProps({ testID: 'check-entry-actions' })[0];
    expect(actions).toBeTruthy();
    const hackButton = renderer.root.findAllByProps({ testID: 'check-hack-button' })[0];
    expect(hackButton.props.style.some((style) => style?.backgroundColor === '#e8f0fb')).toBe(true);
    await act(async () => renderer.unmount());
  });
});

describe('525: окно доски не притворяется запущенной игрой', () => {
  it('без доски нет ячеек, стрелок и внутренней кнопки «Взломать»', async () => {
    useRoomStore.setState({
      clientId: 'client-1',
      rooms: { ROOM1: {
        terminalStates: {},
        capabilities: { terminalHacking: true, lockPicking: true },
        activeSession: null,
      } },
      actOnTerminal: vi.fn(async () => ({ game: null })),
    });
    let renderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <LockPickingModal visible lock={CHECK} roomCode="ROOM1" onClose={() => {}} />,
      );
      await Promise.resolve();
    });
    expect(renderer.root.findAllByProps({ testID: 'lock-waiting-board' }).length).toBeGreaterThan(0);
    expect(renderer.root.findAllByProps({ testID: 'lock-cells-board' })).toHaveLength(0);
    expect(renderer.root.findAllByProps({ testID: 'lock-arrow-up' })).toHaveLength(0);
    expect(renderer.root.findAllByProps({ testID: 'lock-hack-button' })).toHaveLength(0);
    expect(showRawAlert).not.toHaveBeenCalled();
    await act(async () => renderer.unmount());
  });

  it('по autoStart доска сразу с ячейками и нажимаемыми стрелками, без второго «Взломать»', async () => {
    let renderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <LockPickingModal visible autoStart lock={CHECK} roomCode="ROOM1" onClose={() => {}} />,
      );
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(renderer.root.findAllByProps({ testID: 'lock-cells-board' }).length).toBeGreaterThan(0);
    expect(renderer.root.findAllByProps({ testID: 'lock-cell-0' }).length).toBeGreaterThan(0);
    const arrow = renderer.root.findAllByProps({ testID: 'lock-arrow-up' })[0];
    expect(arrow.props.disabled).toBe(false);
    expect(renderer.root.findAllByProps({ testID: 'lock-hack-button' })).toHaveLength(0);
    expect(renderer.root.findAllByProps({ testID: 'lock-waiting-board' })).toHaveLength(0);
    expect(useRoomStore.getState().actOnTerminal).not.toHaveBeenCalled();
    await act(async () => renderer.unmount());
  });
});
