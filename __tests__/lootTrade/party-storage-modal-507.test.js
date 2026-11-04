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
    TouchableOpacity: mk('TouchableOpacity'),
    ScrollView: mk('ScrollView'),
  };
});
vi.mock('../../i18n/locale', () => ({ useLocale: () => {}, getCurrentLocale: () => 'ru-RU' }));
vi.mock('../../components/alerts/alertService', () => ({ showRawAlert: vi.fn() }));
// Патч 509: модалка теперь работает с файлами и локальной БД; в рендер-тесте
// достаточно заглушек, реальный IO проверяют тесты формата.
vi.mock('../../db', () => ({
  saveRoomStorage: vi.fn(async () => null),
  getRoomStorage: vi.fn(async () => null),
  getAllRoomStorages: vi.fn(async () => []),
}));
vi.mock('../../src/utils/characterFileTransfer', () => ({
  saveCharacter: vi.fn(async () => ({ success: true })),
  loadCharacter: vi.fn(async () => null),
}));

import PartyStorageModal from '../../components/lootTrade/PartyStorageModal';
import useRoomStore from '../../src/room/roomStore';

const texts = (renderer) => renderer.root.findAllByType('Text')
  .map((node) => String(node.props.children ?? ''));

describe('507: окно «Общее хранилище» в инвентаре', () => {
  beforeEach(() => {
    useRoomStore.setState({
      clientId: 'p1',
      rooms: {
        ROOM1: {
          code: 'ROOM1',
          role: 'player',
          partyStorage: {
            revision: 1,
            entries: [{
              entryId: 'st_1',
              item: { id: 'w1', name: 'Пулемёт', itemType: 'weapon' },
              name: 'Пулемёт',
              itemType: 'weapon',
              quantity: 1,
            }],
          },
        },
      },
    });
  });

  it('показывает фиксированное название и общие вещи', async () => {
    let renderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <PartyStorageModal
          visible
          inventoryItems={[{ id: 'i1', name: 'Аптечка', itemType: 'chem' }]}
          onClose={() => {}}
          onDepositLocal={() => {}}
          onWithdrawLocal={() => {}}
        />,
      );
      await Promise.resolve();
    });
    const all = texts(renderer);
    expect(all.some((t) => t.includes('Общее хранилище'))).toBe(true);
    expect(all.some((t) => t.includes('Пулемёт'))).toBe(true);
    expect(all.some((t) => t.includes('Аптечка'))).toBe(true);
    // Патч 518: предметы сначала ложатся в буфер, перенос — по кнопке.
    expect(all.some((t) => t.includes('Отдаю на склад'))).toBe(true);
    expect(all.some((t) => t.includes('Забираю себе'))).toBe(true);
    expect(all.some((t) => t.includes('Перенести'))).toBe(true);
    // Настройки имени нет.
    expect(all.some((t) => t.toLowerCase().includes('переименовать'))).toBe(false);
    await act(async () => renderer.unmount());
  });

  it('без подключённой комнаты честно говорит об этом', async () => {
    useRoomStore.setState({ rooms: {} });
    let renderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <PartyStorageModal visible onClose={() => {}} />,
      );
      await Promise.resolve();
    });
    expect(texts(renderer).some((t) => t.includes('Нет подключённой комнаты'))).toBe(true);
    await act(async () => renderer.unmount());
  });
});
