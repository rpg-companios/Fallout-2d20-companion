// Патч 531: владелец проверил стрелки — «всё равно с какими полосами через
// центр». Просьба: «вернём стрелки, которые были до внедрения светлой темы.
// Только то начертание или иконки стрелок. Их форма была хороша, только
// цветовая гамма была не та».
//
// Иконки `arrow-*-bold` не менялись с 520; «полосы» давала обвязка: базовые
// стили формы 525 (рамка + paddingVertical без justifyContent), рамки 527 и
// размер 30. Возвращаем до-светлое начертание, оставляя светлую палитру,
// затемнённую область, увеличенный шаг и подсказку 527.
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
    expect(source).toContain('size={22}');
    expect(source).not.toContain('size={30}');
  });

  it('кнопка стрелки больше не наследует базовые стили формы 525', () => {
    const source = read('components/lootTrade/LockPickingModal.js');
    // В массиве стилей кнопки нет modalStyles.btn / saveBtn: именно они
    // добавляли рамку и paddingVertical без вертикального центрирования.
    expect(source).toContain('style={[styles.arrowButton, !canPress && styles.arrowButtonDisabled]}');
    const arrowBlock = source
      .slice(source.indexOf('const arrowButton'), source.indexOf('const hasBoard'))
      .replace(/\/\/.*$/gm, ''); // комментарии не должны влиять на проверку кода
    expect(arrowBlock).not.toContain('modalStyles.btn');
    expect(arrowBlock).not.toContain('modalStyles.saveBtn');
  });

  it('никаких рамок/полос и никакой коробки у кнопки: только заливка области', () => {
    const pad = lockLightStyles.arrowPad;
    const button = lockLightStyles.arrowButton;
    expect(pad.borderWidth).toBeUndefined();
    expect(pad.borderColor).toBeUndefined();
    expect(pad.backgroundColor).toBe(LOCK_PALETTE.surfaceMuted);
    expect(button.borderWidth).toBeUndefined();
    expect(button.borderColor).toBeUndefined();
    // Зацепка владельца: flex: 0 → в браузере `flex: 0 1 0%` схлопывал
    // кнопку и рисовал линию; фон/размеры кнопки тоже убраны.
    expect(button.flex).toBeUndefined();
    expect(button.backgroundColor).toBeUndefined();
    expect(button.width).toBeUndefined();
    expect(button.height).toBeUndefined();
    expect(button.paddingHorizontal).toBeGreaterThan(0); // осталась зона нажатия
    expect(button.paddingVertical).toBeGreaterThan(0);
  });

  it('иконка центрирована по обеим осям, как до светлой темы', () => {
    expect(lockLightStyles.arrowButton.alignItems).toBe('center');
    expect(lockLightStyles.arrowButton.justifyContent).toBe('center');
  });

  it('цветовая гамма осталась СВЕТЛОЙ, а не зелёной 524', async () => {
    const renderer = await render();
    const button = renderer.root.findAllByProps({ testID: 'lock-arrow-up' })[0];
    expect(flat(button.props.style).backgroundColor).toBeUndefined();
    const pad = renderer.root.findAllByProps({ testID: 'lock-arrow-pad' })[0];
    expect(flat(pad.props.style).backgroundColor).toBe(LOCK_PALETTE.surfaceMuted);
    const icon = button.findAllByType('MaterialCommunityIcons')[0];
    expect(icon.props.name).toBe('arrow-up-bold');
    expect(icon.props.size).toBe(22);
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

  it('подсказка правил переносится внутри модалки, а не уходит одной строкой', async () => {
    const renderer = await render();
    const hint = renderer.root.findAllByProps({ testID: 'lock-arrows-hint' })[0];
    const style = flat(hint.props.style);
    expect(style.flexShrink).toBe(1);
    expect(style.maxWidth).toBe('100%');
    // Родитель-колонка сжимается до ширины карточки: иначе row-контейнер
    // берёт ширину длиннейшей строки и вылезает за границы окна.
    expect(lockLightStyles.statusLeft.flex).toBe(1);
    expect(lockLightStyles.statusLeft.flexShrink).toBe(1);
    expect(lockLightStyles.statusLeft.minWidth).toBe(0);
    const source = read('components/lootTrade/LockPickingModal.js');
    expect(source).toContain('<View style={styles.statusLeft}>');
  });

  it('все четыре кнопки на месте и нажимаемы', async () => {
    const renderer = await render();
    for (const dir of ['up', 'left', 'down', 'right']) {
      const button = renderer.root.findAllByProps({ testID: `lock-arrow-${dir}` })[0];
      expect(button).toBeTruthy();
      expect(button.props.disabled).toBe(false);
      expect(button.findAllByType('MaterialCommunityIcons')[0].props.size).toBe(22);
    }
  });
});
