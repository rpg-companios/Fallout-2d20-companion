// Патч 531 удалил по слову владельца ровно четыре правила кнопки стрелки:
// `flex: 0`, `backgroundColor: '#dadada'`, `width: 58`, `height: 50`.
//
// Патч 533 откатил ИЗБЫТОЧНЫЕ правки 531: возвращены рамка/радиус/
// нулевые паддинги кнопки, рамка области, базовые стили формы, иконка 30
// и пустышки 58×50. Оставлены четыре названных removal'а и центрирование.
// Патч 534 ВЕРНУЛ перенос длинного описания: flexShrink/maxWidth снова на
// месте (владелец не просил их откатывать). Патч 536 разнёс строку статуса на
// два вертикальных контейнера — «Правила» (rulesBlock) и «Сведения»
// (infoBlock); перенос описания внутри rulesBlock сохранён.
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
import { modalStyles, lockLightStyles, LOCK_PALETTE } from '../../components/lootTrade/lockPickingStyles';
import useCharacterStore from '../../src/store/characterStore';
import useRoomStore from '../../src/room/roomStore';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');
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

beforeEach(() => {
  vi.clearAllMocks();
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

describe('531: начертание стрелок до светлой темы', () => {
  it('иконки ровно те же, что в 520–524 (arrow-*-bold), включая ячейки', () => {
    const source = read('components/lootTrade/LockPickingModal.js');
    for (const dir of ['left', 'up', 'right', 'down']) {
      expect(source).toContain(`${dir}: 'arrow-${dir}-bold'`);
      expect(source).toContain(`${dir}: 'arrow-${dir}'`); // CELL_ICON не менялся
    }
    // Патч 533: иконка нажимной стрелки снова 30 (в ячейках осталась 22).
    expect(source).toContain('size={30}');
    const arrowBlock = source
      .slice(source.indexOf('const arrowButton'), source.indexOf('const hasBoard'));
    expect(arrowBlock).toContain('size={30}');
  });

  it('патч 533 вернул базовые стили формы 525 в массив стилей кнопки', () => {
    const source = read('components/lootTrade/LockPickingModal.js');
    const arrowBlock = source
      .slice(source.indexOf('const arrowButton'), source.indexOf('const hasBoard'))
      .replace(/\/\/.*$/gm, ''); // комментарии не должны влиять на проверку кода
    expect(arrowBlock).toContain('modalStyles.btn');
    expect(arrowBlock).toContain('modalStyles.saveBtn');
    expect(arrowBlock).toContain('styles.arrowButton');
  });

  it('патч 533 вернул рамки, радиус и нулевые паддинги; четыре removal 531 в силе', () => {
    const pad = lockLightStyles.arrowPad;
    const button = lockLightStyles.arrowButton;
    expect(pad.borderWidth).toBe(1);
    expect(pad.borderColor).toBe(LOCK_PALETTE.borderMuted);
    expect(pad.backgroundColor).toBe(LOCK_PALETTE.surfaceMuted);
    expect(button.borderWidth).toBe(1.5);
    expect(button.borderColor).toBe('#9a9a9a');
    expect(button.borderRadius).toBe(6);
    expect(button.paddingHorizontal).toBe(0);
    expect(button.paddingVertical).toBe(0);
    // Ровно то, что просил владелец в 531.
    expect(button.flex).toBeUndefined();
    expect(button.backgroundColor).toBeUndefined();
    expect(button.width).toBeUndefined();
    expect(button.height).toBeUndefined();
  });

  it('иконка центрирована по обеим осям, как до светлой темы', () => {
    expect(lockLightStyles.arrowButton.alignItems).toBe('center');
    expect(lockLightStyles.arrowButton.justifyContent).toBe('center');
  });

  it('цветовая гамма осталась СВЕТЛОЙ, а не зелёной 524', async () => {
    const renderer = await render();
    const button = renderer.root.findAllByProps({ testID: 'lock-arrow-up' })[0];
    // Базовый saveBtn снова даёт светлую подложку кнопки (откат 533).
    expect(flat(button.props.style).backgroundColor).toBe(modalStyles.saveBtn.backgroundColor);
    const pad = renderer.root.findAllByProps({ testID: 'lock-arrow-pad' })[0];
    expect(flat(pad.props.style).backgroundColor).toBe(LOCK_PALETTE.surfaceMuted);
    const icon = button.findAllByType('MaterialCommunityIcons')[0];
    expect(icon.props.name).toBe('arrow-up-bold');
    expect(icon.props.size).toBe(30);
    expect(icon.props.color).toBe(LOCK_PALETTE.text);
    expect(icon.props.color).not.toBe('#c8efb8');
  });

  it('законы 527 не регрессируют: тёмнее карточки, шире шаг, подсказка', async () => {
    const renderer = await render();
    const pad = renderer.root.findAllByProps({ testID: 'lock-arrow-pad' })[0];
    expect(flat(pad.props.style).backgroundColor).toBe(LOCK_PALETTE.surfaceMuted);
    expect(flat(pad.props.style).backgroundColor).not.toBe(modalStyles.card.backgroundColor);
    expect(lockLightStyles.crossRow.gap).toBeGreaterThan(8);
    expect(renderer.root.findAllByProps({ testID: 'lock-arrows-hint' }).length).toBeGreaterThan(0);
    expect(renderer.root.findAllByType('ScrollView').length).toBeGreaterThan(0);
  });

  it('патч 534 вернул перенос описания (536: блок правил): flexShrink/maxWidth на месте', async () => {
    const renderer = await render();
    const hint = renderer.root.findAllByProps({ testID: 'lock-arrows-hint' })[0];
    const style = flat(hint.props.style);
    expect(style.flexShrink).toBe(1);
    expect(style.maxWidth).toBe('100%');
    // Патч 536: описание живёт в отдельном блоке «Правила», который сжимается
    // до ширины карточки (закон переноса 531/534 сохранён).
    expect(lockLightStyles.rulesBlock.flexShrink).toBe(1);
    expect(lockLightStyles.rulesBlock.minWidth).toBe(0);
    const source = read('components/lootTrade/LockPickingModal.js');
    expect(source).toContain('testID="lock-rules-block"');
  });

  it('все четыре кнопки на месте и нажимаемы', async () => {
    const renderer = await render();
    for (const dir of ['up', 'left', 'down', 'right']) {
      const button = renderer.root.findAllByProps({ testID: `lock-arrow-${dir}` })[0];
      expect(button).toBeTruthy();
      expect(button.props.disabled).toBe(false);
      expect(button.findAllByType('MaterialCommunityIcons')[0].props.size).toBe(30);
    }
  });
});
