import React, { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-native', () => {
  const mk = (tag) => ({ children, ...props }) => React.createElement(tag, props, children);
  return {
    Platform: { OS: 'web' },
    StyleSheet: { create: (styles) => styles, flatten: (styles) => styles || {} },
    Modal: ({ visible, children, ...props }) => (visible ? React.createElement('Modal', props, children) : null),
    View: mk('View'),
    Text: mk('Text'),
    Pressable: mk('Pressable'),
    TouchableOpacity: mk('TouchableOpacity'),
    ScrollView: mk('ScrollView'),
    Animated: {
      Value: class {
        constructor(value) { this.value = value; }
        setValue() {}
        interpolate() { return 0; }
      },
      timing: () => ({ start: () => {} }),
      View: mk('Animated.View'),
    },
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

import TerminalHackingModal from '../../components/lootTrade/TerminalHackingModal';
import useCharacterStore from '../../src/store/characterStore';
import useRoomStore from '../../src/room/roomStore';

const terminal = {
  containerId: 'term-1',
  name: 'Vault console',
  description: '',
  difficulty: 2,
};

describe('terminal hacking modal on a legacy room server', () => {
  beforeEach(() => {
    useCharacterStore.setState({
      currentCharacterId: 'char-1',
      characterName: 'Оператор',
      attributes: { INT: { value: 6 } },
      skills: [],
      items: {},
      selectedPerks: [],
      usedMagazineEffects: [],
    });
    // Нет capabilities и нет terminalStates — сервер старой версии.
    useRoomStore.setState({
      clientId: 'client-1',
      rooms: { ROOM1: { terminalStates: {}, activeSession: null } },
    });
  });

  it('opens the mini-game in a modal and starts a board without terminal.action', async () => {
    let renderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <TerminalHackingModal
          visible
          terminal={terminal}
          roomCode="ROOM1"
          autoStart
          onClose={() => {}}
        />,
      );
      await Promise.resolve();
    });
    expect(renderer.root.findByType('Modal')).toBeTruthy();
    expect(renderer.root.findByProps({ name: 'console' })).toBeTruthy();
    const words = renderer.root.findAllByType('Pressable');
    expect(words.length).toBeGreaterThan(5);
    // Доска реально сгенерирована: в окне есть счётчик попыток.
    const texts = renderer.root.findAllByType('Text').map((node) => String(node.props.children ?? ''));
    expect(texts.some((text) => text.includes('4'))).toBe(true);
    await act(async () => renderer.unmount());
  });
});
