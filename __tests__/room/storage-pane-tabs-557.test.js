// ПРИЁМОЧНЫЙ (патч 557): слово владельца — «склад держит две вкладки на
// верхней границе с иконкой "мешочек" и "ключ". 2 таба, занимают ровно ширину
// области склада. Вид панелей не меняется, меняется только отображение
// содержимого панели склада».
//
// Проверяется поведением (окно монтируется по-настоящему):
//   1) в панели склада ровно две вкладки, каждая — половина её ширины;
//   2) первая показывает вещи, вторая — ключи и записки;
//   3) ключи больше не занимают место под панелями;
//   4) на телефоне вкладки работают внутри панели склада;
//   5) у Мастера те же две вкладки, в «ключах» — выдача на склад;
//   6) пустой буфер в панели места не занимает.
import { describe, expect, it, vi, beforeEach } from 'vitest';
import React from 'react';
import { create, act } from 'react-test-renderer';
import { readFileSync } from 'node:fs';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({
  width: 1200,
  rooms: {},
  catalog: [],
}));

vi.mock('react-native', () => {
  const React = require('react');
  const mk = (tag) => ({ children, ...props }) => React.createElement(tag, props, children);
  return {
    Platform: { OS: 'web' },
    StyleSheet: { create: (styles) => styles, flatten: (styles) => styles || {} },
    useWindowDimensions: () => ({ width: h.width, height: 900 }),
    Modal: ({ visible, children, ...props }) => (visible ? React.createElement('Modal', props, children) : null),
    View: mk('View'),
    Text: mk('Text'),
    TouchableOpacity: mk('TouchableOpacity'),
    ScrollView: mk('ScrollView'),
  };
});

vi.mock('@expo/vector-icons', () => {
  const React = require('react');
  return {
    MaterialCommunityIcons: ({ name, size, color, ...props }) => React.createElement('Icon', { name, ...props }),
  };
});

vi.mock('../../i18n/locale', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useLocale: () => {}, getCurrentLocale: () => 'ru-RU' };
});
vi.mock('../../components/alerts/alertService', () => ({ showRawAlert: vi.fn() }));
vi.mock('../../db', () => ({
  saveRoomStorage: vi.fn(async () => null),
  getRoomStorage: vi.fn(async () => null),
  getAllRoomStorages: vi.fn(async () => []),
  getGmKeyItems: vi.fn(async () => h.catalog),
}));
vi.mock('../../src/utils/characterFileTransfer', () => ({
  saveCharacter: vi.fn(async () => ({ success: true })),
  loadCharacter: vi.fn(async () => null),
}));
vi.mock('../../src/room/roomStore', () => {
  const hook = (selector) => selector({ rooms: h.rooms });
  hook.getState = () => ({
    rooms: h.rooms,
    transferPartyStorage: vi.fn(async () => ({})),
    addKeyItemToStorage: vi.fn(async () => ({})),
    restorePartyStorage: vi.fn(async () => ({})),
  });
  return { default: hook };
});

import PartyStorageModal from '../../components/lootTrade/PartyStorageModal';

const read = (rel) => readFileSync(rel, 'utf8');
const treeText = (renderer) => JSON.stringify(renderer.toJSON());

const baseRooms = () => ({
  ROOM1: {
    code: 'ROOM1',
    role: 'player',
    partyStorage: {
      revision: 1,
      gmOnline: true,
      entries: [
        {
          entryId: 'st_1',
          item: { id: 'w1', name: 'Пулемёт', itemType: 'weapon' },
          name: 'Пулемёт',
          itemType: 'weapon',
          quantity: 3,
        },
        {
          entryId: 'key_1',
          kind: 'keyItem',
          keyItemId: 'k1',
          name: 'Пропуск',
          itemType: 'keyItem',
          quantity: 1,
          description: 'Ключ от складской двери',
        },
      ],
    },
  },
});

const mount = async ({ width = 1200, gmView = false } = {}) => {
  h.width = width;
  let renderer = null;
  await act(async () => {
    renderer = create(
      <PartyStorageModal
        visible
        gmView={gmView}
        inventoryItems={[{ id: 'i1', name: 'Аптечка', itemType: 'chem', quantity: 2 }]}
        onClose={() => {}}
        onDepositLocal={() => {}}
        onWithdrawLocal={() => {}}
      />,
    );
    await Promise.resolve();
  });
  return renderer;
};

const press = async (node) => {
  await act(async () => {
    node.props.onPress?.({ stopPropagation: () => {} });
    await Promise.resolve();
  });
};

const tabsOf = (renderer) => [
  renderer.root.findAllByProps({ testID: 'storage-pane-tab-items' })[0],
  renderer.root.findAllByProps({ testID: 'storage-pane-tab-keys' })[0],
];

describe('557: две вкладки на верхней границе панели склада', () => {
  beforeEach(() => {
    h.width = 1200;
    h.rooms = baseRooms();
    h.catalog = [{ id: 'gk1', name: 'Метка фракции', description: '' }];
  });

  it('в панели склада ровно две вкладки, каждая — половина ширины панели', async () => {
    const renderer = await mount();
    const [itemsTab, keysTab] = tabsOf(renderer);

    expect(itemsTab).toBeTruthy();
    expect(keysTab).toBeTruthy();

    const styleOf = (node) => (Array.isArray(node.props.style) ? node.props.style : [node.props.style]);
    for (const tab of [itemsTab, keysTab]) {
      const flat = Object.assign({}, ...styleOf(tab).filter(Boolean));
      // flex: 1 у каждой из двух вкладок = ровно половина ширины области склада.
      expect(flat.flex).toBe(1);
    }
    // Вкладки живут в одной строке на верхней границе панели.
    const rows = renderer.root.findAll((node) => {
      const style = Array.isArray(node.props?.style) ? node.props.style : [node.props?.style];
      const flat = Object.assign({}, ...style.filter(Boolean));
      return flat.flexDirection === 'row' && flat.borderBottomColor === '#d4af37';
    });
    expect(rows.length).toBeGreaterThan(0);
    // Подписи вкладок: мешочек и ключ.
    expect(treeText(renderer)).toContain('Вещи');
    expect(treeText(renderer)).toContain('Ключи');
  });

  it('первая вкладка показывает вещи, вторая — ключи и записки', async () => {
    const renderer = await mount();
    const [itemsTab, keysTab] = tabsOf(renderer);

    expect(treeText(renderer)).toContain('Пулемёт');
    expect(treeText(renderer)).not.toContain('Пропуск');

    await press(keysTab);
    expect(treeText(renderer)).toContain('Пропуск');
    expect(treeText(renderer)).not.toContain('Пулемёт');

    // Чтение записки — тем же нажатием на строку.
    await press(renderer.root.findAllByProps({ testID: 'storage-key-k1' })[0]);
    expect(treeText(renderer)).toContain('Ключ от складской двери');
    expect(treeText(renderer)).toContain('Запись остаётся общей');

    await press(itemsTab);
    expect(treeText(renderer)).toContain('Пулемёт');
    expect(treeText(renderer)).not.toContain('Пропуск');
  });

  it('ключи не занимают место под панелями: в окне нет отдельного блока ключей', async () => {
    const renderer = await mount();
    // До переключения на вкладку «ключи» записи в окне нет вообще.
    expect(treeText(renderer)).not.toContain('Пропуск');
    const modal = read('components/lootTrade/PartyStorageModal.js');
    expect(modal).not.toContain('renderKeysBlock');
  });

  it('на телефоне вкладки работают внутри панели склада', async () => {
    const renderer = await mount({ width: 420 });
    await press(renderer.root.findAllByProps({ testID: 'storage-tab-storage' })[0]);

    expect(treeText(renderer)).toContain('Пулемёт');
    await press(renderer.root.findAllByProps({ testID: 'storage-pane-tab-keys' })[0]);
    expect(treeText(renderer)).toContain('Пропуск');
    expect(treeText(renderer)).not.toContain('Пулемёт');
  });

  it('пустой буфер в панели места не занимает', async () => {
    const renderer = await mount();
    expect(treeText(renderer)).not.toContain('Отдаю на склад');

    await press(renderer.root.findAllByProps({ testID: 'storage-give-i1' })[0]);
    expect(treeText(renderer)).toContain('Отдаю на склад');
  });

  it('у Мастера те же две вкладки: состав склада и выдача ключей', async () => {
    h.rooms = { ROOM1: { ...baseRooms().ROOM1, role: 'gm' } };
    const renderer = await mount({ gmView: true });

    expect(renderer.root.findAllByProps({ testID: 'gm-storage-item-st_1' }).length).toBeGreaterThan(0);
    expect(treeText(renderer)).not.toContain('gm-issue-key');

    await press(renderer.root.findAllByProps({ testID: 'storage-pane-tab-keys' })[0]);
    expect(renderer.root.findAllByProps({ testID: 'gm-issue-key-gk1' }).length).toBeGreaterThan(0);
    expect(treeText(renderer)).toContain('Пропуск');
  });

  it('подписи вкладок парные RU/EN', () => {
    const ru = JSON.parse(read('i18n/ru-RU/screens/inventory/screen.json')).storage;
    const en = JSON.parse(read('i18n/en-EN/screens/inventory/screen.json')).storage;
    expect(ru.tabItems).toBe('Вещи');
    expect(ru.tabKeys).toBe('Ключи');
    expect(en.tabItems).toBe('Items');
    expect(en.tabKeys).toBe('Keys');
  });
});
