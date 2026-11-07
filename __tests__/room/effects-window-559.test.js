// Патч 559 — уточнение владельца после 558:
//
//   «А мы можем трансляцию оставить как есть. Она оффлайн не работает.
//    А посланные эффекты в стиле "что нового" при входе».
//
// Значит:
//   1) Трансляция (локация/торговец/терминал) — РОВНО как до 558: плашка и
//      окно работают по-прежнему, никакой привязки к открытому персонажу и
//      никаких записей в список уведомлений.
//   2) Присланные эффекты (уровень, крышки, лечение, увечья, медикаменты) —
//      одно окно в стиле «Что нового» при входе в персонажа, кнопка «Понятно».
//   3) На списке персонажей ничего не всплывает: там только синяя иконка
//      сервера на карточке того персонажа, кому пришло.
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
    text: 'Пайпер: +1 уровень (ур. 3)',
  });
  store.addNotice({
    id: 'ROOM1:dir_2:char_a',
    characterId: 'char_a',
    roomCode: 'ROOM1',
    roomName: 'Тапхаус',
    text: 'Пайпер: +50 крышек',
  });
};

describe('Патч 559: трансляция как раньше, эффекты — окном «Что нового» при входе', () => {
  beforeEach(async () => {
    await usePlayerNoticesStore.getState().resetForTests();
    usePlayerFocusStore.getState().resetForTests();
    useCharacterStore.getState().resetCharacterStore();
    useCharacterStore.setState({ currentCharacterId: 'char_a', characterName: 'Пайпер' });
  });

  it('склад уведомлений помнит персонажа, не дублирует и знает только эффекты', () => {
    seed();
    usePlayerNoticesStore.getState().addNotice({
      id: 'ROOM1:dir_1:char_a',
      characterId: 'char_a',
      text: 'дубль',
    });
    usePlayerNoticesStore.getState().addNotice({
      id: 'ROOM1:dir_9:char_b',
      characterId: 'char_b',
      text: 'чужое',
    });

    const { notices } = usePlayerNoticesStore.getState();
    expect(notices).toHaveLength(3); // дубль отброшен, чужое легло своему
    expect(notices.every((n) => n.kind === 'command')).toBe(true);
    expect(notices.every((n) => n.read === false)).toBe(true);

    usePlayerNoticesStore.getState().markReadForCharacter('char_a');
    const after = usePlayerNoticesStore.getState().notices;
    expect(after.filter((n) => n.characterId === 'char_a').every((n) => n.read)).toBe(true);
    expect(after.find((n) => n.characterId === 'char_b').read).toBe(false);
  });

  it('на списке персонажей окно не всплывает, при входе — список эффектов', async () => {
    seed();

    usePlayerFocusStore.getState().setHomeFocused(true);
    const onList = await mount();
    expect(onList.toJSON()).toBeNull();

    usePlayerFocusStore.getState().setHomeFocused(false);
    const inside = await mount();
    const text = allText(inside);
    expect(text).toContain('Что прислал Мастер');
    expect(text).toContain('Пайпер');
    expect(text).toContain('+1 уровень');
    expect(text).toContain('+50 крышек');
    expect(text).toContain('Тапхаус');
    expect(text).not.toContain('Трансляции');
    expect(inside.root.findByProps({ testID: 'player-notices-ok' })).toBeTruthy();
  });

  it('«Понятно» гасит эффекты этого персонажа и убирает окно', async () => {
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

  it('чужой персонаж не видит чужих эффектов', async () => {
    seed();
    useCharacterStore.setState({ currentCharacterId: 'char_b', characterName: 'Ник' });
    usePlayerFocusStore.getState().setHomeFocused(false);
    const renderer = await mount();
    expect(renderer.toJSON()).toBeNull();
  });

  it('трансляция не тронута: окно локации/торговца работает как до 558', () => {
    const overlaySrc = read('components/lootTrade/PlayerLootTradeOverlay.js');
    // Никакой привязки к фокусу игрока и никаких записей в список уведомлений.
    expect(overlaySrc).not.toContain('playerFocusStore');
    expect(overlaySrc).not.toContain('playerNoticesStore');
    expect(overlaySrc).not.toContain('homeFocused');
    expect(overlaySrc).not.toContain('focusedBindings');
    // Прежний отбор сессии по привязкам на месте.
    expect(overlaySrc).toContain("if (session.targetType === 'room' || session.targetCharacterId === bind.characterId)");
    const baseline = read('patchs/baseline.json');
    expect(baseline).toContain('"559"');
  });

  it('команды Мастера не всплывают поверх списка, а ложатся в окно персонажа', () => {
    const overlaySrc = read('components/gm/PlayerDirectiveOverlay.js');
    expect(overlaySrc).not.toContain('showRawAlert');
    expect(overlaySrc).toContain('usePlayerNoticesStore.getState().addNotice({');
    expect(overlaySrc).toContain('characterId,');
    const homeSrc = read('components/screens/HomeScreen/HomeScreen.js');
    expect(homeSrc).toContain(
      "const serverIconColor = hasNotices ? '#3b82f6' : (serverOnline ? '#16a34a' : '#9ca3af');",
    );
    expect(homeSrc).toContain('noticesCount={unreadNoticeCountFor(notices, item.id)}');
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

  it('ключи и склад не тронуты', () => {
    const storage = read('components/lootTrade/PartyStorageModal.js');
    expect(storage).toContain('storageTabs');
    expect(storage).not.toContain('playerNotices');
  });
});
