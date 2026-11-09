// __tests__/room/location-binding-563.test.js
// ПРИЁМОЧНЫЙ (патч 563): привязка к локации — в обе стороны, и настоящее
// перемещение сущностей в дереве.
//
// Слово владельца: «Я всё ещё в локации не могу перемещать сущности. И нужна
// тождественность привязки терминалов/замков к локации и наоборот. Если я в
// терминале/замке выбираю локацию, то они туда встраиваются. А не только через
// локацию». Уточнил: ручка в дереве не меняет порядок (сломанный драг), поле
// «Локация» есть, но выбор ничего не делает; «в нескольких локациях — могут,
// например "бродячий" торговец»; перетаскивание — и порядок, и переезд.
//
// Почему поведением. Все прежние проверки читали исходник строками. Из-за этого
// прожили две настоящие поломки: хук заявлял нагрузку строки псевдо-пропсами
// (драг в дереве был мёртв), а выбор локации в форме терялся, если Мастер не
// нажимал вариант в списке. Здесь всё проверяется на смонтированном экране и
// на записях в БД.
import { describe, expect, it, beforeEach, vi } from 'vitest';
import React, { act } from 'react';
import { create } from 'react-test-renderer';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({ cards: [], keyItems: [], saved: [], bounds: {} }));

vi.mock('react-native', () => {
  const React = require('react');
  const host = (name) => ({ children, ...props }) => React.createElement(name, props, children);
  const measurable = (name) => React.forwardRef(({ children, ...props }, ref) => {
    React.useImperativeHandle(ref, () => ({
      measureInWindow: (cb) => {
        const b = h.bounds[props.testID] || { x: 0, y: 0, width: 240, height: 60 };
        cb(b.x, b.y, b.width, b.height);
      },
    }));
    return React.createElement(name, props, children);
  });
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
    View: measurable('View'),
    Text: host('Text'),
    TextInput: host('TextInput'),
    TouchableOpacity: measurable('TouchableOpacity'),
    Pressable: host('Pressable'),
    ScrollView: host('ScrollView'),
    ActivityIndicator: host('ActivityIndicator'),
    KeyboardAvoidingView: host('KeyboardAvoidingView'),
    Image: host('Image'),
    // Настоящий PanResponder: props системы ответственности зовут обработчики
    // конфига. Именно этот слой и был «удобно» замокан в 549.
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

vi.mock('../../db', async () => {
  // Как настоящий saveGmContainer: сущность нормализуется и получает id.
  // Раньше мок возвращал черновик как есть — и «новый сундук в локацию»
  // записывался ссылкой на null, чего настоящая БД не делает.
  const { normalizeContainerEntity: normalize } = await import('../../domain/lootTrade.js');
  return {
  getGmContainersList: vi.fn(async () => h.cards),
  getGmKeyItems: vi.fn(async () => h.keyItems),
  getCharacterFolders: vi.fn(async () => [{ id: 'f1', name: 'Кампания' }]),
  getFolderRooms: vi.fn(async () => [{ folder_id: 'f1', code: 'ROOM1', owner_token: 't1' }]),
  getGmContainerById: vi.fn(async (id) => h.cards.find((c) => c.id === id) || null),
  saveGmContainer: vi.fn(async (card) => {
    const saved = normalize(card);
    h.saved.push(saved);
    const idx = h.cards.findIndex((c) => c.id === saved.id);
    if (idx >= 0) h.cards[idx] = saved; else h.cards.push(saved);
    return saved;
  }),
  saveGmKeyItem: vi.fn(async (item) => item),
  deleteGmContainer: vi.fn(async () => {}),
  duplicateGmContainer: vi.fn(async (id) => ({ ...h.cards.find((c) => c.id === id), id: `${id}-copy` })),
  };
});

vi.mock('../../i18n/locale', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useLocale: () => 'ru-RU', useModuleLocale: () => 'ru-RU' };
});
vi.mock('../../components/screens/LootTradeScreen/logic/lootTradeI18n', () => ({
  tLootTrade: (key) => key,
  formatLootTrade: (key, values) => (values ? `${key}:${JSON.stringify(values)}` : key),
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

// Тяжёлые модалки, не участвующие в проверках, глушим. Дерево, карточки и
// форма параметров — НАСТОЯЩИЕ.
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
vi.mock('../../components/lootTrade/PartyStorageModal', () => ({
  default: () => React.createElement('PartyStorageModal'),
}));

import LootTradeScreen from '../../components/screens/LootTradeScreen/LootTradeScreen.js';
import HubChildPickerModal from '../../components/screens/LootTradeScreen/modals/HubChildPickerModal.js';
import { showRawAlert } from '../../components/alerts/alertService';
import { CONTAINER_KIND, normalizeContainerEntity } from '../../domain/lootTrade.js';
import {
  locateContainer,
  planLocationBinding,
  planMoveIntoLocation,
} from '../../domain/hubBindings.js';

const hub = (id, extra = {}) => normalizeContainerEntity({
  id, kind: CONTAINER_KIND.HUB, name: id, inRoot: true, ...extra,
});
const loot = (id, extra = {}) => normalizeContainerEntity({
  id, kind: CONTAINER_KIND.LOOT, name: id, inRoot: true, items: [], ...extra,
});
const terminal = (id, extra = {}) => normalizeContainerEntity({
  id, kind: CONTAINER_KIND.TERMINAL, name: id, inRoot: true, difficulty: 2, ...extra,
});

const findAll = (root, testID) => root.findAll((n) => n.props?.testID === testID);
const one = (root, testID) => {
  const [node] = findAll(root, testID);
  expect(node, testID).toBeTruthy();
  return node;
};
const textOf = (node) => {
  if (node == null) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (node.children) return node.children.map(textOf).join('');
  return '';
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

const touchEvent = () => ({
  nativeEvent: { touches: [1] },
  touchHistory: { numberActiveTouches: 1, mostRecentTimeStamp: 1 },
});

/** Жест так, как его ведёт RN: сначала опрос capture, потом grant → move → release. */
const dragTo = async (renderer, handleTestID, target, { move = true } = {}) => {
  const handle = one(renderer.root, handleTestID);
  let phase = null;
  await act(async () => {
    if (handle.props.onStartShouldSetResponderCapture?.(touchEvent()) === true) phase = 'capture';
    else if (handle.props.onStartShouldSetResponder?.(touchEvent()) === true) phase = 'bubble';
    handle.props.onResponderGrant({ touchHistory: { numberActiveTouches: 1 } }, { x0: 0, y0: 0 });
    await Promise.resolve();
  });
  if (move) {
    await act(async () => {
      handle.props.onResponderMove(
        { touchHistory: { numberActiveTouches: 1, mostRecentTimeStamp: 2 } },
        { moveX: target.x + 5, moveY: target.y + 5 },
      );
      await Promise.resolve();
    });
  }
  await act(async () => {
    handle.props.onResponderRelease({}, {});
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

describe('563: закон привязки — один на обе стороны', () => {
  it('локация хранит родителя у себя, остальные — в родителе', () => {
    const town = hub('town', { parentLocationId: 'region' });
    const chest = loot('chest', { inRoot: false });
    const all = [town, hub('region'), hub('cave', { links: [{ containerId: 'chest' }] }), chest];
    expect(locateContainer(town, all)).toEqual({ primary: 'region', all: ['region'] });
    expect(locateContainer(chest, all).all).toEqual(['cave']);
  });

  it('план: основная локация первой, дополнительные — тоже, лишние снимаются', () => {
    const town = hub('town');
    const cave = hub('cave', { links: [{ containerId: 'chest', locked: true, lockLabel: 'замок' }] });
    const chest = loot('chest', { inRoot: false });
    const plan = planLocationBinding({
      container: chest,
      primaryHubId: 'town',
      extraHubIds: ['cave'],
      allContainers: [town, cave, chest],
    });
    // town получает ссылку, порядок прежних ссылок не ломается
    expect(plan.hubUpdates.find((u) => u.id === 'town').links.map((l) => l.containerId)).toEqual(['chest']);
    // cave уже держал ссылку — её не дублируем и не теряем подпись замка
    expect(plan.hubUpdates.some((u) => u.id === 'cave')).toBe(false);
    // inRoot пишется только когда меняется; «не на корне» — это не true
    expect(plan.containerPatch.inRoot).not.toBe(true);
  });

  it('«— нет —» возвращает сущность на экран карточек', () => {
    const town = hub('town', { links: [{ containerId: 'chest' }] });
    const chest = loot('chest', { inRoot: false });
    const plan = planLocationBinding({ container: chest, primaryHubId: '', allContainers: [town, chest] });
    expect(plan.hubUpdates[0].links).toEqual([]);
    expect(plan.containerPatch.inRoot).toBe(true);
  });

  it('перенос: из старой локации снимается, в новую встаёт, прочие остаются', () => {
    const town = hub('town', { links: [{ containerId: 'trader' }] });
    const cave = hub('cave');
    const camp = hub('camp', { links: [{ containerId: 'trader' }] });
    const trader = normalizeContainerEntity({
      id: 'trader', kind: CONTAINER_KIND.MERCHANT, name: 'trader', inRoot: false, caps: 50,
    });
    const plan = planMoveIntoLocation({
      container: trader,
      targetHubId: 'cave',
      fromHubId: 'town',
      allContainers: [town, cave, camp, trader],
    });
    const byId = Object.fromEntries(plan.hubUpdates.map((u) => [u.id, u.links.map((l) => l.containerId)]));
    expect(byId.town).toEqual([]);          // из текущей локации снят
    expect(byId.cave).toEqual(['trader']);  // в новую встал
    expect(byId.camp).toBeUndefined();      // «бродячий» остался в третьей
  });

  it('вложенную локацию двигаем полем родителя, а не ссылками', () => {
    const town = hub('town');
    const cave = hub('cave', { parentLocationId: 'town', inRoot: false });
    const plan = planMoveIntoLocation({
      container: cave, targetHubId: 'town2', fromHubId: 'town', allContainers: [town, cave, hub('town2')],
    });
    expect(plan.hubUpdates).toEqual([]);
    expect(plan.containerPatch).toEqual({ parentLocationId: 'town2', inRoot: false });
  });
});

describe('563: порядок в дереве меняется руками Мастера', () => {
  const townWithChildren = () => [
    hub('town', { childOrder: ['shop', 'chest'], links: [{ containerId: 'chest' }, { containerId: 'shop' }] }),
    loot('chest', { inRoot: false }),
    normalizeContainerEntity({ id: 'shop', kind: CONTAINER_KIND.MERCHANT, name: 'shop', inRoot: false, caps: 100 }),
  ];

  const openHub = async (renderer) => {
    const card = one(renderer.root, 'card-town');
    await act(async () => { card.props.onPress(); await Promise.resolve(); });
  };

  it('перетаскивание ручки сохраняет новый порядок', async () => {
    h.cards = townWithChildren();
    h.bounds['hub-tree-row-shop'] = { x: 0, y: 0, width: 300, height: 30 };
    h.bounds['hub-tree-row-chest'] = { x: 0, y: 30, width: 300, height: 30 };
    const renderer = await mountScreen();
    await openHub(renderer);

    const phase = await dragTo(renderer, 'hub-tree-reorder-chest', { x: 0, y: 0 });
    expect(phase).toBe('capture');
    const townSave = h.saved.filter((c) => c.id === 'town').pop();
    expect(townSave, 'порядок должен дойти до БД').toBeTruthy();
    expect(townSave.childOrder).toEqual(['chest', 'shop']);
    await act(async () => renderer.unmount());
  });

  it('бросок строки на вложенную локацию переносит сущность в неё', async () => {
    h.cards = [
      hub('town', {
        childOrder: ['cave', 'chest'],
        links: [{ containerId: 'chest' }, { containerId: 'cave' }],
      }),
      hub('cave', { parentLocationId: 'town', inRoot: false }),
      loot('chest', { inRoot: false }),
    ];
    h.bounds['hub-tree-row-cave'] = { x: 0, y: 0, width: 300, height: 30 };
    h.bounds['hub-tree-row-chest'] = { x: 0, y: 30, width: 300, height: 30 };
    const renderer = await mountScreen();
    await openHub(renderer);

    await dragTo(renderer, 'hub-tree-reorder-chest', { x: 0, y: 0 });

    const caveSave = h.saved.filter((c) => c.id === 'cave').pop();
    expect(caveSave?.links?.map((l) => l.containerId), 'сундук должен встать в пещеру').toEqual(['chest']);
    const townSave = h.saved.filter((c) => c.id === 'town').pop();
    expect(townSave?.links?.map((l) => l.containerId), 'из локации-источника ссылка снимается')
      .not.toContain('chest');
    await act(async () => renderer.unmount());
  });

  it('нажатие без движения ничего не переносит и не переставляет', async () => {
    h.cards = townWithChildren();
    h.bounds['hub-tree-row-shop'] = { x: 0, y: 0, width: 300, height: 30 };
    h.bounds['hub-tree-row-chest'] = { x: 0, y: 30, width: 300, height: 30 };
    const renderer = await mountScreen();
    await openHub(renderer);
    await dragTo(renderer, 'hub-tree-reorder-chest', { x: 0, y: 0 }, { move: false });
    expect(h.saved.filter((c) => c.id === 'town' && c.childOrder)).toHaveLength(0);
    await act(async () => renderer.unmount());
  });
});

describe('563: из локации можно добавить сущность', () => {
  it('кнопка «Добавить в локацию» открывает выбор — раньше он не открывался никогда', async () => {
    h.cards = [hub('town'), loot('chest', { inRoot: true })];
    const renderer = await mountScreen();
    const card = one(renderer.root, 'card-town');
    await act(async () => { card.props.onPress(); await Promise.resolve(); });

    const addBtn = one(renderer.root, 'hub-tree-add-child');
    await act(async () => { addBtn.props.onPress(); await Promise.resolve(); });

    const picker = renderer.root.findAll((n) => n.type === HubChildPickerModal);
    expect(picker.length).toBeGreaterThan(0);
    expect(picker[0].props.visible).toBe(true);
    expect(picker[0].props.hub?.id).toBe('town');
    await act(async () => renderer.unmount());
  });
});

describe('563: созданное внутри локации остаётся в ней', () => {
  it('«Создать сундук» из выбора локации сразу кладёт его в эту локацию', async () => {
    h.cards = [hub('town')];
    const renderer = await mountScreen();
    const card = one(renderer.root, 'card-town');
    await act(async () => { card.props.onPress(); await Promise.resolve(); });

    const addBtn = one(renderer.root, 'hub-tree-add-child');
    await act(async () => { addBtn.props.onPress(); await Promise.resolve(); });

    const createLoot = one(renderer.root, 'hub-picker-create-loot');
    await act(async () => { createLoot.props.onPress(); await Promise.resolve(); });

    const nameInput = one(renderer.root, 'container-form-name');
    await act(async () => { nameInput.props.onChangeText('ящик'); await Promise.resolve(); });
    const saveBtn = one(renderer.root, 'container-form-save');
    await act(async () => { saveBtn.props.onPress(); await Promise.resolve(); await Promise.resolve(); });

    // Последняя запись — после применения привязки (первая — черновик).
    const created = h.saved.filter((c) => c.name === 'ящик').pop();
    expect(created, 'сундук должен сохраниться').toBeTruthy();
    expect(created.inRoot, 'он нужен в локации, а не на корне').toBe(false);
    const townSave = h.saved.filter((c) => c.id === 'town').pop();
    expect(townSave?.links?.map((l) => l.containerId)).toContain(created.id);
    await act(async () => renderer.unmount());
  });
});

describe('563: «Локация» в параметрах терминала встраивает его в локацию', () => {
  const openEditor = async (renderer, cardId) => {
    const card = one(renderer.root, `card-${cardId}`);
    const menuBtn = card.findAll((n) => n.props?.accessibilityLabel === 'card.openMenu')[0];
    await act(async () => { menuBtn.props.onPress(); await Promise.resolve(); });
    const editItem = renderer.root
      .findAll((n) => typeof n.props?.onPress === 'function')
      .find((n) => textOf(n).trim() === 'card.edit');
    await act(async () => { editItem.props.onPress(); await Promise.resolve(); });
  };

  const formRoot = (renderer) => {
    const [node] = renderer.root.findAll((n) => typeof n.props?.onSave === 'function' && n.props?.kind);
    expect(node, 'форма параметров должна быть открыта').toBeTruthy();
    return node;
  };

  it('выбор локации в поле «Локация» пишет ссылку в эту локацию', async () => {
    h.cards = [hub('town'), terminal('term')];
    const renderer = await mountScreen();
    await openEditor(renderer, 'term');
    const form = formRoot(renderer);

    const trigger = form.findAll((n) => n.props?.testID === 'container-form-primary-location-toggle')[0];
    await act(async () => { trigger.props.onPress(); await Promise.resolve(); });
    const option = form.findAll((n) => typeof n.props?.onPress === 'function' && textOf(n).trim() === 'town')[0];
    expect(option, 'локация должна быть в списке выбора').toBeTruthy();
    await act(async () => { option.props.onPress(); await Promise.resolve(); });

    const saveBtn = form.findAll((n) => n.props?.testID === 'container-form-save')[0];
    await act(async () => { saveBtn.props.onPress(); await Promise.resolve(); await Promise.resolve(); });

    const townSave = h.saved.filter((c) => c.id === 'town').pop();
    expect(townSave?.links?.map((l) => l.containerId)).toEqual(['term']);
    const termSave = h.saved.filter((c) => c.id === 'term').pop();
    expect(termSave?.inRoot, 'терминал уходит с экрана карточек в локацию').toBe(false);
    await act(async () => renderer.unmount());
  });

  it('дополнительная локация не теряется: терминал живёт в двух', async () => {
    h.cards = [hub('town'), hub('cave'), terminal('term')];
    const renderer = await mountScreen();
    await openEditor(renderer, 'term');
    const form = formRoot(renderer);

    const trigger = form.findAll((n) => n.props?.testID === 'container-form-primary-location-toggle')[0];
    await act(async () => { trigger.props.onPress(); await Promise.resolve(); });
    const townOption = form.findAll((n) => typeof n.props?.onPress === 'function' && textOf(n).trim() === 'town')[0];
    await act(async () => { townOption.props.onPress(); await Promise.resolve(); });

    const hubInput = form.findAll((n) => n.props?.testID === 'hub-combobox-input')[0];
    await act(async () => { hubInput.props.onChangeText('cave'); await Promise.resolve(); });
    await act(async () => {
      hubInput.props.onKeyPress({ nativeEvent: { key: 'Tab' }, preventDefault: () => {} });
      await Promise.resolve();
    });

    const saveBtn = form.findAll((n) => n.props?.testID === 'container-form-save')[0];
    await act(async () => { saveBtn.props.onPress(); await Promise.resolve(); await Promise.resolve(); });

    const linked = h.saved
      .filter((c) => c.kind === CONTAINER_KIND.HUB)
      .reduce((acc, c) => {
        const ids = (c.links || []).map((l) => l.containerId);
        return ids.includes('term') ? [...acc, c.id] : acc;
      }, []);
    expect([...new Set(linked)].sort()).toEqual(['cave', 'town']);
    await act(async () => renderer.unmount());
  });

  it('набранный, но не выбранный текст не теряется молча — форма говорит об этом', async () => {
    h.cards = [hub('town'), terminal('term')];
    const renderer = await mountScreen();
    await openEditor(renderer, 'term');
    const form = formRoot(renderer);

    const hubInput = form.findAll((n) => n.props?.testID === 'hub-combobox-input')[0];
    await act(async () => { hubInput.props.onChangeText('zzz'); await Promise.resolve(); });
    const saveBtn = form.findAll((n) => n.props?.testID === 'container-form-save')[0];
    await act(async () => { saveBtn.props.onPress(); await Promise.resolve(); });

    expect(showRawAlert).toHaveBeenCalled();
    expect(String(showRawAlert.mock.calls[0][0]?.title || '')).toContain('form.locationNotPicked');
    expect(h.saved.filter((c) => c.kind === CONTAINER_KIND.HUB)).toHaveLength(0);
    await act(async () => renderer.unmount());
  });
});
