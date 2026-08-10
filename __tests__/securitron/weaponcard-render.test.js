/**
 * Рендер-смок тест карточки оружия (WeaponCard).
 *
 * ПРАВИЛО ВЛАДЕЛЬЦА: компоненты должны реально РЕНДЕРИТЬСЯ в тестах, а не только
 * компилироваться — нарушения Правил хуков и краши при монтировании ловятся
 * только исполнением. Регрессия: хук useCharacterStore в WeaponCard обязан
 * вызываться БЕЗУСЛОВНО (до раннего return пустого слота) — иначе React падает
 * «Rendered more hooks than during the previous render» и размонтирует приложение.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement as h } from 'react';

vi.mock('react-native', () => {
  const host = (name) => ({ $$typeof: Symbol.for('react.element'), type: name });
  return {
    View: 'View',
    Text: 'Text',
    TouchableOpacity: 'TouchableOpacity',
    ScrollView: 'ScrollView',
    ImageBackground: 'ImageBackground',
    SafeAreaView: 'SafeAreaView',
    Modal: 'Modal',
    Platform: { OS: 'web', select: (o) => o.web ?? o.default },
    StyleSheet: { create: (s) => s, flatten: (s) => s },
  };
});

vi.mock('../../components/CharacterContext', () => ({
  useCharacter: () => ({
    hasTrait: () => false,
    attributes: [],
    skills: [],
    trait: null,
  }),
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

// textUtils тянет PNG-ассеты через require — node их не умеет; WeaponCard
// этот модуль не использует, мокаем.
vi.mock('../../components/screens/WeaponsAndArmorScreen/textUtils', () => ({
  renderTextWithIcons: (text) => text,
}));

// Соседние JSX-компоненты экрана не нужны для рендера WeaponCard —
// мокаем, чтобы vitest не парсил их исходники (import-analysis без JSX).
vi.mock('../../components/screens/WeaponsAndArmorScreen/modal/WeaponModificationModal', () => ({ default: () => null }));
vi.mock('../../components/screens/WeaponsAndArmorScreen/modal/ArmorModificationModal', () => ({ default: () => null }));
vi.mock('../../components/screens/WeaponsAndArmorScreen/RobotSlot', () => ({ default: () => null }));
vi.mock('../../components/screens/CharacterScreen/modals/LimbUpgradeModal', () => ({ default: () => null }));
vi.mock('../../components/screens/CharacterScreen/modals/ArmorPickerModal', () => ({ default: () => null }));

import TestRenderer from 'react-test-renderer';
import useCharacterStore from '../../src/store/characterStore';
import { WeaponCard } from '../../components/screens/WeaponsAndArmorScreen/WeaponsAndArmorScreen';

const makeWeapon = (overrides = {}) => ({
  id: 'weapon_laser_gun',
  weaponId: 'weapon_laser_gun',
  name: 'Лазерный пистолет',
  damage: 4,
  damageType: 'energy',
  damage_type: ['energy'],
  fireRate: 2,
  fire_rate: 2,
  range: 'C',
  range_name: 'C',
  qualities: [],
  effects: [],
  ammoId: '',
  itemType: 'weapon',
  ...overrides,
});

const getTexts = (json, acc = []) => {
  if (!json) return acc;
  if (typeof json === 'string') { acc.push(json); return acc; }
  if (Array.isArray(json)) { json.forEach((j) => getTexts(j, acc)); return acc; }
  if (json.children) getTexts(json.children, acc);
  return acc;
};

describe('WeaponCard рендерится', () => {
  beforeEach(() => {
    useCharacterStore.setState({
      robot: { bodyPlan: 'securitron', slots: {}, modules: [], mk2Installed: false },
    });
  });

  it('пустой слот → оружие на той же инстанции: без нарушения Правил хуков', () => {
    let renderer;
    TestRenderer.act(() => {
      renderer = TestRenderer.create(h(WeaponCard, { weapon: null }));
    });
    // Пере-рендер ТОЙ ЖЕ инстанции с оружием — старый код падал здесь
    // (хук после раннего return). Ниже — регрессионный гвард.
    TestRenderer.act(() => {
      renderer.update(h(WeaponCard, { weapon: makeWeapon() }));
    });
    const texts = getTexts(renderer.toJSON());
    expect(texts.some((t) => t.includes('Лазерный пистолет'))).toBe(true);
    TestRenderer.act(() => {
      renderer.update(h(WeaponCard, { weapon: null }));
    });
    TestRenderer.act(() => {
      renderer.update(h(WeaponCard, { weapon: makeWeapon({ id: 'weapon_10mm_pistol', name: '10mm Пистолет' }) }));
    });
    const texts2 = getTexts(renderer.toJSON());
    expect(texts2.some((t) => t.includes('10mm Пистолет'))).toBe(true);
  });

  it('requiresMkII-оружие: пометка «Требуется ОС Mk II» без установленного драйвера', () => {
    let renderer;
    TestRenderer.act(() => {
      renderer = TestRenderer.create(h(WeaponCard, {
        weapon: makeWeapon({ id: 'weapon_missile_launcher', name: 'Ракетная установка', requiresMkII: true }),
      }));
    });
    const texts = getTexts(renderer.toJSON());
    // Пометка «Требуется ОС Mk II» / «Requires Mk II OS» — в обеих локалях «Mk II»
    expect(texts.some((t) => t.includes('Mk II'))).toBe(true);
  });

  it('requiresMkII-оружие: пометки нет после установки драйвера', () => {
    useCharacterStore.setState({
      robot: { bodyPlan: 'securitron', slots: {}, modules: [], mk2Installed: true },
    });
    let renderer;
    TestRenderer.act(() => {
      renderer = TestRenderer.create(h(WeaponCard, {
        weapon: makeWeapon({ id: 'weapon_missile_launcher', name: 'Ракетная установка', requiresMkII: true }),
      }));
    });
    const texts = getTexts(renderer.toJSON());
    expect(texts.some((t) => t.includes('Mk II'))).toBe(false);
  });
});
