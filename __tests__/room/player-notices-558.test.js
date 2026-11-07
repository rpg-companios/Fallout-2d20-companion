// Патч 558 — «что Мастер прислал» приходит ЛИЧНО персонажу.
//
// Слово владельца:
//   1) На списке персонажей ничего не всплывает — меняется цвет иконки
//      сервера (синий) на карточке того персонажа, кому пришло.
//   2) Списком, что происходит: трансляции отдельно от разовых команд.
//      Уровень и т.п. — окно по типу релиза с кнопкой ОК.
//   3) Трансляция не даёт «доставлено»; у разовой команды — факт отправки.
//   4) Ключи/склад не трогаем.
import { describe, expect, it, vi, beforeEach } from 'vitest';
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
    StyleSheet: {
      create: (styles) => styles,
      flatten: (styles) => (Array.isArray(styles) ? Object.assign({}, ...styles.filter(Boolean)) : styles || {}),
    },
    Modal: ({ visible, children, ...props }) => (visible ? React.createElement('Modal', props, children) : null),
    View: host('View'),
    Text: host('Text'),
    TouchableOpacity: host('TouchableOpacity'),
    ScrollView: host('ScrollView'),
  };
});

vi.mock('@expo/vector-icons', () => ({
  MaterialCommunityIcons: ({ name, ...props }) => React.createElement('MaterialCommunityIcons', { name, ...props }),
}));

// Частичный мок локали — как в остальных render-тестах репозитория.
vi.mock('../../i18n/locale', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useLocale: () => 'ru-RU',
    getCurrentLocale: () => 'ru-RU',
    useModuleLocale: () => 'ru-RU',
  };
});

vi.mock('../../src/store/appSettingsStore', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, default: Object.assign(() => 'user', { getState: () => ({ uiMode: 'user' }) }), selectUiMode: () => 'user' };
});

vi.mock('../../src/room/uiModeStore', () => {
  const state = { tabUiMode: 'user' };
  const hook = (selector) => selector(state);
  hook.getState = () => state;
  hook.setState = (patch) => Object.assign(state, patch);
  return { default: hook, useUiModeStore: hook };
});

const usePlayerNoticesStore = (await import('../../src/room/playerNoticesStore')).default;
const { PLAYER_NOTICE_KIND } = await import('../../src/room/playerNoticesStore');
const usePlayerFocusStore = (await import('../../src/room/playerFocusStore')).default;
const useCharacterStore = (await import('../../src/store/characterStore')).default;
const PlayerNoticesModal = (await import('../../components/gm/PlayerNoticesModal')).default;

const allText = (renderer) => {
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

const mount = async () => {
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(PlayerNoticesModal));
  });
  return renderer;
};

const seed = () => {
  const store = usePlayerNoticesStore.getState();
  store.addNotice({
    id: 'ROOM1:dir_1:char_a',
    characterId: 'char_a',
    roomCode: 'ROOM1',
    roomName: 'Тапхаус',
    kind: PLAYER_NOTICE_KIND.COMMAND,
    text: 'Пайпер: +1 уровень (ур. 3)',
  });
  store.addNotice({
    id: 'ROOM1:session:sess_1:char_a',
    characterId: 'char_a',
    roomCode: 'ROOM1',
    roomName: 'Тапхаус',
    kind: PLAYER_NOTICE_KIND.TRANSLATION,
    text: 'Дом у дороги',
  });
};

describe('Патч 558: уведомления Мастера привязаны к персонажу', () => {
  beforeEach(async () => {
    await usePlayerNoticesStore.getState().resetForTests();
    usePlayerFocusStore.getState().resetForTests();
    useCharacterStore.getState().resetCharacterStore();
    useCharacterStore.setState({ currentCharacterId: 'char_a', characterName: 'Пайпер' });
  });

  it('склад уведомлений помнит персонажа, не дублирует и считает непрочитанное', () => {
    seed();
    usePlayerNoticesStore.getState().addNotice({
      id: 'ROOM1:dir_1:char_a',
      characterId: 'char_a',
      kind: PLAYER_NOTICE_KIND.COMMAND,
      text: 'дубль',
    });
    usePlayerNoticesStore.getState().addNotice({
      id: 'ROOM1:dir_9:char_b',
      characterId: 'char_b',
      kind: PLAYER_NOTICE_KIND.COMMAND,
      text: 'чужое',
    });

    const { notices } = usePlayerNoticesStore.getState();
    expect(notices).toHaveLength(3); // дубль не добавился, чужое — добавилось своему
    const mine = notices.filter((n) => n.characterId === 'char_a');
    expect(mine).toHaveLength(2);
    expect(mine.every((n) => n.read === false)).toBe(true);

    usePlayerNoticesStore.getState().markReadForCharacter('char_a');
    const after = usePlayerNoticesStore.getState().notices;
    expect(after.filter((n) => n.characterId === 'char_a').every((n) => n.read)).toBe(true);
    // Чужой персонаж не затронут.
    expect(after.find((n) => n.characterId === 'char_b').read).toBe(false);
  });

  it('на списке персонажей окно не всплывает, внутри персонажа — показывает оба раздела', async () => {
    seed();

    usePlayerFocusStore.getState().setHomeFocused(true);
    const onList = await mount();
    expect(onList.toJSON()).toBeNull();

    usePlayerFocusStore.getState().setHomeFocused(false);
    const inside = await mount();
    const text = allText(inside);
    expect(text).toContain('Сообщения Мастера');
    expect(text).toContain('Трансляции');
    expect(text).toContain('Мастер открыл: Дом у дороги');
    expect(text).toContain('Разовые команды');
    expect(text).toContain('+1 уровень');
    expect(inside.root.findByProps({ testID: 'player-notices-ok' })).toBeTruthy();
  });

  it('«Понятно» гасит уведомления этого персонажа и убирает окно', async () => {
    seed();
    usePlayerFocusStore.getState().setHomeFocused(false);
    const renderer = await mount();
    const ok = renderer.root.findByProps({ testID: 'player-notices-ok' });

    await act(async () => {
      ok.props.onPress();
    });

    expect(usePlayerNoticesStore.getState().notices.every((n) => n.read)).toBe(true);
    expect(renderer.toJSON()).toBeNull();
  });

  it('чужие уведомления не показываются тому, кто сидит за другим персонажем', async () => {
    seed();
    useCharacterStore.setState({ currentCharacterId: 'char_b', characterName: 'Ник' });
    usePlayerFocusStore.getState().setHomeFocused(false);
    const renderer = await mount();
    expect(renderer.toJSON()).toBeNull();
  });

  it('карточка в списке: синяя иконка сервера вместо всплывающего окна', () => {
    const homeSrc = read('components/screens/HomeScreen/HomeScreen.js');
    expect(homeSrc).toContain(
      "const serverIconColor = hasNotices ? '#3b82f6' : (serverOnline ? '#16a34a' : '#9ca3af');",
    );
    expect(homeSrc).toContain('noticesCount={unreadNoticeCountFor(notices, item.id)}');
    // В списке персонажей окно Мастера больше не всплывает: о пришедшем
    // сообщает только цвет иконки.
    expect(homeSrc).not.toContain('subscribePlayerDirectiveApplied(() => {\n      showRawAlert');
  });

  it('трансляция идёт только открытому персонажу и не всплывает на списке', () => {
    const overlaySrc = read('components/lootTrade/PlayerLootTradeOverlay.js');
    expect(overlaySrc).toContain('const homeFocused = usePlayerFocusStore((s) => s.homeFocused);');
    expect(overlaySrc).toContain('const focusedBindings = useMemo(');
    expect(overlaySrc).toContain('return bindings.filter((bind) => bind.characterId === currentCharacterId);');
    expect(overlaySrc.match(/if \(isGmMode \|\| homeFocused === true \|\| focusedBindings\.length === 0\) return null;/g))
      .toHaveLength(2);
    expect(overlaySrc).toContain('PLAYER_NOTICE_KIND.TRANSLATION');
  });

  it('команды Мастера больше не всплывают поверх списка, а ложатся в список персонажа', () => {
    const overlaySrc = read('components/gm/PlayerDirectiveOverlay.js');
    expect(overlaySrc).not.toContain('showRawAlert');
    expect(overlaySrc).toContain('usePlayerNoticesStore.getState().addNotice({');
    expect(overlaySrc).toContain('characterId,');
    expect(overlaySrc).toContain('PLAYER_NOTICE_KIND.COMMAND');
  });

  it('у Мастера только факт отправки: «Доставлено» из интерфейса ушло', () => {
    const gmI18n = read('modules/fallout/gm/gmI18n.js');
    expect(gmI18n).not.toContain('deliveryDone');
    expect(gmI18n).toContain("sentBadge: 'Отправлено: {total}'");
    expect(gmI18n).toContain("sentBadge: 'Sent: {total}'");
    const homeSrc = read('components/screens/HomeScreen/HomeScreen.js');
    expect(homeSrc).toContain("tGm('roomBar.sentBadge', locale)");
    expect(homeSrc).not.toContain('acked >= total');
  });

  it('ключи и склад патч не трогает', () => {
    const storage = read('components/lootTrade/PartyStorageModal.js');
    expect(storage).toContain('storageTabs');
    expect(storage).not.toContain('playerNotices');
  });
});
