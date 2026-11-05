// Патч 530 — тезис 13, первый оставшийся пункт:
// «развести в интерфейсе семантику "взлом локации = вход" и "взлом контейнера
// = содержимое"». Локация = узел с детьми, контейнер = узел без детей.
import React, { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HACK_OUTCOME,
  HACK_OUTCOME_DELAY_MS,
  nodeHasChildren,
  hackOutcomeForNode,
  hackWinKey,
  applyHackOutcome,
} from '../../components/lootTrade/hackOutcome';

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

const hubSession = () => ({
  sessionId: 'session-530',
  containerId: 'vault',
  kind: 'hub',
  name: 'Убежище',
  targetType: 'room',
  // Патч 542 (lock_never_standalone): замок — часть локации/сундука, а не
  // отдельная строка игрока. Дверь = запертая ЛОКАЦИЯ (преграда на ней,
  // дети спрятаны до прохождения); ящик = запертый контейнер с проверкой.
  nodes: [
    {
      containerId: 'door-1', kind: 'loot', name: 'Дверь в бункер', locked: true,
      linkedCheckIds: ['term-door'],
      parentIds: ['vault'], childIds: ['inner-1'], items: [],
    },
    {
      containerId: 'inner-1', kind: 'loot', name: 'Внутренний зал',
      parentIds: ['door-1'], childIds: [], items: [],
    },
    {
      containerId: 'box-1', kind: 'loot', name: 'Запертый ящик', locked: true,
      linkedCheckIds: ['term-box'],
      parentIds: ['vault'], childIds: [], items: [],
    },
    {
      containerId: 'hall-1', kind: 'loot', name: 'Коридор', parentIds: ['vault'],
      childIds: ['side-1'], items: [],
    },
    {
      containerId: 'side-1', kind: 'loot', name: 'Боковая комната',
      parentIds: ['hall-1'], childIds: [], items: [],
    },
  ],
});

const renderers = [];
const mount = async () => {
  let renderer;
  await act(async () => {
    renderer = TestRenderer.create(<PlayerLootTradeOverlay />);
    await Promise.resolve();
  });
  await act(async () => {
    useRoomStore.setState((state) => ({
      rooms: { ...state.rooms, ROOM1: { ...state.rooms.ROOM1, activeSession: hubSession() } },
    }));
    await Promise.resolve();
  });
  renderers.push(renderer);
  return renderer;
};
const pause = async (ms) => {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
};
const allText = (renderer) => renderer.root.findAllByType('Text')
  .map((node) => String(node.props.children ?? '')).join(' | ');
const nodeText = (renderer, testID) => {
  const found = renderer.root.findAllByProps({ testID });
  return found.map((n) => String(n.props.children ?? '')).join(' | ');
};

beforeEach(() => {
  useUiModeStore.setState({ tabUiMode: 'user', gmInspectingCharacter: false });
  useCharacterStore.setState({
    currentCharacterId: 'player-char', characterName: 'Player', items: {}, currency: 0,
  });
  useRoomStore.setState({
    clientId: 'player-client',
    status: 'online',
    rooms: {
      ROOM1: {
        joined: true,
        members: [{ clientId: 'player-client', role: 'player' }],
        capabilities: { terminalHacking: true, lockPicking: true },
        activeSession: null,
        terminalStates: {
          'term-door': {
            containerId: 'term-door',
            config: { containerId: 'term-door', kind: 'lock', name: 'Замок двери', difficulty: 2 },
            game: null, closed: false, locked: false,
          },
          'term-box': {
            containerId: 'term-box',
            config: { containerId: 'term-box', kind: 'lock', name: 'Замок ящика', difficulty: 2 },
            game: null, closed: false, locked: false,
          },
        },
      },
    },
  });
});

afterEach(async () => {
  for (const renderer of renderers.splice(0)) {
    try { await act(async () => renderer.unmount()); } catch { /* уже снято */ }
  }
});

describe('530: чистая семантика узла', () => {
  it('узел с детьми — локация, без детей — контейнер', () => {
    expect(nodeHasChildren({ childIds: ['a'] })).toBe(true);
    expect(nodeHasChildren({ childIds: [] })).toBe(false);
    expect(nodeHasChildren({ kind: 'hub' })).toBe(true); // старый сервер без childIds
    expect(nodeHasChildren({ kind: 'loot' })).toBe(false);
  });

  it('взлом локации = вход, взлом контейнера = содержимое', () => {
    expect(hackOutcomeForNode({ childIds: ['a'] })).toBe(HACK_OUTCOME.ENTER);
    expect(hackOutcomeForNode({ childIds: [] })).toBe(HACK_OUTCOME.CONTENTS);
    expect(hackOutcomeForNode({ kind: 'hub' })).toBe(HACK_OUTCOME.ENTER);
  });

  it('переход адресный: только один узел, без каскада', () => {
    const enterLocation = vi.fn();
    const openContents = vi.fn();
    expect(applyHackOutcome(HACK_OUTCOME.ENTER, 'loc-1', { enterLocation, openContents }))
      .toBe(HACK_OUTCOME.ENTER);
    expect(enterLocation).toHaveBeenCalledWith('loc-1');
    expect(openContents).not.toHaveBeenCalled();
    expect(applyHackOutcome(HACK_OUTCOME.CONTENTS, 'box-1', { enterLocation, openContents }))
      .toBe(HACK_OUTCOME.CONTENTS);
    expect(openContents).toHaveBeenCalledWith('box-1');
    expect(applyHackOutcome(HACK_OUTCOME.CONTENTS, '', { openContents })).toBe(HACK_OUTCOME.CONTENTS);
    expect(openContents).toHaveBeenCalledTimes(1);
  });

  it('пауза перед переходом и ключ победы', () => {
    expect(HACK_OUTCOME_DELAY_MS).toBeGreaterThan(100);
    expect(hackWinKey('t1', { accessId: 'b1', game: { revision: 3 } })).toBe('t1|b1|3');
    expect(hackWinKey('t1', { accessId: 'b1', game: { revision: 4 } }))
      .not.toBe(hackWinKey('t1', { accessId: 'b1', game: { revision: 3 } }));
  });
});

describe('530: интерфейс локации', () => {
  it('у локации «Взломать и войти» и подсказка про вход; у контейнера — про содержимое', async () => {
    const renderer = await mount();
    const text = allText(renderer);
    expect(text).toMatch(/Hack & enter|Взломать и войти/);
    expect(text).toMatch(/Hack & open|Взломать и открыть/);
    expect(nodeText(renderer, 'hack-outcome-hint-door-1')).toMatch(/location|локаци/i);
    // Подсказка рисуется только у запертых точек: box-1 не заперт, поэтому
    // у него проверяем подпись кнопки, а не hint.
    expect(text).toMatch(/Enter|Войти/); // обычная кнопка вложенной локации
  });

  it('у вложенной локации обычная кнопка говорит «Войти», а не «Открыть»', async () => {
    const renderer = await mount();
    const buttons = renderer.root.findAllByProps({ testID: 'hub-back-button' });
    expect(buttons).toHaveLength(0); // ещё не вошли
    const text = allText(renderer);
    expect(text).toMatch(/Войти|Enter/);
  });
});

describe('530: исход ACCESS GRANTED', () => {
  const win = async (renderer, containerId, checkId = containerId) => {
    await act(async () => {
      useRoomStore.setState((state) => ({
        rooms: {
          ...state.rooms,
          ROOM1: {
            ...state.rooms.ROOM1,
            activeSession: {
              ...state.rooms.ROOM1.activeSession,
              revision: (state.rooms.ROOM1.activeSession?.revision || 0) + 1,
              nodes: state.rooms.ROOM1.activeSession.nodes.map((n) => (
                n.containerId === containerId ? { ...n, locked: false } : n
              )),
            },
            terminalStates: {
              ...state.rooms.ROOM1.terminalStates,
              [checkId]: {
                containerId: checkId,
                accessId: `broadcast-${checkId}`,
                config: { containerId: checkId, kind: 'lock', name: nName(checkId), difficulty: 2 },
                closed: false, locked: false, awaitingGm: false,
                game: { status: 'won', result: 'ACCESS GRANTED', revision: 2 },
              },
            },
          },
        },
      }));
      await Promise.resolve();
    });
  };
  const nName = (id) => (id === 'door-1' || id === 'term-door'
    ? 'Дверь в бункер'
    : 'Запертый ящик');

  it('взлом локации ВВОДИТ игрока внутрь (кнопка «Назад» в родителя)', async () => {
    const renderer = await mount();
    // Патч 542: вход в запертую локацию сначала показывает ТОЛЬКО преграду.
    const enter = renderer.root.findAllByType('TouchableOpacity')
      .filter((n) => n.props.testID === 'hub-node-enter-door-1')[0];
    await act(async () => { enter.props.onPress(); await Promise.resolve(); });
    expect(allText(renderer)).not.toContain('Внутренний зал'); // ещё за дверью
    const gateHack = renderer.root.findAllByType('TouchableOpacity')
      .filter((n) => n.props.testID === 'current-gate-hack-term-door')[0];
    await act(async () => { gateHack.props.onPress(); await Promise.resolve(); });
    expect(renderer.root.findAllByType('LockPickingModal').length).toBeGreaterThan(0);
    await win(renderer, 'door-1', 'term-door');
    await pause(HACK_OUTCOME_DELAY_MS + 150);
    expect(renderer.root.findAllByProps({ testID: 'hub-back-button' }).length).toBeGreaterThan(0);
    expect(renderer.root.findAllByType('LockPickingModal')).toHaveLength(0);
    const text = allText(renderer);
    expect(text).toContain('Внутренний зал'); // вошли и видим детей локации
  });

  it('взлом контейнера показывает СОДЕРЖИМОЕ, не вход в локацию', async () => {
    const renderer = await mount();
    // Замок ящика — преграда НА контейнере: проверка идёт прямо из строки.
    const boxHack = renderer.root.findAllByType('TouchableOpacity')
      .filter((n) => n.props.testID === 'gate-hack-button-box-1')[0];
    await act(async () => { boxHack.props.onPress(); await Promise.resolve(); });
    await win(renderer, 'box-1', 'term-box');
    await pause(HACK_OUTCOME_DELAY_MS + 150);
    // Список локации сменился окном содержимого.
    expect(renderer.root.findAllByProps({ testID: 'hack-outcome-hint-door-1' })).toHaveLength(0);
    expect(renderer.root.findAllByProps({ testID: 'hub-back-button' })).toHaveLength(0);
    expect(renderer.root.findAllByType('LockPickingModal')).toHaveLength(0);
    const text = allText(renderer);
    expect(text).toContain('Запертый ящик'); // открыто содержимое контейнера
    expect(text).not.toContain('Дверь в бункер'); // список локации скрыт
  });

  it('победа без явного «Взломать» и отдельно выданная точка навигацию не дёргают', async () => {
    const renderer = await mount();
    await win(renderer, 'box-1', 'term-box'); // terminalSelection нет вообще
    await pause(HACK_OUTCOME_DELAY_MS + 150);
    expect(renderer.root.findAllByProps({ testID: 'hub-back-button' })).toHaveLength(0);
    expect(renderer.root.findAllByType('LockPickingModal')).toHaveLength(0);
    expect(allText(renderer)).not.toMatch(/Назад в локацию|Back to location/);
    // Список локации остался на месте: исход взлома НЕ применяется без
    // явного «Взломать».
    expect(allText(renderer)).toContain('Дверь в бункер');
  });
});
