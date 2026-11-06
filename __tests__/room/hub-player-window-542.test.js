// Патч 542: выдача хаба целиком и окно игрока по слову владельца.
// 1) Граф строится по links + parentLocationId — Ниптон с вложенными
//    локациями/терминалом/замком выдаётся целиком, а не пустым экраном.
// 2) Верхний уровень окна — только прямые элементы; вложенные точки скрыты
//    до входа, замок не бывает самостоятельной строкой игрока.
// 3) Вход в запертую локацию сначала показывает ТОЛЬКО преграду
//    (замок/терминал), после прохождения — содержимое.
// 4) «Назад» возвращает в локацию, через которую пришёл (история входа),
//    exitLocationId даёт переход в другую локацию.
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { create, act } from 'react-test-renderer';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-native', () => {
  const React = require('react');
  const host = (name) => ({ children, ...props }) => React.createElement(name, props, children);
  return {
    Platform: { OS: 'web' },
    StyleSheet: {
      create: (styles) => styles,
      flatten: (styles) => (Array.isArray(styles) ? Object.assign({}, ...styles.filter(Boolean)) : styles || {}),
    },
    Modal: ({ visible, children, ...props }) => (visible ? React.createElement('Modal', props, children) : null),
    View: host('View'),
    Text: host('Text'),
    TextInput: host('TextInput'),
    TouchableOpacity: host('TouchableOpacity'),
    ScrollView: host('ScrollView'),
    Image: host('Image'),
    useWindowDimensions: () => ({ width: 420, height: 800 }),
  };
});

vi.mock('@expo/vector-icons', () => ({
  MaterialCommunityIcons: ({ name, ...props }) =>
    React.createElement('MaterialCommunityIcons', { name, ...props }),
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

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

// Хаб «Убежище»: два прямых дома (у одного — сундук внутри), отдельный
// сундук на корне; служебные узлы, которые игроку не должны торчать:
// скрытый замок, скрытый привязанный терминал и цель особого выхода.
const session = (extra = {}) => ({
  sessionId: 'session-542',
  containerId: 'vault',
  kind: 'hub',
  name: 'Убежище',
  targetType: 'room',
  exitLocationId: 'way-out',
  nodes: [
    {
      containerId: 'house-1', kind: 'loot', name: 'Дом у дороги',
      parentIds: ['vault'], childIds: ['chest-house'], items: [],
    },
    {
      containerId: 'chest-house', kind: 'loot', name: 'Сундук в доме',
      parentIds: ['house-1'], childIds: [], items: [],
    },
    {
      containerId: 'box-root', kind: 'loot', name: 'Сундук во дворе',
      parentIds: ['vault'], childIds: [], items: [],
    },
    {
      containerId: 'lock-hidden', kind: 'lock', name: 'Скрытый замок',
      parentIds: ['vault'], childIds: [],
    },
    {
      containerId: 'gate-hidden', kind: 'terminal', name: 'Скрытый терминал',
      parentIds: ['vault'], childIds: [], hiddenForPlayers: true,
    },
    {
      containerId: 'way-out', kind: 'loot', name: 'Выход к перекрёстку',
      parentIds: ['vault'], childIds: [], items: [], exitOnly: true,
    },
    ...(extra.nodes || []),
  ],
  ...extra.session,
});

const mount = async (activeSession) => {
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
          'term-gate': {
            containerId: 'term-gate',
            config: {
              containerId: 'term-gate', kind: 'lock', name: 'Замок двери', difficulty: 2,
            },
            game: null, closed: false, locked: false,
          },
        },
      },
    },
  });
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(PlayerLootTradeOverlay));
    await Promise.resolve();
  });
  await act(async () => {
    useRoomStore.setState((state) => ({
      rooms: { ...state.rooms, ROOM1: { ...state.rooms.ROOM1, activeSession } },
    }));
    await Promise.resolve();
  });
  return renderer;
};

const allText = (renderer) => renderer.root.findAllByType('Text')
  .map((node) => String(node.props.children ?? '')).join(' | ');
const tap = async (renderer, testID) => {
  const [button] = renderer.root
    .findAllByType('TouchableOpacity')
    .filter((node) => node.props.testID === testID);
  expect(button, testID).toBeTruthy();
  await act(async () => { button.props.onPress(); await Promise.resolve(); });
  return button;
};

describe('542: верхний уровень окна игрока — только прямые элементы', () => {
  it('вложенные точки, замок, скрытый терминал и цель выхода не торчат на корне', async () => {
    const renderer = await mount(session());
    const text = allText(renderer);
    expect(text).toContain('Дом у дороги');
    expect(text).toContain('Сундук во дворе');
    // Вложенный сундук виден только внутри дома.
    expect(text).not.toContain('Сундук в доме');
    // Замок никогда не самостоятельная строка игрока (lock_never_standalone).
    expect(text).not.toContain('Скрытый замок');
    // Привязанный терминал-преграда скрыт из списка.
    expect(text).not.toContain('Скрытый терминал');
    // Цель особого выхода — кнопка «Выход → …», а не дочерняя карточка.
    expect(renderer.root.findAllByProps({ testID: 'hub-node-enter-way-out' })).toHaveLength(0);
    expect(renderer.root.findAllByProps({ testID: 'hub-exit-button' }).length).toBeGreaterThan(0);
    await act(async () => renderer.unmount());
  });
});

describe('542: вход в локацию с преградой', () => {
  it('сначала только замок/терминал, содержимое скрыто до прохождения', async () => {
    const renderer = await mount(session());
    // Запираем дом: преграда на самой локации, дети спрятаны за ней.
    const lockedHouse = {
      containerId: 'house-1', kind: 'loot', name: 'Дом у дороги', locked: true,
      linkedCheckIds: ['term-gate'],
      parentIds: ['vault'], childIds: ['chest-house'], items: [],
    };
    const nodes = session().nodes
      .map((node) => (node.containerId === 'house-1' ? lockedHouse : node));
    await act(async () => {
      useRoomStore.setState((state) => ({
        rooms: { ...state.rooms, ROOM1: { ...state.rooms.ROOM1, activeSession: { ...session(), nodes } } },
      }));
      await Promise.resolve();
    });
    // Запертая локация ведёт к экрану преград, а не мимо неё.
    await tap(renderer, 'hub-node-enter-house-1');
    const gated = allText(renderer);
    expect(gated).not.toContain('Сундук в доме'); // содержимое ещё за преградой
    expect(renderer.root.findAllByProps({ testID: 'current-gate-option-term-gate' }).length)
      .toBeGreaterThan(0);
    expect(renderer.root.findAllByProps({ testID: 'current-gate-hack-term-gate' }).length)
      .toBeGreaterThan(0);
    await act(async () => renderer.unmount());
  });
});

describe('542: назад и особый выход', () => {
  it('выход ведёт в свою локацию, «Назад» возвращает по истории входа', async () => {
    const renderer = await mount(session());
    // Ещё не вошли — кнопки «Назад» нет.
    expect(renderer.root.findAllByProps({ testID: 'hub-back-button' })).toHaveLength(0);
    await tap(renderer, 'hub-exit-button');
    const outside = allText(renderer);
    expect(outside).toContain('Выход к перекрёстку');
    expect(renderer.root.findAllByProps({ testID: 'hub-back-button' }).length).toBeGreaterThan(0);
    // Назад — ровно один шаг по стеку истории, корень на месте.
    await tap(renderer, 'hub-back-button');
    const back = allText(renderer);
    expect(back).toContain('Убежище');
    expect(back).toContain('Дом у дороги');
    expect(renderer.root.findAllByProps({ testID: 'hub-node-enter-way-out' })).toHaveLength(0);
    expect(renderer.root.findAllByProps({ testID: 'hub-back-button' })).toHaveLength(0);
    await act(async () => renderer.unmount());
  });
});

describe('542: контракт по файлам', () => {
  const graph = read('server/locationGraph.js');
  const domain = read('domain/lootTrade.js');
  const sessionSrc = read('server/lootTradeSession.js');
  const screen = read('components/screens/LootTradeScreen/LootTradeScreen.js');
  const overlay = read('components/lootTrade/PlayerLootTradeOverlay.js');
  const store = read('src/room/roomStore.ts');

  it('граф хаба строится по links + parentLocationId, выходы помечены exitOnly', () => {
    expect(graph).toContain('buildGraphFromSession');
    expect(graph).toContain('viaExit');
    expect(graph).toContain('exitOnly: Boolean(viaExit && parentId)');
    expect(graph).toContain('parentLocationId');
    expect(domain).toContain('exitLocationId');
    expect(domain).toContain('accessExpression');
  });

  it('сервер скрывает замки/привязанные терминалы и закрывает корень-преграду пустым списком', () => {
    // Патч 546: корень-преграда определяется единым предикатом, а не только
    // состоянием ключа — непройденная проверка тоже закрывает выдачу.
    expect(sessionSrc).toContain('accessBarrierPending(session)');
    expect(sessionSrc).toContain('return { ...session, nodes: [] }');
    expect(sessionSrc).toContain('exitOnly');
    expect(sessionSrc).toContain('next.accessExpression = normalizeAccessExpression');
  });

  it('Мастер отдаёт хабу требование доступа и особый выход, сложность — nodeDifficulty', () => {
    expect(screen).toContain('exitLocationId: saved.exitLocationId || ');
    expect(screen).toContain('exitLocationId: freshSource.exitLocationId || ');
    expect(screen).toContain('nodeDifficulty');
    expect(store).toContain('exitLocationId?: string;');
    expect(store).toContain('accessExpression?: unknown[];');
  });

  it('окно игрока: gate-first, фильтры списка, сброс истории и кнопка выхода', () => {
    expect(overlay).toContain('normalizeLinkedCheckIds(node)');
    expect(overlay).toContain("node.keyAccessState !== 'denied'");
    expect(overlay).toContain("tLootTrade('player.gateOr')");
    expect(overlay).toContain("tLootTrade('player.gateAnd')");
    expect(overlay).toContain('current-gate-hack-');
    expect(overlay).toContain('gateOnly: true');
    expect(overlay).toContain('node.exitOnly || node.hiddenForPlayers || node.kind === CONTAINER_KIND.LOCK');
    expect(overlay).toContain('testID="hub-exit-button"');
    expect(overlay).toContain('setParentStack((stack) => [...stack, exitNode.containerId])');
    expect(overlay).toContain('setParentStack([])');
    expect(overlay).toContain('standaloneIssued');
    expect(overlay).toContain('lock_never_standalone');
  });

  it('словари RU/EN парные: выход, «и» между проверками', () => {
    const ru = JSON.parse(read('i18n/ru-RU/screens/lootTrade/screen.json'));
    const en = JSON.parse(read('i18n/en-EN/screens/lootTrade/screen.json'));
    expect(Object.keys(ru.player).sort()).toEqual(Object.keys(en.player).sort());
    expect(ru.player.exitToLocation).toContain('{name}');
    expect(en.player.exitToLocation).toContain('{name}');
    expect(ru.player.gateAnd).toBe('и');
    expect(en.player.gateAnd).toBe('and');
  });
});
