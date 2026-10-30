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

vi.mock('../../components/alerts/alertService', () => ({
  showRawAlert: vi.fn(),
}));

vi.mock('../../modules/fallout/assets/backgrounds/caps.png', () => ({ default: 'caps.png' }));
vi.mock('../../assets/CD.png', () => ({ default: 'cd.png' }));

import { setCurrentLocale } from '../../i18n/locale';
import { CONTAINER_KIND, matchHubSuggestions } from '../../domain/lootTrade';
import ContainerFormModal from '../../components/screens/LootTradeScreen/modals/ContainerFormModal';

const collectText = (node) => {
  if (node == null) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(collectText).join('');
  if (node.children) return node.children.map(collectText).join('');
  return '';
};

describe('Patch 476 — Location combobox & inline autocomplete (New -> New Vegas) in Chest/Merchant form', () => {
  beforeEach(() => {
    setCurrentLocale('ru-RU');
  });

  it('ranks prefix, word-boundary, and substring Location matches and computes inline ghost completion', () => {
    const hubs = [
      { id: 'h_dc', name: 'Diamond City' },
      { id: 'h_nv', name: 'New Vegas' },
      { id: 'h_nr', name: 'New Reno' },
      { id: 'h_gs', name: 'Goodsprings' },
    ];

    // Typing "New" immediately suggests "New Vegas" with ghost suffix " Vegas"
    const resNew = matchHubSuggestions('New', hubs, []);
    expect(resNew.bestMatch?.id).toBe('h_nv');
    expect(resNew.ghostSuffix).toBe(' Vegas');
    expect(resNew.matches.map((h) => h.id)).toEqual(['h_nv', 'h_nr']);

    // Case-insensitive "new" still returns " Vegas" ghost suffix
    const resLower = matchHubSuggestions('new', hubs, []);
    expect(resLower.bestMatch?.name).toBe('New Vegas');
    expect(resLower.ghostSuffix).toBe(' Vegas');

    // Once "New Vegas" is already selected, typing "New" suggests "New Reno" next
    const resNext = matchHubSuggestions('New', hubs, ['h_nv']);
    expect(resNext.bestMatch?.id).toBe('h_nr');
    expect(resNext.ghostSuffix).toBe(' Reno');

    // Word-boundary match: typing "Vegas" finds "New Vegas"
    const resWord = matchHubSuggestions('Vegas', hubs, []);
    expect(resWord.bestMatch?.id).toBe('h_nv');
    expect(resWord.ghostSuffix).toBe('');

    // Exact match populates exactHub
    const resExact = matchHubSuggestions('new vegas', hubs, []);
    expect(resExact.exactHub?.id).toBe('h_nv');

    // Empty query returns full list without ghost text
    const resEmpty = matchHubSuggestions('', hubs, []);
    expect(resEmpty.matches).toHaveLength(4);
    expect(resEmpty.bestMatch).toBeNull();
    expect(resEmpty.ghostSuffix).toBe('');
  });

  it('always renders the Location combobox (even when 0 Locations exist) and supports inline New -> New Vegas suggestion & save', () => {
    const onSave = vi.fn();
    let renderer;

    // 1. Even with availableHubs = [], the Location input is visible (never hidden!)
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(ContainerFormModal, {
          visible: true,
          kind: CONTAINER_KIND.LOOT,
          availableRooms: [{ code: 'GM-7Q3K9M', name: 'Мохаве' }],
          availableHubs: [],
          onSave,
          onClose: () => {},
        }),
      );
    });

    const emptyHubInput = renderer.root.findByProps({ testID: 'hub-combobox-input' });
    expect(emptyHubInput).toBeTruthy();

    // 2. Rerender with existing Locations including "New Vegas"
    const hubs = [
      { id: 'hub_dc', name: 'Diamond City' },
      { id: 'hub_nv', name: 'New Vegas' },
    ];
    act(() => {
      renderer.update(
        React.createElement(ContainerFormModal, {
          visible: true,
          kind: CONTAINER_KIND.MERCHANT,
          availableRooms: [{ code: 'GM-7Q3K9M', name: 'Мохаве' }],
          availableHubs: hubs,
          onSave,
          onClose: () => {},
        }),
      );
    });

    const nameInput = renderer.root.findByProps({ testID: 'container-form-name' });
    const hubInput = renderer.root.findByProps({ testID: 'hub-combobox-input' });

    act(() => {
      nameInput.props.onChangeText('Оружейники');
      hubInput.props.onChangeText('New');
    });

    // Inline ghost suffix " Vegas" and quick-suggest button "Подсказка: New Vegas ↵" appear immediately
    const allRenderedText = collectText(renderer.toJSON());
    expect(allRenderedText).toContain(' Vegas');
    const quickSuggestBtn = renderer.root.findByProps({ testID: 'hub-quick-suggest' });
    expect(collectText(quickSuggestBtn)).toContain('New Vegas');

    // Accept suggestion via Enter/Tab key press
    act(() => {
      hubInput.props.onKeyPress({ nativeEvent: { key: 'Tab' }, preventDefault: () => {} });
    });

    // Save merchant and verify selectedHubIds === ['hub_nv']
    const saveBtn = renderer.root.findByProps({ testID: 'container-form-save' });
    act(() => {
      saveBtn.props.onPress();
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    const [savedDraft, , selectedHubIds] = onSave.mock.calls[0];
    expect(savedDraft.name).toBe('Оружейники');
    expect(savedDraft.kind).toBe(CONTAINER_KIND.MERCHANT);
    expect(selectedHubIds).toEqual(['hub_nv']);

    act(() => {
      renderer.unmount();
    });
  });

  it('allows creating and binding a brand-new Location inline right from the Chest/Merchant form', async () => {
    const onSave = vi.fn();
    const onQuickCreateHub = vi.fn(async (hubName) => ({
      id: 'hub_created_nv',
      kind: CONTAINER_KIND.HUB,
      name: hubName,
    }));

    let renderer;
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(ContainerFormModal, {
          visible: true,
          kind: CONTAINER_KIND.LOOT,
          availableRooms: [{ code: 'GM-7Q3K9M', name: 'Мохаве' }],
          availableHubs: [],
          onQuickCreateHub,
          onSave,
          onClose: () => {},
        }),
      );
    });

    const nameInput = renderer.root.findByProps({ testID: 'container-form-name' });
    const hubInput = renderer.root.findByProps({ testID: 'hub-combobox-input' });

    act(() => {
      nameInput.props.onChangeText('Тайник Курьера');
      hubInput.props.onChangeText('New Vegas');
    });

    const createBtn = renderer.root.findByProps({ testID: 'hub-inline-create' });
    expect(collectText(createBtn)).toContain('New Vegas');

    await act(async () => {
      await createBtn.props.onPress();
    });

    expect(onQuickCreateHub).toHaveBeenCalledWith('New Vegas');

    const saveBtn = renderer.root.findByProps({ testID: 'container-form-save' });
    act(() => {
      saveBtn.props.onPress();
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][2]).toEqual(['hub_created_nv']);

    act(() => {
      renderer.unmount();
    });
  });
});
