// ПРИЁМОЧНЫЙ (патч 556): слово владельца — «Насчёт окна общего хранилища.
// Оно должно было выглядеть и работать по аналогии с экраном торговца. Только
// без функций отслеживания цен и крышек. Т.е обмен без денег».
//
// Поэтому окно склада проверяется поведением (настоящее монтирование), а не
// чтением исходника:
//   1) каркас тот же, что у торговца: шапка, две панели, буфер внутри панели,
//      нижняя полоса с «Очистить» и «Перенести»;
//   2) обмен двусторонний: положить и забрать, по одной вещи или всё сразу;
//   3) до «Перенести» ничего не переносится, после — одна атомарная операция;
//   4) на телефоне панели переключаются вкладками, как у торговца;
//   5) денег нет: ни цен, ни крышек, ни баланса сделки — только вещи.
import { describe, expect, it, vi, beforeEach } from 'vitest';
import React from 'react';
import { create, act } from 'react-test-renderer';
import { readFileSync } from 'node:fs';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({
  width: 1200,
  rooms: {},
  transfer: null,
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
    MaterialCommunityIcons: ({ name, size, color, ...props }) => React.createElement('Icon', props),
  };
});

vi.mock('../../i18n/locale', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useLocale: () => {},
    getCurrentLocale: () => 'ru-RU',
  };
});
vi.mock('../../components/alerts/alertService', () => ({ showRawAlert: vi.fn() }));
vi.mock('../../db', () => ({
  saveRoomStorage: vi.fn(async () => null),
  getRoomStorage: vi.fn(async () => null),
  getAllRoomStorages: vi.fn(async () => []),
  getGmKeyItems: vi.fn(async () => []),
}));
vi.mock('../../src/utils/characterFileTransfer', () => ({
  saveCharacter: vi.fn(async () => ({ success: true })),
  loadCharacter: vi.fn(async () => null),
}));
vi.mock('../../src/room/roomStore', () => {
  const hook = (selector) => selector({ rooms: h.rooms });
  hook.getState = () => ({
    rooms: h.rooms,
    transferPartyStorage: h.transfer,
    addKeyItemToStorage: vi.fn(async () => ({})),
    restorePartyStorage: vi.fn(async () => ({})),
  });
  return { default: hook };
});

import PartyStorageModal from '../../components/lootTrade/PartyStorageModal';
import { tradeOverlayStyles } from '../../components/lootTrade/tradeOverlayStyles';

const read = (rel) => readFileSync(rel, 'utf8');
const treeText = (renderer) => JSON.stringify(renderer.toJSON());

const baseRooms = () => ({
  ROOM1: {
    code: 'ROOM1',
    role: 'player',
    partyStorage: {
      revision: 1,
      gmOnline: true,
      entries: [{
        entryId: 'st_1',
        item: { id: 'w1', name: 'Пулемёт', itemType: 'weapon' },
        name: 'Пулемёт',
        itemType: 'weapon',
        quantity: 3,
      }],
    },
  },
});

const mount = async ({ width = 1200, props = {} } = {}) => {
  h.width = width;
  let renderer = null;
  await act(async () => {
    renderer = create(
      <PartyStorageModal
        visible
        inventoryItems={[{ id: 'i1', name: 'Аптечка', itemType: 'chem', quantity: 2 }]}
        onClose={() => {}}
        onDepositLocal={props.onDepositLocal || (() => {})}
        onWithdrawLocal={props.onWithdrawLocal || (() => {})}
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

describe('556: окно общего хранилища — как у торговца, но без денег', () => {
  beforeEach(() => {
    h.width = 1200;
    h.rooms = baseRooms();
    h.transfer = vi.fn(async () => ({}));
  });

  it('каркас взят у торговца: шапка, две панели, буфер в панели, нижняя полоса', async () => {
    const renderer = await mount();
    const text = treeText(renderer);

    expect(text).toContain('Общее хранилище');
    // Панели: свои вещи и склад.
    expect(text).toContain('Предметы персонажа');
    expect(text).toContain('Аптечка');
    expect(text).toContain('Пулемёт');
    // Пустой буфер места не занимает (557), а с вещами — стоит в панели.
    expect(text).not.toContain('Забираю себе');
    expect(text).not.toContain('Отдаю на склад');
    // Нижняя полоса: очистка и перенос.
    expect(text).toContain('Перенести');
    expect(renderer.root.findAllByProps({ testID: 'storage-commit-button' }).length).toBeGreaterThan(0);
    // Обе панели видны рядом на широком экране.
    const halfPanes = renderer.root.findAll((node) => (
      Array.isArray(node.props?.style) && node.props.style.includes(tradeOverlayStyles.paneHalf)
    ));
    expect(halfPanes.length).toBeGreaterThanOrEqual(2);
  });

  it('обмен двусторонний: положить, забрать, всё сразу — в буфере до нажатия', async () => {
    const renderer = await mount();

    const giveRow = renderer.root.findAllByProps({ testID: 'storage-give-i1' })[0];
    await press(giveRow);
    expect(treeText(renderer)).toContain('К складу: 1');
    expect(treeText(renderer)).toContain('Отдаю на склад');

    const takeRow = renderer.root.findAllByProps({ testID: 'storage-take-st_1' })[0];
    await press(takeRow);
    expect(treeText(renderer)).toContain('к себе: 1');
    expect(treeText(renderer)).toContain('Забираю себе');

    // «Всё» на строке склада: остаток 2 из 3.
    await press(renderer.root.findAllByProps({ testID: 'storage-take-all-st_1' })[0]);
    expect(treeText(renderer)).toContain('к себе: 3');

    // До «Перенести» сервер не трогали.
    expect(h.transfer).not.toHaveBeenCalled();
  });

  it('«Перенести» отправляет одну атомарную операцию и меняет инвентарь после ответа', async () => {
    const onDepositLocal = vi.fn();
    const onWithdrawLocal = vi.fn();
    const renderer = await mount({ props: { onDepositLocal, onWithdrawLocal } });

    await press(renderer.root.findAllByProps({ testID: 'storage-give-i1' })[0]);
    await press(renderer.root.findAllByProps({ testID: 'storage-take-st_1' })[0]);
    expect(onDepositLocal).not.toHaveBeenCalled();
    expect(onWithdrawLocal).not.toHaveBeenCalled();

    await act(async () => {
      renderer.root.findAllByProps({ testID: 'storage-commit-button' })[0].props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(h.transfer).toHaveBeenCalledTimes(1);
    const payload = h.transfer.mock.calls[0][0];
    expect(payload.code).toBe('ROOM1');
    expect(payload.deposits).toHaveLength(1);
    expect(payload.deposits[0]).toMatchObject({ quantity: 1, name: 'Аптечка' });
    expect(payload.withdrawals).toEqual([{ entryId: 'st_1', quantity: 1 }]);
    expect(onDepositLocal).toHaveBeenCalledWith('i1', 1);
    expect(onWithdrawLocal).toHaveBeenCalledWith(expect.objectContaining({ id: 'w1' }), 1);
  });

  it('крестик в буфере снимает строку, «Очистить» убирает весь буфер', async () => {
    const renderer = await mount();
    await press(renderer.root.findAllByProps({ testID: 'storage-give-i1' })[0]);

    await press(renderer.root.findAllByProps({ testID: 'storage-buffer-clear-give-i1' })[0]);
    expect(treeText(renderer)).not.toContain('К складу: 1');

    await press(renderer.root.findAllByProps({ testID: 'storage-give-i1' })[0]);
    const clearAllBtn = renderer.root.findAllByProps({ testID: 'storage-clear-buffer-button' })[0];
    await press(clearAllBtn);
    expect(treeText(renderer)).not.toContain('К складу: 1');
    expect(h.transfer).not.toHaveBeenCalled();
  });

  it('на телефоне панели переключаются вкладками, как у торговца', async () => {
    const renderer = await mount({ width: 420 });
    expect(treeText(renderer)).toContain('Предметы персонажа');
    expect(treeText(renderer)).not.toContain('Пулемёт');

    await press(renderer.root.findAllByProps({ testID: 'storage-tab-storage' })[0]);
    expect(treeText(renderer)).toContain('Пулемёт');
    expect(treeText(renderer)).not.toContain('💊 Аптечка');
  });

  it('денег нет: ни цен, ни крышек, ни наценок — только вещи', () => {
    const modal = read('components/lootTrade/PartyStorageModal.js');
    for (const forbidden of [
      'saleMarkupPercent',
      'buyDepreciationPercent',
      'markupPercent',
      'caps',
      'playerCaps',
      'merchantCaps',
      'unitPrice',
      '{CAP}',
    ]) {
      expect(modal).not.toContain(forbidden);
    }
    // Общий каркас строк действительно импортирован из торговца.
    expect(modal).toContain("import { tradeOverlayStyles as trade } from './tradeOverlayStyles'");
    expect(modal).toContain('trade.pane');
    expect(modal).toContain('trade.bufferBox');
    expect(modal).toContain('trade.miniMoveBtn');
    expect(modal).toContain('trade.barterFooter');
  });

  it('подписи обмена есть в обоих языках и не говорят о деньгах', () => {
    const keys = ['depositOne', 'depositAll', 'withdrawOne', 'withdrawAll', 'exchangeSummary', 'exchangeEven'];
    for (const loc of ['ru-RU', 'en-EN']) {
      const storage = JSON.parse(read(`i18n/${loc}/screens/inventory/screen.json`)).storage;
      for (const key of keys) {
        expect(storage[key], `${loc}.${key}`).toBeTruthy();
      }
    }
    const ru = JSON.parse(read('i18n/ru-RU/screens/inventory/screen.json')).storage;
    const en = JSON.parse(read('i18n/en-EN/screens/inventory/screen.json')).storage;
    expect(ru.exchangeEven).not.toMatch(/крышк|цен/i);
    expect(en.exchangeEven).not.toMatch(/caps|price/i);
  });
});
