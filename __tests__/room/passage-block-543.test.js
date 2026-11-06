// Патч 543: перекрытие проходов (тезис 28) — по слову владельца.
// 1) Данные: пара полей passageBlocked/passageReason на самой локации,
//    без новых сущностей и списков рёбер.
// 2) Эффект: в цепи А–Б–В блок Б = нельзя войти в Б ни из А, ни из В;
//    транзит через Б обрывается, но обходные пути (другой родитель/выход)
//    не пересчитываются и работают. Прямая выдача Мастера — не вход, корень
//    выдачи блок не ломает.
// 3) UI Мастера: в строке названия локации, перед «Параметрами», кнопка
//    «Блокировать» → диалог причины (пусто = «Проход заблокирован»);
//    при блоке кнопка становится «Открыть» (снимает блок, чистит причину).
// 4) UI игрока: экран-дверь (имя, причина, «Назад», без взлома — глухая
//    преграда сильнее замка) и плашка с причиной в списке.
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
    PanResponder: { create: (config) => ({ panHandlers: config }) },
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
import HubTreeView from '../../components/screens/LootTradeScreen/modals/HubTreeView';
import useCharacterStore from '../../src/store/characterStore';
import useRoomStore from '../../src/room/roomStore';
import useUiModeStore from '../../src/room/uiModeStore';
import {
  CONTAINER_KIND,
  normalizeContainerEntity,
  buildLocationSessionNodes,
} from '../../domain/lootTrade';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

// ── Окно игрока ─────────────────────────────────────────────────────────────
// Локация «Бета» перекрыта (глухая преграда), её сундук скрыт до снятия.
const session = (beta = {}) => ({
  sessionId: 'session-543',
  containerId: 'alpha',
  kind: 'hub',
  name: 'Альфа',
  targetType: 'room',
  nodes: [
    {
      containerId: 'beta', kind: 'hub', name: 'Бета',
      parentIds: ['alpha'], childIds: ['chest-beta'], items: [],
      passageBlocked: true, passageReason: 'Обвал',
      ...beta,
    },
    {
      containerId: 'chest-beta', kind: 'loot', name: 'Сундук в Бете',
      parentIds: ['beta'], childIds: [], items: [],
    },
    {
      containerId: 'gamma', kind: 'loot', name: 'Гамма',
      parentIds: ['alpha'], childIds: [], items: [],
    },
  ],
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
        terminalStates: {},
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
// Мок react-native рендерит компонент-обёртку + host-узел: testID виден дважды,
// считаем только host-узлы (как findAllByType в оверлее).
const findAll = (root, testID) => root.findAll(
  (node) => typeof node.type === 'string' && node.props?.testID === testID,
);

describe('543: домен и граф — поля на локации, обрыв транзита, обход не трогаем', () => {
  it('перекрытое звено остаётся «дверью» с причиной, его дети не попадают в сессию', () => {
    const containers = [
      {
        id: 'alpha', kind: CONTAINER_KIND.HUB, name: 'Альфа',
        links: [{ containerId: 'beta', locked: false, lockLabel: '' }],
      },
      {
        id: 'beta', kind: CONTAINER_KIND.HUB, name: 'Бета',
        links: [{ containerId: 'chest-beta', locked: false, lockLabel: '' }],
        passageBlocked: true, passageReason: 'Обвал',
      },
      { id: 'chest-beta', kind: CONTAINER_KIND.LOOT, name: 'Сундук в Бете', items: [] },
    ];
    const nodes = buildLocationSessionNodes(containers[0], containers);
    const beta = nodes.find((n) => n.containerId === 'beta');
    expect(beta).toBeTruthy();
    expect(beta.passageBlocked).toBe(true);
    expect(beta.passageReason).toBe('Обвал');
    // Транзит через Б обрывается: содержимое не выдаётся.
    expect(nodes.find((n) => n.containerId === 'chest-beta')).toBeUndefined();
  });

  it('обходной путь не пересчитывается: ребро мимо блокированного звена работает', () => {
    const containers = [
      {
        id: 'alpha', kind: CONTAINER_KIND.HUB, name: 'Альфа',
        links: [
          { containerId: 'beta', locked: false, lockLabel: '' },
          { containerId: 'chest-beta', locked: false, lockLabel: '' },
        ],
      },
      {
        id: 'beta', kind: CONTAINER_KIND.HUB, name: 'Бета',
        links: [{ containerId: 'chest-beta', locked: false, lockLabel: '' }],
        passageBlocked: true, passageReason: '',
      },
      { id: 'chest-beta', kind: CONTAINER_KIND.LOOT, name: 'Сундук в Бете', items: [] },
    ];
    const nodes = buildLocationSessionNodes(containers[0], containers);
    // Прямое ребро А→сундук не проходит через Б — сундук остаётся.
    expect(nodes.find((n) => n.containerId === 'chest-beta')).toBeTruthy();
    expect(nodes.find((n) => n.containerId === 'beta')?.passageBlocked).toBe(true);
  });

  it('прямая выдача Мастера — не вход: корень выдачи блок не ломает', () => {
    const containers = [
      {
        id: 'beta', kind: CONTAINER_KIND.HUB, name: 'Бета',
        links: [{ containerId: 'chest-beta', locked: false, lockLabel: '' }],
        passageBlocked: true, passageReason: 'Обвал',
      },
      { id: 'chest-beta', kind: CONTAINER_KIND.LOOT, name: 'Сундук в Бете', items: [] },
    ];
    const nodes = buildLocationSessionNodes(containers[0], containers);
    expect(nodes.find((n) => n.containerId === 'chest-beta')).toBeTruthy();
  });

  it('normalizeContainerEntity: пара полей только у локаций, причина чистится', () => {
    const loc = normalizeContainerEntity({ id: 'loc', kind: CONTAINER_KIND.HUB, name: 'Локация' });
    expect(loc.passageBlocked).toBe(false);
    expect(loc.passageReason).toBe('');
    const blocked = normalizeContainerEntity({
      id: 'loc2', kind: CONTAINER_KIND.HUB, name: 'Локация',
      passageBlocked: true, passageReason: '  Обвал  ',
    });
    expect(blocked.passageBlocked).toBe(true);
    expect(blocked.passageReason).toBe('Обвал');
    const chest = normalizeContainerEntity({
      id: 'chest', kind: CONTAINER_KIND.LOOT, name: 'Сундук',
      passageBlocked: true, passageReason: 'x',
    });
    expect(chest.passageBlocked).toBe(false);
    expect(chest.passageReason).toBe('');
  });
});

describe('543: дерево Мастера — кнопка «Блокировать» и диалог причины', () => {
  const setup = () => {
    const nested = normalizeContainerEntity({
      id: 'nested', kind: CONTAINER_KIND.HUB, name: 'nested',
      roomCodes: ['GM-AAA111'], parentLocationId: 'root',
    });
    const chest = normalizeContainerEntity({ id: 'chest', kind: CONTAINER_KIND.LOOT, name: 'chest' });
    const terminal = normalizeContainerEntity({ id: 'terminal', kind: CONTAINER_KIND.TERMINAL, name: 'terminal' });
    const containers = [
      normalizeContainerEntity({
        id: 'root', kind: CONTAINER_KIND.HUB, name: 'root', roomCodes: ['GM-AAA111'],
      }),
      nested, chest, terminal,
    ];
    containers[0].links = [chest, terminal].map((c) => ({
      containerId: c.id, locked: false, lockLabel: '',
    }));
    const onTogglePassage = vi.fn();
    const onOpenSettings = vi.fn();
    let renderer;
    act(() => {
      renderer = create(React.createElement(HubTreeView, {
        hub: containers[0],
        containers,
        keyItems: [],
        onOpenSettings,
        onTogglePassage,
      }));
    });
    return { renderer, containers, nested, onTogglePassage, onOpenSettings };
  };

  it('кнопка есть только у локаций и стоит перед «Параметрами»', () => {
    const { renderer } = setup();
    expect(findAll(renderer.root, 'hub-tree-passage-nested').length).toBeGreaterThan(0);
    // Не у сундука, терминала и прочих не-локаций.
    expect(findAll(renderer.root, 'hub-tree-passage-chest')).toHaveLength(0);
    expect(findAll(renderer.root, 'hub-tree-passage-terminal')).toHaveLength(0);
    expect(findAll(renderer.root, 'hub-tree-passage-root')).toHaveLength(0);
    const ids = renderer.root
      .findAll((node) => typeof node.props?.testID === 'string')
      .map((node) => node.props.testID);
    expect(ids.indexOf('hub-tree-passage-nested'))
      .toBeLessThan(ids.indexOf('hub-tree-parameters-nested'));
  });

  it('диалог причины: пустая причина не подтверждается молча, ОК отдаёт текст', () => {
    const { renderer, nested, onTogglePassage } = setup();
    // Открываем диалог.
    act(() => findAll(renderer.root, 'hub-tree-passage-nested')[0].props.onPress());
    expect(findAll(renderer.root, 'passage-reason-input')).toHaveLength(1);
    // Ввод причины.
    const [input] = findAll(renderer.root, 'passage-reason-input');
    act(() => input.props.onChangeText('Обвал'));
    // Отмена — не блокируем.
    act(() => findAll(renderer.root, 'passage-block-cancel')[0].props.onPress());
    expect(onTogglePassage).not.toHaveBeenCalled();
    expect(findAll(renderer.root, 'passage-reason-input')).toHaveLength(0);
    // Повторно: ОК передаёт причину.
    act(() => findAll(renderer.root, 'hub-tree-passage-nested')[0].props.onPress());
    const [input2] = findAll(renderer.root, 'passage-reason-input');
    act(() => input2.props.onChangeText('Обвал'));
    act(() => findAll(renderer.root, 'passage-block-confirm')[0].props.onPress());
    expect(onTogglePassage).toHaveBeenCalledTimes(1);
    expect(onTogglePassage).toHaveBeenCalledWith(nested, true, 'Обвал');
    expect(findAll(renderer.root, 'passage-reason-input')).toHaveLength(0);
  });

  it('пустая причина уходит пустой строкой (дефолт даёт сервер/клиент)', () => {
    const { renderer, nested, onTogglePassage } = setup();
    act(() => findAll(renderer.root, 'hub-tree-passage-nested')[0].props.onPress());
    act(() => findAll(renderer.root, 'passage-block-confirm')[0].props.onPress());
    expect(onTogglePassage).toHaveBeenCalledWith(nested, true, '');
  });

  it('при блоке кнопка становится «Открыть» и снимает блок без диалога', () => {
    const { renderer, containers, onTogglePassage } = setup();
    const nested = containers.find((c) => c.id === 'nested');
    nested.passageBlocked = true;
    nested.passageReason = 'Обвал';
    let rerender;
    act(() => {
      rerender = create(React.createElement(HubTreeView, {
        hub: containers[0],
        containers,
        keyItems: [],
        onOpenSettings: vi.fn(),
        onTogglePassage,
      }));
    });
    const [button] = findAll(rerender.root, 'hub-tree-passage-nested');
    expect(button).toBeTruthy();
    act(() => button.props.onPress());
    expect(onTogglePassage).toHaveBeenCalledWith(nested, false, '');
    // Диалог не открывался.
    expect(findAll(rerender.root, 'passage-reason-input')).toHaveLength(0);
  });
});

describe('543: окно игрока — дверь и плашка', () => {
  it('в списке плашка с причиной, содержимое перекрытого звена скрыто', async () => {
    const renderer = await mount(session());
    const text = allText(renderer);
    expect(text).toContain('Бета');
    expect(text).toContain('Гамма');
    expect(text).not.toContain('Сундук в Бете');
    const [badge] = findAll(renderer.root, 'passage-blocked-hint-beta');
    expect(badge).toBeTruthy();
    expect(String(badge.props.children)).toContain('Обвал');
    await act(async () => renderer.unmount());
  });

  it('вход ведёт на экран-дверь: причина, «Назад», без взлома и детей', async () => {
    const renderer = await mount(session());
    await tap(renderer, 'hub-node-enter-beta');
    const text = allText(renderer);
    expect(findAll(renderer.root, 'passage-blocked-screen').length).toBeGreaterThan(0);
    const [reason] = findAll(renderer.root, 'passage-blocked-reason');
    expect(String(reason.props.children)).toContain('Обвал');
    // Глухая преграда сильнее замка: кнопок взлома/ограничений нет.
    expect(renderer.root.findAllByProps({ testID: 'current-gate-option-beta' })).toHaveLength(0);
    expect(renderer.root.findAll((n) => String(n.props.testID || '').startsWith('current-gate-hack-'))).toHaveLength(0);
    expect(text).not.toContain('Сундук в Бете');
    // «Назад» возвращает в родителя.
    await tap(renderer, 'passage-blocked-back');
    expect(findAll(renderer.root, 'passage-blocked-screen')).toHaveLength(0);
    expect(allText(renderer)).toContain('Альфа');
    await act(async () => renderer.unmount());
  });

  it('без причины игрок видит дефолт «Проход заблокирован»', async () => {
    const renderer = await mount(session({ passageReason: '' }));
    const [badge] = findAll(renderer.root, 'passage-blocked-hint-beta');
    expect(String(badge.props.children)).toMatch(/Проход заблокирован|Passage blocked/);
    await act(async () => renderer.unmount());
  });

  it('замок на перекрытой локации не даёт взлома: подпись входа обычная', async () => {
    const renderer = await mount(session({ locked: true, linkedCheckIds: ['term-543'] }));
    const text = allText(renderer);
    expect(text).toContain('Обвал');
    // Подсказка замка под плашкой не показывается — блок сильнее.
    expect(text).not.toMatch(/Требуется взлом|Requires lockpicking/);
    const [enterBtn] = findAll(renderer.root, 'hub-node-enter-beta');
    expect(enterBtn).toBeTruthy();
    const label = enterBtn.findAllByType('Text')
      .map((node) => String(node.props.children ?? '')).join('');
    expect(label).toMatch(/Войти|Enter/);
    expect(label).not.toMatch(/Взломать|Hack/);
    await act(async () => renderer.unmount());
  });
});

describe('543: контракт по файлам', () => {
  const domain = read('domain/lootTrade.js');
  const graph = read('server/locationGraph.js');
  const sessionSrc = read('server/lootTradeSession.js');
  const screen = read('components/screens/LootTradeScreen/LootTradeScreen.js');
  const tree = read('components/screens/LootTradeScreen/modals/HubTreeView.js');
  const overlay = read('components/lootTrade/PlayerLootTradeOverlay.js');
  const ru = JSON.parse(read('i18n/ru-RU/screens/lootTrade/screen.json'));
  const en = JSON.parse(read('i18n/en-EN/screens/lootTrade/screen.json'));

  it('данные — пара полей на локации, без новых сущностей', () => {
    expect(domain).toContain('passageBlocked: kind === CONTAINER_KIND.HUB');
    expect(domain).toContain('passageReason: kind === CONTAINER_KIND.HUB');
    expect(domain).toContain('passageBlocked: Boolean(child.passageBlocked)');
    expect(sessionSrc).toContain('passageBlocked: Boolean(source.passageBlocked)');
    expect(sessionSrc).toContain('node.locked || node.passageBlocked');
    expect(graph).toContain('passageBlocked: Boolean(raw.passageBlocked)');
    expect(graph).toContain('Boolean(node.passageBlocked) && id !== root');
  });

  it('Мастер: кнопка в строке перед «Параметрами», синк живой сессии пересбором', () => {
    expect(tree).toContain('hub-tree-passage-');
    expect(tree).toContain('onTogglePassage');
    expect(tree).toContain('passage-block-confirm');
    expect(tree).toContain("container.passageBlocked ? 'detail.passageOpen' : 'detail.passageBlock'");
    expect(screen).toContain('handleTogglePassage');
    expect(screen).toContain('passageBlocked: Boolean(blocked)');
    expect(screen).toContain('buildLocationSessionNodes(rootContainer, freshList)');
  });

  it('игрок: gate-first двери и плашка в списке', () => {
    expect(overlay).toContain('currentPassageBlocked');
    expect(overlay).toContain('testID="passage-blocked-screen"');
    expect(overlay).toContain('passage-blocked-back');
    expect(overlay).toContain('passage-blocked-hint-');
    expect(overlay).toContain("tLootTrade('player.passageBlocked')");
  });

  it('словари RU/EN парные, формулировки владельца дословно', () => {
    expect(Object.keys(ru.detail).sort()).toEqual(Object.keys(en.detail).sort());
    expect(Object.keys(ru.player).sort()).toEqual(Object.keys(en.player).sort());
    expect(ru.detail.passageBlock).toBe('Блокировать');
    expect(ru.detail.passageOpen).toBe('Открыть');
    expect(ru.player.passageBlocked).toBe('Проход заблокирован');
    expect(en.player.passageBlocked).toBe('Passage blocked');
  });
});
