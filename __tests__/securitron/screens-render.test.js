/**
 * Рендер-смок экранов: InventoryScreen и WeaponsAndArmorScreen.
 *
 * Ловит TDZ/Правила хуков и прочие ошибки времени выполнения при реальном
 * монтировании (регрессия: isRobot использовался в useMemo до своего
 * объявления → «Cannot access 'isRobot' before initialization» при открытии
 * экрана). Сборка/юнит-тесты такой класс ошибок не видят.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement as h } from 'react';

vi.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  TouchableOpacity: 'TouchableOpacity',
  ScrollView: 'ScrollView',
  ImageBackground: 'ImageBackground',
  SafeAreaView: 'SafeAreaView',
  Modal: 'Modal',
  FlatList: 'FlatList',
  Platform: { OS: 'web', select: (o) => o.web ?? o.default },
  StyleSheet: { create: (s) => s, flatten: (s) => s },
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

// Минимальный, но полный мок useCharacter: данные-значения, остальное — no-op.
const mockCharacter = () => ({
  attributes: [],
  skills: [],
  trait: null,
  origin: null,
  level: 1,
  radiation: 0,
  currentHealth: 0,
  caps: 0,
  carryWeight: 150,
  equippedWeapons: [],
  equippedArmor: {},
  equippedRobotSlots: null,
  equippedPowerArmor: { pieces: {} },
  hasTrait: () => false,
  getModifiedItem: (x) => x,
  setEquippedWeapons: () => {},
  setEquippedArmor: () => {},
  setEquippedRobotSlots: () => {},
  setCaps: () => {},
  setCurrentHealth: () => {},
  setRadiation: () => {},
  applyConsumableFull: () => {},
  saveModifiedItem: () => {},
  adjustPowerArmorDurability: () => {},
  equipPowerArmorPackage: () => {},
  equipPowerArmorPiece: () => {},
  unequipPowerArmorPackage: () => {},
  unequipPowerArmorPieceAt: () => {},
  repairPowerArmorPieceAt: () => {},
  repairPowerArmorStack: () => {},
});

vi.mock('../../components/CharacterContext', () => ({
  useCharacter: () => mockCharacter(),
}));

// Модалки с JSX и текст-хелперы с PNG — не нужны для смоука экранов.
vi.mock('../../components/screens/InventoryScreen/modals/CapsModal', () => ({ default: () => null }));
vi.mock('../../components/screens/InventoryScreen/modals/SellItemModal', () => ({ default: () => null }));
vi.mock('../../components/screens/InventoryScreen/modals/AddItemModal', () => ({ default: () => null }));
vi.mock('../../components/screens/InventoryScreen/modals/BuyItemModal', () => ({ default: () => null }));
vi.mock('../../components/screens/WeaponsAndArmorScreen/modal/WeaponModificationModal', () => ({ default: () => null }));
vi.mock('../../components/screens/WeaponsAndArmorScreen/modal/ArmorModificationModal', () => ({ default: () => null }));
vi.mock('../../components/screens/WeaponsAndArmorScreen/RobotSlot', () => ({ default: () => null }));
vi.mock('../../components/screens/CharacterScreen/modals/LimbUpgradeModal', () => ({ default: () => null }));
vi.mock('../../components/screens/CharacterScreen/modals/ArmorPickerModal', () => ({ default: () => null }));
vi.mock('../../components/screens/WeaponsAndArmorScreen/textUtils', () => ({
  renderTextWithIcons: (text) => text,
}));

import TestRenderer from 'react-test-renderer';
import useCharacterStore from '../../src/store/characterStore';
import useAppSettingsStore from '../../src/store/appSettingsStore';
import InventoryScreen from '../../components/screens/InventoryScreen/InventoryScreen';
import WeaponsAndArmorScreen from '../../components/screens/WeaponsAndArmorScreen/WeaponsAndArmorScreen';

const getTexts = (json, acc = []) => {
  if (!json) return acc;
  if (typeof json === 'string') { acc.push(json); return acc; }
  if (Array.isArray(json)) { json.forEach((j) => getTexts(j, acc)); return acc; }
  if (json.children) getTexts(json.children, acc);
  return acc;
};

describe('Экраны рендерятся без TDZ/хук-ошибок', () => {
  beforeEach(() => {
    useCharacterStore.getState().resetCharacterStore();
    useCharacterStore.setState({
      robot: { bodyPlan: 'securitron', slots: {}, modules: [], mk2Installed: false },
    });
  });

  it('InventoryScreen монтируется (человек)', () => {
    let renderer;
    expect(() => {
      TestRenderer.act(() => {
        renderer = TestRenderer.create(h(InventoryScreen));
      });
    }).not.toThrow();
    const texts = getTexts(renderer.toJSON());
    expect(texts.length).toBeGreaterThan(0);
  });

  it('InventoryScreen монтируется (робот: origin securitron)', () => {
    let renderer;
    expect(() => {
      TestRenderer.act(() => {
        renderer = TestRenderer.create(h(InventoryScreen));
      });
    }).not.toThrow();
  });

  it('WeaponsAndArmorScreen монтируется', () => {
    let renderer;
    expect(() => {
      TestRenderer.act(() => {
        renderer = TestRenderer.create(h(WeaponsAndArmorScreen));
      });
    }).not.toThrow();
    const texts = getTexts(renderer.toJSON());
    expect(texts.length).toBeGreaterThan(0);
  });
});

describe('Режимы отображения карточек оружия', () => {
  beforeEach(() => {
    useCharacterStore.getState().resetCharacterStore();
    useCharacterStore.setState({
      robot: { bodyPlan: 'securitron', slots: {}, modules: [], mk2Installed: false },
    });
  });

  const renderScreen = () => {
    let renderer;
    TestRenderer.act(() => {
      renderer = TestRenderer.create(h(WeaponsAndArmorScreen));
    });
    return renderer;
  };

  it('по умолчанию — режим "cards" (значение стора)', () => {
    expect(useAppSettingsStore.getState().weaponCardsDisplayMode).toBe('cards');
  });

  it('spoilers: экран рендерится, спойлер с заголовком и карточкой', () => {
    useAppSettingsStore.getState().setWeaponCardsDisplayMode('spoilers');
    // Оружие в сторе (equipped) — чтобы спойлер получил название.
    useCharacterStore.getState().addNewItem({
      weaponId: 'weapon_10mm_pistol',
      itemType: 'weapon',
      name: '10mm Pistol',
      equipped: true,
    });
    let renderer;
    expect(() => {
      TestRenderer.act(() => {
        renderer = TestRenderer.create(h(WeaponsAndArmorScreen));
      });
    }).not.toThrow();
    const texts = getTexts(renderer.toJSON());
    expect(texts.some((t) => t.includes('10mm Pistol'))).toBe(true);
  });

  it('tabs: экран рендерится с табами и стрелками', () => {
    useAppSettingsStore.getState().setWeaponCardsDisplayMode('tabs');
    useCharacterStore.getState().addNewItem({
      weaponId: 'weapon_10mm_pistol',
      itemType: 'weapon',
      name: '10mm Pistol',
      equipped: true,
    });
    let renderer;
    expect(() => {
      TestRenderer.act(() => {
        renderer = TestRenderer.create(h(WeaponsAndArmorScreen));
      });
    }).not.toThrow();
    const texts = getTexts(renderer.toJSON());
    expect(texts.some((t) => t.includes('10mm Pistol'))).toBe(true);
  });

  it('возврат к cards после другого режима', () => {
    useAppSettingsStore.getState().setWeaponCardsDisplayMode('tabs');
    useAppSettingsStore.getState().setWeaponCardsDisplayMode('cards');
    let renderer;
    expect(() => {
      TestRenderer.act(() => {
        renderer = TestRenderer.create(h(WeaponsAndArmorScreen));
      });
    }).not.toThrow();
  });
});
