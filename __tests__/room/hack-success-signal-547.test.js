// Патч 547: успешный взлом передаётся дальше и не порождает ещё попытку.
//
// Слово владельца: «я взломал замок, модалка взлома предложила ещё попытку —
// "успешные попытки" не должны вызывать ещё попытку. Из-за того, что модалка
// взлома не передала данные о взломе, я не могу пройти дальше. Тоже самое с
// терминалом должно быть — показан, успех, кнопка закрыть — передача сигнала
// об успешном взломе — доступ к содержимому».
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { create, act } from 'react-test-renderer';
import {
  CONTAINER_KIND,
  buildLocationSessionNodes,
  normalizeContainerEntity,
} from '../../domain/lootTrade.js';
import { applyLockAction, createLockGame } from '../../server/lockPicking.js';
import { ERROR_CODE } from '../../server/protocol.js';
import { createRoomRegistry } from '../../server/roomRegistry.js';
import {
  initialLocalLockState,
  applyLocalLockAction,
  clearLocalLockState,
} from '../../components/lootTrade/localLockGame.js';
import {
  recordLocalCheckAccess,
  hasLocalCheckAccess,
  clearLocalCheckAccess,
  localCheckAccessSnapshot,
} from '../../components/lootTrade/localCheckAccess.js';
import { hackSuccessKey, isHackWon } from '../../components/lootTrade/hackOutcome.js';
import { makeCheckToken } from '../../server/accessExpression.js';

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
    Pressable: host('Pressable'),
    ScrollView: host('ScrollView'),
    Image: host('Image'),
    Animated: {
      View: host('AnimatedView'),
      Value: class { constructor() { this.value = 0; } setValue(v) { this.value = v; } interpolate() { return 0; } },
      timing: () => ({ start: () => {} }),
    },
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
vi.mock('../../components/alerts/alertService', () => ({ showRawAlert: vi.fn(async () => 0) }));
vi.mock('../../src/saves/characterSaves', () => ({ loadCharacter: vi.fn(async () => true) }));
vi.mock('../../src/room/roomCharacterSync', () => ({ pushSavedCharacterToBoundRoomIfAny: vi.fn(async () => true) }));
vi.mock('../../components/lootTrade/spendBobbyPins', () => ({ spendBobbyPins: vi.fn(async () => true) }));
vi.mock('../../src/lootTrade/grantCharacterItems', () => ({
  applyCommittedMerchantTradeToCharacter: vi.fn(),
  getSellablePlayerInventoryItems: vi.fn(() => []),
  grantLootEntriesToCharacter: vi.fn(),
}));
vi.mock('../../modules/fallout/assets/backgrounds/caps.png', () => ({ default: 'caps.png' }));
vi.mock('../../assets/CD.png', () => ({ default: 'cd.png' }));
vi.mock('../../components/lootTrade/StandaloneCheckModal', () => ({
  default: ({ visible }) => React.createElement('StandaloneCheckModal', { visible }),
}));
// Модалки-двойники передают ТОТ ЖЕ контракт (onHacked + onClose), что и
// настоящие: настоящие проверяются отдельными наборами ниже, а здесь важен
// приём сигнала окном игрока. Проводка реальных модалок страхуется тестом
// «окно игрока передаёт сигнал обоим видам проверки» по исходникам.
vi.mock('../../components/lootTrade/LockPickingModal', () => ({
  default: ({ lock, onHacked, onClose }) => React.createElement('View', null,
    React.createElement('TouchableOpacity', {
      testID: 'stub-lock-win',
      onPress: () => onHacked?.({ containerId: lock?.containerId, kind: 'lock', local: true }),
    }),
    React.createElement('TouchableOpacity', { testID: 'stub-lock-close', onPress: () => onClose?.() })),
}));
vi.mock('../../components/lootTrade/TerminalHackingModal', () => ({
  default: ({ terminal, onHacked, onClose }) => React.createElement('View', null,
    React.createElement('TouchableOpacity', {
      testID: 'stub-terminal-win',
      onPress: () => onHacked?.({ containerId: terminal?.containerId, kind: 'terminal', local: true }),
    }),
    React.createElement('TouchableOpacity', { testID: 'stub-terminal-close', onPress: () => onClose?.() })),
}));

import PlayerLootTradeOverlay from '../../components/lootTrade/PlayerLootTradeOverlay.js';
import useCharacterStore from '../../src/store/characterStore.js';
import useRoomStore from '../../src/room/roomStore.js';
import useUiModeStore from '../../src/room/uiModeStore.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');
const json = (rel) => JSON.parse(read(rel));

const LOCK = { containerId: 'hatch', name: 'Запертый люк', difficulty: 1, kind: 'lock' };
const SNAPSHOT = {
  characterName: 'Сталкер',
  attributes: [{ name: 'PER', value: 10 }, { name: 'LCK', value: 4 }],
  skills: [{ name: 'LOCKPICK', value: 4 }],
  items: { pin: { id: 'pin', weaponId: 'item_bobby_pin', quantity: 30 } },
};

const winLocalBoard = (containerId) => {
  clearLocalLockState(containerId);
  const ctx = { lock: { ...LOCK, containerId }, characterId: 'ch1', characterSnapshot: SNAPSHOT, rng: () => 0 };
  let state = applyLocalLockAction(initialLocalLockState(containerId), 'start', undefined, ctx);
  for (let i = 0; i < 24 && state.game?.status === 'playing'; i += 1) {
    state = applyLocalLockAction(state, 'press', 'left', ctx);
  }
  return { state, ctx };
};

describe('547: успешный взлом не порождает ещё попытку', () => {
  it('движок: newAttempt после победы отказывает и не меняет доску', () => {
    let game = createLockGame({
      config: LOCK, operatorClientId: 'p1', operatorCharacterId: 'ch1',
      characterSnapshot: SNAPSHOT, rng: () => 0,
    });
    for (let i = 0; i < 24 && game.status === 'playing'; i += 1) {
      game = applyLockAction({
        game, config: LOCK, action: 'press', value: 'left',
        clientId: 'p1', characterId: 'ch1', characterSnapshot: SNAPSHOT, rng: () => 0,
      }).game;
    }
    expect(game.status).toBe('won');
    const revision = game.revision;
    const secret = [...game.secret];
    const refused = applyLockAction({
      game, config: LOCK, action: 'newAttempt',
      clientId: 'p1', characterId: 'ch1', characterSnapshot: SNAPSHOT, rng: () => 0,
    });
    expect(refused.error).toBe('LOCK_ALREADY_WON');
    expect(refused.game.status).toBe('won');
    expect(refused.game.revision).toBe(revision);
    expect(refused.game.secret).toEqual(secret);
    expect(ERROR_CODE.LOCK_ALREADY_WON).toBe('LOCK_ALREADY_WON');
  });

  it('сервер комнат: победа оконечна, новую партию даёт только Мастер', () => {
    const registry = createRoomRegistry({ now: () => 1000, rng: () => 0 });
    const { room } = registry.createRoom({ clientId: 'gm', name: 'Стол' });
    const code = room.code;
    registry.joinRoom({ code, clientId: 'gm', name: 'GM', role: 'gm' });
    registry.joinRoom({ code, clientId: 'p1', name: 'Игрок', role: 'player' });
    registry.putSnapshot({
      code, characterId: 'ch1', revision: 1, fromClientId: 'p1', fromName: 'Игрок',
      snapshot: { name: 'Сталкер', data: { ...SNAPSHOT, equipment: { items: [{ id: 'pin', weaponId: 'item_bobby_pin', quantity: 30 }] } } },
    });
    registry.issueTerminal({ code, clientId: 'gm', config: LOCK });
    const act = (action, value, clientId = 'p1') => registry.terminalAction({
      code, clientId, characterId: 'ch1', containerId: 'hatch', action, value,
    });
    const entry = () => registry.getState(code).terminalStates.hatch;
    expect(act('start').error).toBeUndefined();
    for (let i = 0; i < 24 && entry().game.status === 'playing'; i += 1) act('press', 'left');
    expect(entry().game.status).toBe('won');
    expect(act('newAttempt').error).toBe(ERROR_CODE.LOCK_ALREADY_WON);
    expect(entry().game.status).toBe('won');
    expect(registry.getState(code).accessEvents.hatch).toMatchObject({ kind: 'hacked' });
    expect(act('reissue', undefined, 'gm').error).toBeUndefined();
    expect(entry().game).toBeNull();
    expect(act('newAttempt').error).toBeUndefined();
    expect(entry().game.status).toBe('playing');
  });

  it('локальный резерв: победа не пересобирается новым подходом', () => {
    const { state, ctx } = winLocalBoard('local-547');
    expect(state.game.status).toBe('won');
    const next = applyLocalLockAction(state, 'newAttempt', undefined, ctx);
    expect(next.error).toBe('LOCK_ALREADY_WON');
    expect(next.game.status).toBe('won');
    expect(next.game.secret).toEqual(state.game.secret);
    clearLocalLockState('local-547');
  });
});

describe('547: журнал локально пройденных проверок', () => {
  beforeEach(() => clearLocalCheckAccess({}));

  it('запись идемпотентна и различает комнаты', () => {
    expect(hasLocalCheckAccess({ roomCode: 'R1', containerId: 'hatch' })).toBe(false);
    expect(recordLocalCheckAccess({ roomCode: 'R1', containerId: 'hatch', kind: 'lock' })).toBe(true);
    expect(recordLocalCheckAccess({ roomCode: 'R1', containerId: 'hatch', kind: 'lock' })).toBe(false);
    expect(hasLocalCheckAccess({ roomCode: 'R1', containerId: 'hatch' })).toBe(true);
    expect(hasLocalCheckAccess({ roomCode: 'R2', containerId: 'hatch' })).toBe(false);
    expect(localCheckAccessSnapshot()).toHaveLength(1);
    clearLocalCheckAccess({ roomCode: 'R1', containerId: 'hatch' });
    expect(hasLocalCheckAccess({ roomCode: 'R1', containerId: 'hatch' })).toBe(false);
  });

  it('пустая точка не записывается, сброс комнаты не задевает соседнюю', () => {
    expect(recordLocalCheckAccess({ roomCode: 'R1', containerId: '  ' })).toBe(false);
    recordLocalCheckAccess({ roomCode: 'R1', containerId: 'a' });
    recordLocalCheckAccess({ roomCode: 'R2', containerId: 'b' });
    clearLocalCheckAccess({ roomCode: 'R1' });
    expect(hasLocalCheckAccess({ roomCode: 'R1', containerId: 'a' })).toBe(false);
    expect(hasLocalCheckAccess({ roomCode: 'R2', containerId: 'b' })).toBe(true);
  });

  it('ключ победы отличает одну трансляцию от другой', () => {
    expect(isHackWon({ status: 'won' })).toBe(true);
    expect(isHackWon({ status: 'playing' })).toBe(false);
    expect(isHackWon(null)).toBe(false);
    expect(hackSuccessKey('hatch', { revision: 2 }, 'b1')).toBe('hatch|b1|2');
    expect(hackSuccessKey('hatch', { revision: 3 }, 'b1')).not.toBe(hackSuccessKey('hatch', { revision: 2 }, 'b1'));
  });
});

// ── Окно игрока: локальный резерв, сервер без протокола мини-игр ────────────
const cards = () => [
  normalizeContainerEntity({
    id: 'diamond', kind: CONTAINER_KIND.HUB, name: 'Даймонд-сити',
    links: [{ containerId: 'basement', locked: false }],
  }),
  normalizeContainerEntity({
    id: 'basement', kind: CONTAINER_KIND.HUB, name: 'Подвал доктора',
    parentLocationId: 'diamond',
    accessExpression: [makeCheckToken('hatch')], linkedCheckIds: ['hatch'],
    links: [{ containerId: 'doctor', locked: false }, { containerId: 'hatch', locked: false }],
  }),
  normalizeContainerEntity({
    id: 'doctor', kind: CONTAINER_KIND.MERCHANT, name: 'Безумный доктор', caps: 100,
    items: [{ entryId: 'med1', itemType: 'chem', name: 'Стимулятор', quantity: 5, cost: 10 }],
  }),
  normalizeContainerEntity({ id: 'hatch', kind: CONTAINER_KIND.LOCK, name: 'Запертый люк', difficulty: 1 }),
];

/** Старый сервер: kind понижен, locked потерян, протокола мини-игр нет. */
const legacySession = () => {
  const all = cards();
  const root = all.find((c) => c.id === 'diamond');
  return {
    sessionId: 'ui-547', containerId: 'diamond', kind: 'hub', name: 'Даймонд-сити', targetType: 'room',
    nodes: buildLocationSessionNodes(root, all).map((node) => ({
      containerId: node.containerId,
      kind: 'loot',
      name: node.name,
      description: node.description,
      locked: false,
      lockLabel: String(node.lockLabel || '').trim(),
      caps: node.caps || 0,
      items: node.items || [],
    })),
  };
};

const mountOverlay = async () => {
  useUiModeStore.setState({ tabUiMode: 'user', gmInspectingCharacter: false });
  useCharacterStore.setState({ currentCharacterId: 'player-char', characterName: 'Player', items: {}, currency: 0 });
  useRoomStore.setState({
    clientId: 'player-client', status: 'online',
    rooms: {
      ROOM1: {
        joined: true,
        members: [{ clientId: 'player-client', role: 'player' }],
        // Ни capabilities.terminalHacking, ни terminalStates: локальный резерв.
        capabilities: {},
        activeSession: legacySession(),
        terminalStates: {},
        accessEvents: {},
      },
    },
  });
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(PlayerLootTradeOverlay));
    await Promise.resolve();
  });
  return renderer;
};
const tap = async (renderer, testID) => {
  const [button] = renderer.root.findAllByType('TouchableOpacity').filter((n) => n.props.testID === testID);
  expect(button, testID).toBeTruthy();
  await act(async () => { button.props.onPress(); await Promise.resolve(); });
};
const allText = (renderer) => renderer.root.findAllByType('Text').map((n) => String(n.props.children ?? '')).join(' | ');

describe('547: сигнал о взломе открывает путь дальше (локальный резерв)', () => {
  beforeEach(() => clearLocalCheckAccess({}));

  it('до сигнала содержимое запертой локации скрыто', async () => {
    const renderer = await mountOverlay();
    await tap(renderer, 'hub-node-enter-basement');
    expect(renderer.root.findAllByProps({ testID: 'current-gate-hack-hatch' }).length).toBeGreaterThan(0);
    expect(allText(renderer)).not.toContain('Безумный доктор');
    await act(async () => renderer.unmount());
  });

  it('успех → «Закрыть» → содержимое локации доступно', async () => {
    const renderer = await mountOverlay();
    await tap(renderer, 'hub-node-enter-basement');
    await tap(renderer, 'current-gate-hack-hatch');
    await tap(renderer, 'stub-lock-win');
    expect(hasLocalCheckAccess({ roomCode: 'ROOM1', containerId: 'hatch' })).toBe(true);
    await tap(renderer, 'stub-lock-close');
    expect(allText(renderer)).toContain('Безумный доктор');
    expect(renderer.root.findAllByProps({ testID: 'current-gate-hack-hatch' })).toHaveLength(0);
    await act(async () => renderer.unmount());
  });

  it('закрытие БЕЗ победы не открывает локацию', async () => {
    const renderer = await mountOverlay();
    await tap(renderer, 'hub-node-enter-basement');
    await tap(renderer, 'current-gate-hack-hatch');
    await tap(renderer, 'stub-lock-close');
    expect(allText(renderer)).not.toContain('Безумный доктор');
    expect(renderer.root.findAllByProps({ testID: 'current-gate-hack-hatch' }).length).toBeGreaterThan(0);
    await act(async () => renderer.unmount());
  });

  it('сигнал терминала работает так же, как сигнал замка', async () => {
    const all = cards();
    all[1] = normalizeContainerEntity({
      ...all[1], accessExpression: [makeCheckToken('term-1')], linkedCheckIds: ['term-1'],
      links: [{ containerId: 'doctor', locked: false }, { containerId: 'term-1', locked: false }],
    });
    all.push(normalizeContainerEntity({ id: 'term-1', kind: CONTAINER_KIND.TERMINAL, name: 'Терминал подвала', difficulty: 1 }));
    const root = all.find((c) => c.id === 'diamond');
    const session = {
      ...legacySession(),
      nodes: buildLocationSessionNodes(root, all).map((node) => ({
        containerId: node.containerId, kind: 'loot', name: node.name, description: node.description,
        locked: false, lockLabel: String(node.lockLabel || '').trim(), caps: node.caps || 0, items: node.items || [],
      })),
    };
    const renderer = await mountOverlay();
    await act(async () => {
      useRoomStore.setState((state) => ({
        rooms: { ...state.rooms, ROOM1: { ...state.rooms.ROOM1, activeSession: session } },
      }));
      await Promise.resolve();
    });
    await tap(renderer, 'hub-node-enter-basement');
    await tap(renderer, 'current-gate-hack-term-1');
    await tap(renderer, 'stub-terminal-win');
    await tap(renderer, 'stub-terminal-close');
    expect(allText(renderer)).toContain('Безумный доктор');
    await act(async () => renderer.unmount());
  });

  it('окно игрока передаёт сигнал обоим видам проверки', () => {
    const overlay = read('components/lootTrade/PlayerLootTradeOverlay.js');
    expect(overlay).toContain('onHacked={handleCheckHacked}');
    expect(overlay).toContain('onClose={handleCheckModalClose}');
    expect(overlay).toContain('recordLocalCheckAccess');
    expect(overlay).toContain('hasLocalCheckAccess');
    // Журнал локального резерва не подменяет серверное решение.
    expect(overlay).toContain('if (roomHasTerminalProtocol(room)) return false;');
  });

  it('парные строки успеха и закрытия на месте', () => {
    const ru = json('i18n/ru-RU/screens/lootTrade/screen.json');
    const en = json('i18n/en-EN/screens/lootTrade/screen.json');
    expect(ru.lock.wonClose).toBe('Закрыть');
    expect(en.lock.wonClose).toBe('Close');
    expect(ru.terminal.wonClose).toBe('Закрыть');
    expect(en.terminal.wonClose).toBe('Close');
    expect(ru.lock.wonAccessHint).toContain('Закройте окно');
    expect(en.terminal.wonAccessHint).toContain('Close this window');
    const lockModal = read('components/lootTrade/LockPickingModal.js');
    const termModal = read('components/lootTrade/TerminalHackingModal.js');
    expect(lockModal).toContain('lock-success-close');
    expect(termModal).toContain('terminal-success-close');
    // Панель успеха замка больше не предлагает «Ещё подход».
    const wonPanel = lockModal.slice(
      lockModal.indexOf('testID="lock-won-panel"'),
      lockModal.indexOf(') : (isClosed && !holdBoard) ? ('),
    );
    expect(wonPanel.length).toBeGreaterThan(0);
    expect(wonPanel).toContain('lock-success-close');
    expect(wonPanel).not.toContain('newAttemptButton');
  });
});
