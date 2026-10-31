import React, { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { describe, it, expect, beforeEach, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-native', () => {
  const mk = (tag) => ({ children, ...props }) => React.createElement(tag, props, children);
  return {
    Platform: { OS: 'web' },
    StyleSheet: {
      create: (styles) => styles,
      flatten: (s) => (Array.isArray(s) ? Object.assign({}, ...s.filter(Boolean)) : s || {}),
    },
    Modal: ({ visible, children, ...props }) =>
      visible ? React.createElement('Modal', props, children) : null,
    View: mk('View'),
    Text: mk('Text'),
    TextInput: mk('TextInput'),
    TouchableOpacity: mk('TouchableOpacity'),
    ScrollView: mk('ScrollView'),
    KeyboardAvoidingView: mk('KeyboardAvoidingView'),
    Image: mk('Image'),
  };
});

vi.mock('@expo/vector-icons', () => ({
  MaterialCommunityIcons: ({ name, size, color, ...props }) =>
    React.createElement('MaterialCommunityIcons', { name, size, color, ...props }),
}));

vi.mock('../../components/alerts/alertService', () => ({
  showRawAlert: vi.fn(),
}));

vi.mock('../../modules/fallout/assets/backgrounds/caps.png', () => ({ default: 'caps.png' }));
vi.mock('../../assets/CD.png', () => ({ default: 'cd.png' }));

import { setCurrentLocale } from '../../i18n/locale';
import { CONTAINER_KIND, QUANTITY_UNIT } from '../../domain/lootTrade';
import ContainerFormModal from '../../components/screens/LootTradeScreen/modals/ContainerFormModal';

const collectText = (node) => {
  if (node == null) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(collectText).join('');
  if (node.children) return node.children.map(collectText).join('');
  return '';
};

describe('Patch 477 — Merchant modal controls: no ±10 buttons, dark dice-d20 icon, and full-height CD icon', () => {
  beforeEach(() => {
    setCurrentLocale('ru-RU');
  });

  it('removes −10 and +10 caps buttons, keeps − and +, renders full-height CdIcon and dark dice-d20 icon', () => {
    const onSave = vi.fn();
    let renderer;

    act(() => {
      renderer = TestRenderer.create(
        React.createElement(ContainerFormModal, {
          visible: true,
          kind: CONTAINER_KIND.MERCHANT,
          availableRooms: [{ code: 'GM-7Q3K9M', name: 'Мохаве' }],
          availableHubs: [],
          onSave,
          onClose: () => {},
        }),
      );
    });

    const fullText = collectText(renderer.toJSON());
    // −10 and +10 buttons are gone
    expect(fullText).not.toContain('−10');
    expect(fullText).not.toContain('+10');

    // − and + step caps by 1
    const minusBtn = renderer.root.findByProps({ testID: 'merchant-caps-minus' });
    const plusBtn = renderer.root.findByProps({ testID: 'merchant-caps-plus' });
    const capsInput = renderer.root.findByProps({ testID: 'merchant-caps-input' });
    const initialVal = parseInt(capsInput.props.value, 10);

    act(() => {
      plusBtn.props.onPress();
    });
    expect(parseInt(renderer.root.findByProps({ testID: 'merchant-caps-input' }).props.value, 10)).toBe(
      initialVal + 1,
    );

    act(() => {
      minusBtn.props.onPress();
    });
    expect(parseInt(renderer.root.findByProps({ testID: 'merchant-caps-input' }).props.value, 10)).toBe(
      initialVal,
    );

    // CD button has height 40 (1px border => 38px inner vertical height) and CdIcon size 38
    const cdBtn = renderer.root.findByProps({ testID: `merchant-unit-${QUANTITY_UNIT.CD}` });
    const cdBtnFlatStyle = Array.isArray(cdBtn.props.style)
      ? Object.assign({}, ...cdBtn.props.style.filter(Boolean))
      : cdBtn.props.style;
    expect(cdBtnFlatStyle.height).toBe(40);
    expect(cdBtnFlatStyle.paddingVertical).toBe(0);

    const cdImg = cdBtn.findByType('Image');
    const cdImgStyle = Array.isArray(cdImg.props.style)
      ? Object.assign({}, ...cdImg.props.style.filter(Boolean))
      : cdImg.props.style;
    expect(cdImgStyle.height).toBe(38);
    expect(cdImgStyle.width).toBe(38);

    // D20 button renders a dark MaterialCommunityIcons dice-d20 icon instead of "d20" text
    const d20Btn = renderer.root.findByProps({ testID: `merchant-unit-${QUANTITY_UNIT.D20}` });
    expect(collectText(d20Btn)).not.toContain('d20');
    const d20Icon = d20Btn.findByType('MaterialCommunityIcons');
    expect(d20Icon.props.name).toBe('dice-d20');
    expect(d20Icon.props.color).toBe('#111111');

    // Selecting D20 and saving rolls d20 caps cleanly
    const nameInput = renderer.root.findByProps({ testID: 'container-form-name' });
    act(() => {
      nameInput.props.onChangeText('Чет');
      renderer.root.findByProps({ testID: 'merchant-caps-input' }).props.onChangeText('3');
      d20Btn.props.onPress();
    });

    act(() => {
      renderer.root.findByProps({ testID: 'container-form-save' }).props.onPress();
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    const [savedDraft, capsRollInfo] = onSave.mock.calls[0];
    expect(savedDraft.name).toBe('Чет');
    expect(capsRollInfo?.rolled).toBe(true);
    expect(capsRollInfo?.unit).toBe(QUANTITY_UNIT.D20);
    expect(capsRollInfo?.diceCount).toBe(3);
    expect(savedDraft.caps).toBeGreaterThanOrEqual(3);
    expect(savedDraft.caps).toBeLessThanOrEqual(60);

    act(() => {
      renderer.unmount();
    });
  });
});
