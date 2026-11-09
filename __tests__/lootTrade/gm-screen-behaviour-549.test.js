// ПРИЁМОЧНЫЙ (патч 549): удалить при конверсии/приживании.
//
// Патч 549: мастерский экран проверяется ПОВЕДЕНИЕМ, а не наличием строк.
//
// Зачем. Аудит после бага 548 показал: ни один тест не монтировал
// `LootTradeScreen` (2733 строки, 27 состояний). Двадцать файлов читали его как
// ТЕКСТ (`expect(read(...)).toContain('{onDragStart && (')`). Такая проверка
// проходит и на мёртвом коде — строка на месте, обработчик не работает. Окно
// игрока при этом монтировали 10 тестов, отсюда и ощущение «в юзере отработано,
// а в мастере лезет».
//
// Здесь экран монтируется по-настоящему, жест прогоняется в РЕАЛЬНОМ порядке
// опроса ответственности RN (capture принимает решение до bubble) и проверяется
// результат в БД, а не текст исходника.
import { describe, expect, it, beforeEach, vi } from 'vitest';
import React from 'react';
import { create, act } from 'react-test-renderer';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({
  cards: [],
  keyItems: [],
  saved: [],
  bounds: {},
}));

vi.mock('react-native', () => {
  const React = require('react');
  const host = (name) => ({ children, ...props }) => React.createElement(name, props, children);
  // Мок умеет мерить границы по адресу элемента: и View (строки дерева),
  // и TouchableOpacity (карточки сетки — цель сброса берётся с корня карточки).
  const measurable = (name) => React.forwardRef(({ children, ...props }, ref) => {
    React.useImperativeHandle(ref, () => ({
      measureInWindow: (cb) => {
        const b = h.bounds[props.testID] || { x: 0, y: 0, width: 200, height: 120 };
        cb(b.x, b.y, b.width, b.height);
      },
    }));
    return React.createElement(name, props, children);
  });
  const View = measurable('View');
  const TouchableOpacity = measurable('TouchableOpacity');
  return {
    Platform: { OS: 'web', select: (o) => o.web ?? o.default },
    StyleSheet: {
      create: (s) => s,
      flatten: (s) => (Array.isArray(s) ? Object.assign({}, ...s.filter(Boolean)) : s || {}),
      hairlineWidth: 1,
    },
    Dimensions: { get: () => ({ width: 1200, height: 900 }) },
    useWindowDimensions: () => ({ width: 1200, height: 900 }),
    Modal: ({ visible, children, ...props }) => (visible ? React.createElement('Modal', props, children) : null),
    View,
    Text: host('Text'),
    TextInput: host('TextInput'),
    TouchableOpacity,
    Pressable: host('Pressable'),
    ScrollView: host('ScrollView'),
    ActivityIndicator: host('ActivityIndicator'),
    Image: host('Image'),
    // Патч 563: мок повторяет НАСТОЯЩИЙ PanResponder. `panHandlers` — это
    // пропсы системы ответственности (`onStartShouldSetResponder*`), они зовут
    // обработчики конфига (`onStartShouldSetPanResponder*`). Пока мок отдавал
    // конфиг как есть, тест одобрял хук, у которого нагрузка строки не
    // заявлялась вообще, — и ручка дерева была мертва в бою (548/549).
    PanResponder: {
      create: (config) => ({
        panHandlers: {
          onStartShouldSetResponder: (e) => (config.onStartShouldSetPanResponder
            ? config.onStartShouldSetPanResponder(e) : false),
          onStartShouldSetResponderCapture: (e) => (config.onStartShouldSetPanResponderCapture
            ? config.onStartShouldSetPanResponderCapture(e) : false),
          onMoveShouldSetResponder: (e) => (config.onMoveShouldSetPanResponder
            ? config.onMoveShouldSetPanResponder(e) : false),
          onMoveShouldSetResponderCapture: (e) => (config.onMoveShouldSetPanResponderCapture
            ? config.onMoveShouldSetPanResponderCapture(e) : false),
          onResponderGrant: (e, g) => config.onPanResponderGrant?.(e, g),
          onResponderMove: (e, g) => config.onPanResponderMove?.(e, g),
          onResponderRelease: (e, g) => config.onPanResponderRelease?.(e, g),
          onResponderTerminate: (e) => config.onPanResponderTerminate?.(e),
          onResponderReject: (e) => config.onPanResponderReject?.(e),
          onResponderTerminationRequest: () => config.onPanResponderTerminationRequest?.() ?? true,
          onShouldBlockNativeResponder: () => config.onShouldBlockNativeResponder?.() ?? false,
        },
      }),
    },
  };
});

vi.mock('@expo/vector-icons', () => ({
  MaterialCommunityIcons: (props) => React.createElement('MaterialCommunityIcons', props),
  FontAwesome5: (props) => React.createElement('FontAwesome5', props),
}));
vi.mock('@react-navigation/native', () => ({
  useFocusEffect: (cb) => { React.useEffect(() => { cb(); }, [cb]); },
}));

vi.mock('../../db', () => ({
  getGmContainersList: vi.fn(async () => h.cards),
  getGmKeyItems: vi.fn(async () => h.keyItems),
  getCharacterFolders: vi.fn(async () => [{ id: 'f1', name: 'Кампания' }]),
  getFolderRooms: vi.fn(async () => [{ folder_id: 'f1', code: 'ROOM1', owner_token: 't1' }]),
  getGmContainerById: vi.fn(async (id) => h.cards.find((c) => c.id === id) || null),
  saveGmContainer: vi.fn(async (card) => {
    h.saved.push(card);
    const idx = h.cards.findIndex((c) => c.id === card.id);
    if (idx >= 0) h.cards[idx] = card; else h.cards.push(card);
    return card;
  }),
  saveGmKeyItem: vi.fn(async (item) => item),
  deleteGmContainer: vi.fn(async () => {}),
  duplicateGmContainer: vi.fn(async (id) => ({ ...h.cards.find((c) => c.id === id), id: `${id}-copy` })),
}));

vi.mock('../../i18n/locale', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useLocale: () => 'ru-RU', useModuleLocale: () => 'ru-RU' };
});
vi.mock('../../components/screens/LootTradeScreen/logic/lootTradeI18n', () => ({
  tLootTrade: (key) => key,
  formatLootTrade: (key) => key,
}));
vi.mock('../../components/screens/HomeScreen/logic/homeScreenI18n', () => ({ tHomeScreen: (key) => key }));
vi.mock('../../components/screens/HomeScreen/logic/localeLabel', () => ({ getLocaleLabel: () => 'Русский' }));

vi.mock('../../src/store/appSettingsStore', () => {
  const use = (sel) => sel({ setValue: vi.fn() });
  use.getState = () => ({ setValue: vi.fn() });
  return { default: use };
});
vi.mock('../../src/room/uiModeStore', () => {
  const state = { tabUiMode: 'gm', gmInspectingCharacter: false, setTabUiMode: vi.fn(), setGmInspectingCharacter: vi.fn() };
  const use = (sel) => sel(state);
  use.getState = () => state;
  return { default: use };
});
vi.mock('../../src/room/roomStore', () => {
  const state = { rooms: {}, status: 'offline' };
  const use = (sel) => sel(state);
  use.getState = () => state;
  return { default: use, roomSupportsTerminalProtocol: () => false };
});
vi.mock('../../src/room/roomCharacterSync', () => ({ buildGmRoomCharacterCards: () => [] }));

vi.mock('../../components/cloudSync/googleDriveSync', () => ({
  syncGmContainerToCloudIfEnabled: vi.fn(),
  syncAllCharactersWithCloud: vi.fn(async () => {}),
  deleteGmContainerFromCloudIfEnabled: vi.fn(async () => {}),
  openCloudFolderInDrive: vi.fn(),
}));
vi.mock('../../components/alerts/alertService', () => ({
  confirmAlert: vi.fn(async () => true),
  showAlert: vi.fn(),
  showRawAlert: vi.fn(),
}));
vi.mock('../../src/lootTrade/gmSessionPersistence', () => ({
  flushPendingEmptyLootPrompts: vi.fn(async () => {}),
  subscribeGmContainerUpdates: () => () => {},
}));
vi.mock('../../src/premium/adminAccessGate', async (importOriginal) => ({
  ...(await importOriginal()),
  guardAdminAction: () => true,
  useAdminAccess: () => ({
    adminLicensed: true, gmCampaignsLicensed: true, gmLootTradeLicensed: true, gmEnvCombatLicensed: true,
  }),
}));

vi.mock('../../modules/fallout/assets/backgrounds/caps.png', () => ({ default: 'caps.png' }));
vi.mock('../../assets/CD.png', () => ({ default: 'cd.png' }));

// Тяжёлые модалки не участвуют в проверках жеста —глушим их, чтобы тест
// проверял экран, а не формы. Карточки и дерево остаются НАСТОЯЩИМИ.
vi.mock('../../components/screens/LootTradeScreen/modals/ContainerFormModal', () => ({
  default: () => React.createElement('ContainerFormModal'),
}));
vi.mock('../../components/screens/LootTradeScreen/modals/KeyItemFormModal', () => ({
  default: () => React.createElement('KeyItemFormModal'),
}));
vi.mock('../../components/screens/LootTradeScreen/modals/ContainerCatalogModal', () => ({
  default: () => React.createElement('ContainerCatalogModal'),
}));
vi.mock('../../components/screens/LootTradeScreen/modals/ContainerItemConfigModal', () => ({
  default: () => React.createElement('ContainerItemConfigModal'),
}));
vi.mock('../../components/screens/LootTradeScreen/modals/IssueContainerModal', () => ({
  default: () => React.createElement('IssueContainerModal'),
}));
vi.mock('../../components/screens/LootTradeScreen/modals/HubChildPickerModal', () => ({
  default: () => React.createElement('HubChildPickerModal'),
}));
vi.mock('../../components/lootTrade/PartyStorageModal', () => ({
  default: () => React.createElement('PartyStorageModal'),
}));

import LootTradeScreen from '../../components/screens/LootTradeScreen/LootTradeScreen.js';
import * as db from '../../db';
import { CONTAINER_KIND, normalizeContainerEntity } from '../../domain/lootTrade.js';

const hub = (id, extra = {}) => normalizeContainerEntity({
  id, kind: CONTAINER_KIND.HUB, name: id, inRoot: true, ...extra,
});
const loot = (id, extra = {}) => normalizeContainerEntity({
  id, kind: CONTAINER_KIND.LOOT, name: id, inRoot: true, items: [], ...extra,
});

const findAll = (root, testID) => root.findAll((n) => n.props?.testID === testID);
const one = (root, testID) => {
  const [node] = findAll(root, testID);
  expect(node, testID).toBeTruthy();
  return node;
};

const mountScreen = async () => {
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(LootTradeScreen));
    await Promise.resolve();
    await Promise.resolve();
  });
  return renderer;
};

/**
 * Опрос ответственности как в RN: capture идёт первым и принимает решение
 * сразу; bubble зовётся только если capture отказался. Тест 545 звал bubble
 * руками и потому не увидел мёртвую ручку (баг 548).
 */
const touchEvent = () => ({
  nativeEvent: { touches: [1] },
  touchHistory: { numberActiveTouches: 1, mostRecentTimeStamp: 1 },
});

const negotiate = (handle) => {
  // RN опрашивает только пропсы системы ответственности.
  if (handle.props.onStartShouldSetResponderCapture?.(touchEvent()) === true) return 'capture';
  if (handle.props.onStartShouldSetResponder?.(touchEvent()) === true) return 'bubble';
  return null;
};

const dragTo = async (renderer, handleTestID, target, { move = true } = {}) => {
  const handle = one(renderer.root, handleTestID);
  let phase = null;
  await act(async () => {
    phase = negotiate(handle);
    handle.props.onResponderGrant({ touchHistory: { numberActiveTouches: 1 } }, { x0: 0, y0: 0 });
    await Promise.resolve();
  });
  if (move) {
    await act(async () => {
      handle.props.onResponderMove({ touchHistory: { numberActiveTouches: 1, mostRecentTimeStamp: 2 } }, { moveX: target.x + 5, moveY: target.y + 5 });
      await Promise.resolve();
    });
  }
  await act(async () => {
    handle.props.onResponderRelease({}, { moveX: target.x + 5, moveY: target.y + 5 });
    await Promise.resolve();
    await Promise.resolve();
  });
  return phase;
};

beforeEach(() => {
  h.cards = [];
  h.keyItems = [];
  h.saved = [];
  h.bounds = {};
  vi.clearAllMocks();
});

describe('549: мастерский экран монтируется и показывает карточки', () => {
  it('экран впервые рендерится по-настоящему и рисует карточки из БД', async () => {
    h.cards = [hub('town'), loot('chest'), loot('barrel')];
    const renderer = await mountScreen();
    // Ручки переноса есть у КАЖДОЙ карточки, включая локацию-хаб (канон 539).
    expect(findAll(renderer.root, 'card-drag-town').length).toBeGreaterThan(0);
    expect(findAll(renderer.root, 'card-drag-chest').length).toBeGreaterThan(0);
    expect(findAll(renderer.root, 'card-drag-barrel').length).toBeGreaterThan(0);
    expect(db.getGmContainersList).toHaveBeenCalled();
    await act(async () => renderer.unmount());
  });

  it('пустая база не роняет экран', async () => {
    const renderer = await mountScreen();
    expect(renderer.root).toBeTruthy();
    await act(async () => renderer.unmount());
  });
});

describe('549: стрелки сетки работают в реальном порядке опроса', () => {
  it('перенос сундука в локацию сохраняет ссылку в БД', async () => {
    h.cards = [hub('town'), loot('chest')];
    // Цель сброса измеряется по КОРНЮ карточки-локации.
    h.bounds['card-town'] = { x: 400, y: 100, width: 200, height: 120 };
    const renderer = await mountScreen();
    expect(findAll(renderer.root, 'card-town').length).toBeGreaterThan(0);

    const phase = await dragTo(renderer, 'card-drag-chest', { x: 400, y: 100 });
    expect(phase).toBe('capture');

    // Проверяется РЕЗУЛЬТАТ в БД, а не наличие строки в исходнике.
    const townSave = h.saved.filter((c) => c.id === 'town').pop();
    expect(townSave, 'локация должна получить ссылку на сундук').toBeTruthy();
    expect(townSave.links.map((l) => l.containerId)).toContain('chest');
    await act(async () => renderer.unmount());
  });

  it('нажатие на стрелку без движения ничего не переносит', async () => {
    h.cards = [hub('town'), loot('chest')];
    const renderer = await mountScreen();
    await dragTo(renderer, 'card-drag-chest', { x: 400, y: 100 }, { move: false });
    // Ни одна карточка не получила новых связей от простого нажатия.
    const townSaves = h.saved.filter((c) => c.id === 'town');
    expect(townSaves.every((c) => (c.links || []).length === 0)).toBe(true);
    await act(async () => renderer.unmount());
  });

  it('ручка не отдаёт жест ScrollView и блокирует нативный скролл', async () => {
    h.cards = [hub('town'), loot('chest')];
    const renderer = await mountScreen();
    const handle = one(renderer.root, 'card-drag-chest');
    expect(handle.props.onResponderTerminationRequest()).toBe(false);
    expect(handle.props.onShouldBlockNativeResponder()).toBe(true);
    await act(async () => renderer.unmount());
  });
});

describe('549: порядок в дереве локации меняется через сам экран', () => {
  const townWithChildren = () => [
    hub('town', {
      childOrder: ['shop', 'chest'],
      links: [{ containerId: 'chest' }, { containerId: 'shop' }],
    }),
    loot('chest', { inRoot: false }),
    normalizeContainerEntity({
      id: 'shop', kind: CONTAINER_KIND.MERCHANT, name: 'shop', inRoot: false, caps: 100,
    }),
  ];

  const openHub = async (renderer) => {
    const card = one(renderer.root, 'card-town');
    await act(async () => { card.props.onPress(); await Promise.resolve(); });
  };

  const rowIds = (renderer) => renderer.root
    .findAll((n) => n.type === 'View'
      && typeof n.props?.testID === 'string'
      && n.props.testID.startsWith('hub-tree-row-'))
    .map((n) => n.props.testID.replace('hub-tree-row-', ''));

  it('дерево показывает порядок Мастера и перенос сохраняет новый childOrder', async () => {
    h.cards = townWithChildren();
    h.bounds['hub-tree-row-shop'] = { x: 0, y: 0, width: 300, height: 30 };
    h.bounds['hub-tree-row-chest'] = { x: 0, y: 30, width: 300, height: 30 };
    const renderer = await mountScreen();
    await openHub(renderer);
    expect(rowIds(renderer)).toEqual(['shop', 'chest']);

    // Жест идёт в реальном порядке опроса: решение принимает capture.
    const phase = await dragTo(renderer, 'hub-tree-reorder-chest', { x: 0, y: 0 });
    expect(phase).toBe('capture');

    const townSave = h.saved.filter((c) => c.id === 'town').pop();
    expect(townSave, 'порядок должен дойти до БД').toBeTruthy();
    expect(townSave.childOrder).toEqual(['chest', 'shop']);
    await act(async () => renderer.unmount());
  });

  it('нажатие на стрелку дерева без движения порядок не меняет', async () => {
    h.cards = townWithChildren();
    h.bounds['hub-tree-row-shop'] = { x: 0, y: 0, width: 300, height: 30 };
    h.bounds['hub-tree-row-chest'] = { x: 0, y: 30, width: 300, height: 30 };
    const renderer = await mountScreen();
    await openHub(renderer);
    await dragTo(renderer, 'hub-tree-reorder-chest', { x: 0, y: 0 }, { move: false });
    expect(h.saved.filter((c) => c.id === 'town' && c.childOrder)).toHaveLength(0);
    expect(rowIds(renderer)).toEqual(['shop', 'chest']);
    await act(async () => renderer.unmount());
  });
});
