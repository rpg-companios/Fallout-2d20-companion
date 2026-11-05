// Патч 536: строка статуса разнесена на ДВА вертикальных контейнера по слову
// владельца («1-й Правила, 2-й сведения»). Сверху заметный счётчик заколок,
// под ним блок «Правила» (описание мини-игры), затем блок «Сведения»
// (сложность, LOCKPICK, навык/восприятие/удача). Перенос длинного описания
// внутри блока правил сохранён (закон 531/534).
import React, { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-native', () => {
  const mk = (tag) => ({ children, ...props }) => React.createElement(tag, props, children);
  return {
    Platform: { OS: 'web' },
    StyleSheet: {
      create: (styles) => styles,
      flatten: (styles) => (Array.isArray(styles) ? Object.assign({}, ...styles.filter(Boolean)) : styles || {}),
    },
    Modal: ({ visible, children, ...props }) => (visible ? React.createElement('Modal', props, children) : null),
    View: mk('View'), Text: mk('Text'), TextInput: mk('TextInput'),
    TouchableOpacity: mk('TouchableOpacity'), ScrollView: mk('ScrollView'), Image: mk('Image'),
    KeyboardAvoidingView: mk('KeyboardAvoidingView'),
    Animated: { Value: class { constructor(v) { this.value = v; } setValue() {} }, timing: () => ({ start() {} }) },
    useWindowDimensions: () => ({ width: 390, height: 700 }),
  };
});
vi.mock('@expo/vector-icons', () => ({
  MaterialCommunityIcons: ({ name, ...props }) => React.createElement('MaterialCommunityIcons', { name, ...props }),
}));
vi.mock('../../components/alerts/alertService', () => ({ showRawAlert: vi.fn() }));
vi.mock('../../src/room/roomCharacterSync', () => ({
  pushSavedCharacterToBoundRoomIfAny: vi.fn(async () => true),
}));
vi.mock('../../components/lootTrade/spendBobbyPins', () => ({
  spendBobbyPins: vi.fn(async () => 1),
}));

import LockPickingModal from '../../components/lootTrade/LockPickingModal';
import { lockLightStyles } from '../../components/lootTrade/lockPickingStyles';
import { setCurrentLocale } from '../../i18n/locale';
import useCharacterStore from '../../src/store/characterStore';
import useRoomStore from '../../src/room/roomStore';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');
const json = (rel) => JSON.parse(read(rel));
const LOCK = { containerId: 'l1', name: 'Замок', description: '', difficulty: 2, kind: 'lock' };
const playing = () => ({
  status: 'playing', kind: 'lock', result: '',
  cells: [
    { arrow: null, state: 'red' },
    { arrow: 'left', state: 'grey' },
    { arrow: null, state: 'hidden' },
    { arrow: null, state: 'hidden' },
  ],
  rows: [4], cellCount: 4, cursor: 0, per: 8, luck: 4, skill: 3, difficulty: 2,
  pinsRemaining: 3, pinActive: true, brokenPins: 0, revision: 1,
  operatorClientId: 'client-1', operatorCharacterId: 'ch1',
});
const roomWith = (game) => ({
  joined: true,
  capabilities: { terminalHacking: true, lockPicking: true },
  terminalStates: {
    l1: { containerId: 'l1', accessId: 'broadcast-1', config: LOCK, game, closed: false, locked: false, awaitingGm: false },
  },
});

const renderers = [];
const render = async () => {
  let renderer;
  await act(async () => {
    renderer = TestRenderer.create(
      <LockPickingModal visible lock={LOCK} roomCode="ROOM1" onClose={() => {}} />,
    );
    await Promise.resolve();
  });
  renderers.push(renderer);
  return renderer;
};
const flat = (style) => (Array.isArray(style)
  ? Object.assign({}, ...style.filter(Boolean))
  : (style || {}));
const byId = (node, id) => (node.root || node).findAllByProps({ testID: id })[0];
const textsOf = (node) => node.findAllByType('Text')
  .map((n) => (Array.isArray(n.props.children) ? n.props.children.join('') : String(n.props.children)));

beforeEach(() => {
  vi.clearAllMocks();
  setCurrentLocale('ru-RU');
  useCharacterStore.setState({
    currentCharacterId: 'ch1', characterName: 'Сталкер',
    attributes: { PER: { base: 8 } }, skills: { LOCKPICK: { base: 3 } },
    items: { p: { weaponId: 'item_bobby_pin', quantity: 4 } },
  });
  useRoomStore.setState({
    clientId: 'client-1', rooms: { ROOM1: roomWith(playing()) },
    actOnTerminal: vi.fn(async () => ({ game: null })),
  });
});
afterEach(async () => {
  for (const renderer of renderers.splice(0)) {
    try { await act(async () => renderer.unmount()); } catch { /* уже снято */ }
  }
});

describe('536: два вертикальных контейнера — Правила и Сведения', () => {
  it('старая двухколоночная строка убрана, есть вертикальная колонка', () => {
    const source = read('components/lootTrade/LockPickingModal.js');
    expect(source).not.toContain('styles.statusRow');
    expect(source).not.toContain('styles.statusLeft');
    expect(source).toContain('<View style={styles.statusColumn}>');
    expect(lockLightStyles.statusColumn.flexDirection).toBe('column');
    expect(lockLightStyles.statusRow).toBeUndefined();
    expect(lockLightStyles.statusLeft).toBeUndefined();
  });

  it('оба контейнера на месте: сначала Правила, потом Сведения', async () => {
    const renderer = await render();
    const rules = byId(renderer, 'lock-rules-block');
    const info = byId(renderer, 'lock-info-block');
    expect(rules).toBeTruthy();
    expect(info).toBeTruthy();
    // Оба блока живут в одной вертикальной колонке (statusColumn).
    const column = renderer.root.findAllByProps({ style: lockLightStyles.statusColumn });
    expect(column.length).toBeGreaterThan(0);
    expect(column.some((c) => c.findAllByProps({ testID: 'lock-rules-block' }).length > 0)).toBe(true);
    expect(column.some((c) => c.findAllByProps({ testID: 'lock-info-block' }).length > 0)).toBe(true);
    // В разметке Правила идут раньше Сведений.
    const source = read('components/lootTrade/LockPickingModal.js');
    expect(source.indexOf('testID="lock-rules-block"')).toBeGreaterThan(-1);
    expect(source.indexOf('testID="lock-rules-block"'))
      .toBeLessThan(source.indexOf('testID="lock-info-block"'));
  });

  it('блок Правил содержит заголовок и описание мини-игры', async () => {
    const renderer = await render();
    const rules = byId(renderer, 'lock-rules-block');
    const texts = textsOf(rules);
    expect(texts.some((t) => t === json('i18n/ru-RU/screens/lootTrade/screen.json').lock.rulesTitle)).toBe(true);
    expect(texts.some((t) => t === json('i18n/ru-RU/screens/lootTrade/screen.json').lock.arrowsHint)).toBe(true);
    expect(byId(rules, 'lock-arrows-hint')).toBeTruthy();
  });

  it('блок Сведений содержит сложность, LOCKPICK и навык/восприятие/удачу', async () => {
    const renderer = await render();
    const info = byId(renderer, 'lock-info-block');
    const texts = textsOf(info);
    const ru = json('i18n/ru-RU/screens/lootTrade/screen.json').lock;
    expect(texts.some((t) => t === ru.infoTitle)).toBe(true);
    expect(texts.some((t) => t === 'Сложность 2 · 4 ячеек')).toBe(true);
    expect(texts.some((t) => t === 'LOCKPICK')).toBe(true);
    expect(texts.some((t) => t === 'Навык 3 · Восприятие 8 · Удача 4')).toBe(true);
    // Описание правил НЕ попало в блок сведений.
    expect(texts.some((t) => t === ru.arrowsHint)).toBe(false);
  });

  it('счётчик заколок остаётся сверху заметным, вне двух блоков', async () => {
    const renderer = await render();
    const counter = byId(renderer, 'lock-pins-count');
    expect(counter).toBeTruthy();
    expect(flat(counter.props.style).fontSize).toBe(17);
    const rules = byId(renderer, 'lock-rules-block');
    const info = byId(renderer, 'lock-info-block');
    expect(rules.findAllByProps({ testID: 'lock-pins-count' }).length).toBe(0);
    expect(info.findAllByProps({ testID: 'lock-pins-count' }).length).toBe(0);
  });

  it('перенос описания сохранён: rulesBlock сжимается, arrowsHint переносится', () => {
    expect(lockLightStyles.rulesBlock.flexShrink).toBe(1);
    expect(lockLightStyles.rulesBlock.minWidth).toBe(0);
    expect(lockLightStyles.arrowsHint.flexShrink).toBe(1);
    expect(lockLightStyles.arrowsHint.maxWidth).toBe('100%');
  });

  it('заголовки блоков парные в RU/EN', () => {
    const ru = json('i18n/ru-RU/screens/lootTrade/screen.json').lock;
    const en = json('i18n/en-EN/screens/lootTrade/screen.json').lock;
    expect(ru.rulesTitle).toBe('Правила');
    expect(ru.infoTitle).toBe('Сведения');
    expect(en.rulesTitle).toBe('Rules');
    expect(en.infoTitle).toBe('Details');
    expect(Object.keys(ru).sort()).toEqual(Object.keys(en).sort());
  });
});
