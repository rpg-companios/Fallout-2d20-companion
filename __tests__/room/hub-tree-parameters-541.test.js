// Патч 541: кнопка «Параметры» в правой части строки названия у каждого
// элемента дерева хаба; название больше не открывает настройки. Отдельные
// области «Ключи и записки в локации», «Ворота между точками» и кнопка
// «Добавить контейнер / торговца» убраны с экрана локации.
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { create, act } from 'react-test-renderer';

vi.mock('react-native', () => {
  const React = require('react');
  const host = (name) => ({ children, ...props }) => React.createElement(name, props, children);
  return {
    View: host('View'),
    Text: host('Text'),
    TouchableOpacity: host('TouchableOpacity'),
    TextInput: host('TextInput'),
    ScrollView: host('ScrollView'),
    StyleSheet: { create: (styles) => styles },
  };
});

vi.mock('@expo/vector-icons', () => ({
  MaterialCommunityIcons: () => null,
}));

vi.mock('../../i18n/locale', () => ({
  useLocale: () => 'ru-RU',
}));

vi.mock('../../components/screens/LootTradeScreen/logic/lootTradeI18n', () => ({
  tLootTrade: (key) => key,
  formatLootTrade: (template, values) => `${template}:${JSON.stringify(values || {})}`,
}));

import HubTreeView from '../../components/screens/LootTradeScreen/modals/HubTreeView';
import { CONTAINER_KIND, normalizeContainerEntity } from '../../domain/lootTrade';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

const hub = (id, extra = {}) => normalizeContainerEntity({
  id,
  kind: CONTAINER_KIND.HUB,
  name: id,
  roomCodes: ['GM-AAA111'],
  ...extra,
});

const child = (id, kind) => normalizeContainerEntity({ id, kind, name: id });

const findAll = (root, testID) => root.findAll((node) => node.props?.testID === testID);

describe('541: «Параметры» у каждой строки дерева, название не кликабельно', () => {
  const setup = () => {
    const nested = hub('nested', { parentLocationId: 'root', keyItemIds: ['key-nested'] });
    const deepChest = child('deep-chest', CONTAINER_KIND.LOOT);
    nested.links = [{ containerId: deepChest.id, locked: false, lockLabel: '' }];
    const containers = [
      hub('root', { keyItemIds: ['key-root'] }),
      nested,
      child('chest', CONTAINER_KIND.LOOT),
      child('merchant', CONTAINER_KIND.MERCHANT),
      child('terminal', CONTAINER_KIND.TERMINAL),
      child('lock', CONTAINER_KIND.LOCK),
      deepChest,
    ];
    containers[0].links = ['chest', 'merchant', 'terminal', 'lock'].map((id) => ({
      containerId: id, locked: false, lockLabel: '',
    }));
    const keyItems = [
      { id: 'key-root', name: 'Ключ корня' },
      { id: 'key-nested', name: 'Ключ вложенной' },
    ];
    const onOpenSettings = vi.fn();
    const onOpenKeySettings = vi.fn();
    let renderer;
    act(() => {
      renderer = create(React.createElement(HubTreeView, {
        hub: containers[0],
        containers,
        keyItems,
        onOpenSettings,
        onOpenKeySettings,
      }));
    });
    return { renderer, containers, onOpenSettings, onOpenKeySettings };
  };

  it('название элемента не имеет onPress', () => {
    const { renderer } = setup();
    for (const id of ['nested', 'chest', 'merchant', 'terminal', 'lock', 'key-root']) {
      const testID = id === 'key-root' ? `hub-tree-key-${id}` : `hub-tree-node-${id}`;
      const [title] = findAll(renderer.root, testID);
      expect(title, testID).toBeTruthy();
      expect(title.props.onPress).toBeUndefined();
    }
  });

  it('кнопка «Параметры» есть у всех типов прямых элементов и открывает настройки', () => {
    const { renderer, containers, onOpenSettings } = setup();
    for (const id of ['nested', 'chest', 'merchant', 'terminal', 'lock']) {
      const [button] = findAll(renderer.root, `hub-tree-parameters-${id}`);
      expect(button, id).toBeTruthy();
      act(() => button.props.onPress());
      expect(onOpenSettings).toHaveBeenCalledWith(containers.find((c) => c.id === id));
    }
  });

  it('ключи — строки дерева с «Параметрами»', () => {
    const { renderer, onOpenKeySettings } = setup();
    const [button] = findAll(renderer.root, 'hub-tree-parameters-key-key-root');
    expect(button).toBeTruthy();
    act(() => button.props.onPress());
    expect(onOpenKeySettings).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'key-root', name: 'Ключ корня' }),
      expect.objectContaining({ id: 'root' }),
    );
  });

  it('у вложенных элементов после раскрытия тоже есть «Параметры»', () => {
    const { renderer, onOpenSettings, onOpenKeySettings } = setup();
    const [toggle] = findAll(renderer.root, 'hub-tree-toggle-nested');
    act(() => toggle.props.onPress());
    const [deepButton] = findAll(renderer.root, 'hub-tree-parameters-deep-chest');
    expect(deepButton).toBeTruthy();
    act(() => deepButton.props.onPress());
    expect(onOpenSettings).toHaveBeenCalledWith(expect.objectContaining({ id: 'deep-chest' }));
    const [keyButton] = findAll(renderer.root, 'hub-tree-parameters-key-key-nested');
    expect(keyButton).toBeTruthy();
    act(() => keyButton.props.onPress());
    expect(onOpenKeySettings).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'key-nested' }),
      expect.objectContaining({ id: 'nested' }),
    );
  });
});

describe('541: экран локации без удалённых областей', () => {
  const screen = read('components/screens/LootTradeScreen/LootTradeScreen.js');
  const tree = read('components/screens/LootTradeScreen/modals/HubTreeView.js');

  it('области ключей/ворот и кнопка добавления контейнера/торговца убраны', () => {
    expect(screen).not.toContain("tLootTrade('detail.hubKeysTitle')");
    expect(screen).not.toContain("tLootTrade('detail.hubGatesTitle')");
    expect(screen).not.toContain("tLootTrade('detail.addHubNode')");
    expect(screen).not.toContain('hub-key-detach-');
    expect(screen).not.toContain('hub-gate-');
  });

  it('дерево получает ключи и обработчик их параметров', () => {
    expect(screen).toContain('keyItems={keyItems}');
    expect(screen).toContain('onOpenKeySettings=');
    expect(tree).toContain('hub-tree-parameters-${container.id}');
    expect(tree).toContain('hub-tree-parameters-key-${keyId}');
    expect(tree).toContain("tLootTrade('detail.editSettings')");
  });

  it('подпись пустого хаба больше не ссылается на удалённую кнопку', () => {
    const ru = JSON.parse(read('i18n/ru-RU/screens/lootTrade/screen.json'));
    const en = JSON.parse(read('i18n/en-EN/screens/lootTrade/screen.json'));
    expect(ru.detail.emptyHubNodes).not.toContain('Добавить контейнер');
    expect(en.detail.emptyHubNodes).not.toContain('Add container');
    expect(ru.detail.editSettings).toBe('Параметры');
  });
});
