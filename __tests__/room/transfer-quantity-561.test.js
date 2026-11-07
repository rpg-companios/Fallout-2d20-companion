// Патч 561 — «сколько переместить?» в складе и у торговца.
//
// Слово владельца: «тап по назначению или клик автоматически переносят предмет…
// откроется модалка поверх и там будет заголовок: сколько переместить? А ниже
// ячейка с числом. Ещё ниже ползунок… Ниже 2 кнопки "подтвердить" "отмена"».
// И уточнение: «значение +, "−" появляется при количестве отданных более 1х».
// И: «Торговец и склад работают по одному дизайну. Править их раздельно
// бессмысленно».
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { create, act } from 'react-test-renderer';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

vi.mock('react-native', () => {
  const React = require('react');
  const host = (name) => ({ children, ...props }) => React.createElement(name, props, children);
  return {
    Platform: { OS: 'web' },
    StyleSheet: { create: (s) => s, flatten: (s) => s || {} },
    Modal: ({ visible, children, ...props }) => (visible ? React.createElement('Modal', props, children) : null),
    View: host('View'),
    Text: host('Text'),
    TextInput: host('TextInput'),
    TouchableOpacity: host('TouchableOpacity'),
  };
});

vi.mock('../../i18n/locale', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useLocale: () => 'ru-RU', getCurrentLocale: () => 'ru-RU', useModuleLocale: () => 'ru-RU' };
});

const TransferQuantityModal = (await import('../../components/lootTrade/TransferQuantityModal')).default;

const mount = async (props) => {
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(TransferQuantityModal, {
      visible: true,
      itemName: 'Лабораторный халат',
      directionLabel: 'склад → инвентарь',
      available: 12,
      max: 12,
      ...props,
    }));
  });
  return renderer;
};

const press = async (node) => {
  await act(async () => { node.props.onPress(); });
};

const type = async (node, textValue) => {
  await act(async () => { node.props.onChangeText(textValue); });
};

const has = (renderer, testID) => renderer.root.findAllByProps({ testID }).length > 0;
const text = (renderer) => {
  const out = [];
  const walk = (node) => {
    if (!node) return;
    if (typeof node === 'string') { out.push(node); return; }
    if (Array.isArray(node)) { node.forEach(walk); return; }
    walk(node.children);
  };
  walk(renderer.toJSON());
  return out.join(' ');
};

describe('Патч 561: окно «Сколько переместить?»', () => {
  it('заголовок, предмет, направление и доступное количество на месте', async () => {
    const renderer = await mount();
    const all = text(renderer);
    expect(all).toContain('Сколько переместить?');
    expect(all).toContain('Лабораторный халат');
    expect(all).toContain('склад → инвентарь');
    expect(all).toContain('доступно 12');
  });

  it('«−» появляется только когда значение больше 1', async () => {
    const renderer = await mount();
    expect(has(renderer, 'transfer-quantity-minus')).toBe(false);

    await press(renderer.root.findAllByProps({ testID: 'transfer-quantity-plus' })[0]);
    expect(has(renderer, 'transfer-quantity-minus')).toBe(true);
    expect(renderer.root.findAllByProps({ testID: 'transfer-quantity-input' })[0].props.value).toBe('2');

    await press(renderer.root.findAllByProps({ testID: 'transfer-quantity-minus' })[0]);
    expect(has(renderer, 'transfer-quantity-minus')).toBe(false);
    expect(renderer.root.findAllByProps({ testID: 'transfer-quantity-input' })[0].props.value).toBe('1');
  });

  it('ползунок есть только когда есть из чего выбирать', async () => {
    const one = await mount({ max: 1, available: 1 });
    expect(has(one, 'transfer-quantity-slider')).toBe(false);

    const many = await mount();
    expect(has(many, 'transfer-quantity-slider')).toBe(true);
  });

  it('значение не выходит за 1…доступно', async () => {
    const renderer = await mount({ max: 3, available: 3 });
    const input = () => renderer.root.findAllByProps({ testID: 'transfer-quantity-input' })[0];

    await type(input(), '99');
    expect(input().props.value).toBe('3');

    await type(input(), '0');
    expect(input().props.value).toBe('1');

    await type(input(), '');
    expect(input().props.value).toBe('');

    // Подтверждаем — уходит валидное число.
    await type(input(), '2');
    expect(input().props.value).toBe('2');
  });

  it('«Подтвердить» отдаёт выбранное количество, «Отмена» — закрывает', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const renderer = await mount({ onConfirm, onCancel });

    await press(renderer.root.findAllByProps({ testID: 'transfer-quantity-plus' })[0]);
    await press(renderer.root.findAllByProps({ testID: 'transfer-quantity-plus' })[0]);
    await press(renderer.root.findAllByProps({ testID: 'transfer-quantity-confirm' })[0]);
    expect(onConfirm).toHaveBeenCalledWith(3);

    await press(renderer.root.findAllByProps({ testID: 'transfer-quantity-cancel' })[0]);
    expect(onCancel).toHaveBeenCalled();
  });

  it('итог по деньгам считается от количества', async () => {
    const renderer = await mount({
      max: 10,
      available: 10,
      renderTotal: (qty) => `Итого: ${qty * 25}`,
    });
    expect(text(renderer)).toContain('Итого: 25');
    await press(renderer.root.findAllByProps({ testID: 'transfer-quantity-plus' })[0]);
    expect(text(renderer)).toContain('Итого: 50');
  });
});

describe('Патч 561: склад и торговец по одному дизайну', () => {
  it('в складе: долгое нажатие открывает окно, построчных кнопок нет', () => {
    const storage = read('components/lootTrade/PartyStorageModal.js');
    expect(storage).toContain("import TransferQuantityModal from './TransferQuantityModal';");
    expect(storage).toContain("onLongPress={() => setQuantityModal({ kind: 'give', item, max: remaining })}");
    expect(storage).toContain("onLongPress={() => setQuantityModal({ kind: 'take', item: entry, max: remaining })}");
    expect(storage).not.toContain('storage-give-one-');
    expect(storage).not.toContain('storage-take-all-');
    expect(storage).toContain('localStyles.rowQtyBadge');
  });

  it('у торговца тот же механизм: покупка и продажа', () => {
    const trader = read('components/lootTrade/PlayerLootTradeOverlay.js');
    expect(trader).toContain("import TransferQuantityModal from './TransferQuantityModal';");
    expect(trader).toContain("kind: 'buy'");
    expect(trader).toContain("kind: 'sell'");
    expect(trader).toContain('<TransferQuantityModal');
    expect(trader).toContain('styles.rowQtyBadge');
  });

  it('строка: количество бейджем, название без обрезки (562)', () => {
    const storage = read('components/lootTrade/PartyStorageModal.js');
    // 562: имя рисует общий ItemNameLines (заголовок + строка модов), обрезки нет.
    expect(storage).not.toContain('tradeRowName} numberOfLines');
    expect(storage).toContain('ItemNameLines');
    const trader = read('components/lootTrade/PlayerLootTradeOverlay.js');
    expect(trader).toContain('rowQtyBadgeText');
    const styles = read('components/lootTrade/tradeOverlayStyles.js');
    expect(styles).toContain('rowQtyBadge');
  });

  it('ключи и вкладки склада не тронуты', () => {
    const storage = read('components/lootTrade/PartyStorageModal.js');
    expect(storage).toContain('storageTabs');
    expect(storage).toContain('renderKeysContent');
  });
});
