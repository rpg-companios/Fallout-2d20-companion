import React from 'react';
import { act, create } from 'react-test-renderer';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { setCurrentLocale, setCurrentModuleLocale } from '../../i18n/locale';

vi.mock('@expo/vector-icons', () => ({
  MaterialCommunityIcons: 'MaterialCommunityIcons',
}));

vi.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  TouchableOpacity: 'TouchableOpacity',
  ScrollView: 'ScrollView',
  ImageBackground: 'ImageBackground',
  SafeAreaView: 'SafeAreaView',
  Modal: 'Modal',
  Platform: { OS: 'web', select: (values) => values.web ?? values.default },
  StyleSheet: { create: (styles) => styles, flatten: (styles) => styles },
  Alert: { alert: () => {} },
  PanResponder: { create: () => ({ panHandlers: {} }) },
}));

vi.mock('../../db/Database', async () => {
  const catalog = await import('../../db/catalogSource');
  return {
    getWeaponById: async (id) => catalog.catalogGetWeaponById(id),
    getWeaponModById: async (id) => catalog.catalogGetWeaponModById(id),
    getAmmoById: async (id) => catalog.catalogGetAmmoById(id),
    getItemByName: async (name) => catalog.catalogGetItemByName(name),
  };
});

import { EffectsPanel } from '../../components/screens/WeaponsAndArmorScreen/WeaponsAndArmorScreen';

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  setCurrentLocale('ru-RU');
  setCurrentModuleLocale('ru-RU');
});

const textContent = (node) => node.children
  .flat(Infinity)
  .filter((part) => typeof part === 'string')
  .join('');

describe('disease effects panel', () => {
  it('shows the localized disease name, description, and infinite duration', () => {
    let tree;
    act(() => {
      tree = create(React.createElement(EffectsPanel, {
        effects: [{
          id: 'condition-disease_dysentery',
          effectName: 'Stale saved name',
          effectLabel: 'Stale saved description',
          effectKind: 'negative',
          effectType: 'disease',
          conditionId: 'disease_dysentery',
          isPermanent: true,
          scenesLeft: 0,
        }],
      }));
    });

    act(() => {
      tree.root.findByType('TouchableOpacity').props.onPress();
    });

    const labels = tree.root.findAllByType('Text').map(textContent);
    expect(labels).toContain('Дизентерия');
    expect(labels).toContain('Время на каждой ступени шкалы жажды уменьшается вдвое.');
    expect(labels).toContain('∞');

    act(() => setCurrentModuleLocale('en-EN'));
    const englishLabels = tree.root.findAllByType('Text').map(textContent);
    expect(englishLabels).toContain('Dysentery');
    expect(englishLabels).toContain('Halves time at each step of the thirst track.');
    expect(englishLabels).toContain('∞');

    act(() => {
      tree.unmount();
      setCurrentModuleLocale('ru-RU');
    });
  });
});
