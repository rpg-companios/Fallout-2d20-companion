// ПРИЁМОЧНЫЙ (патч 344)
// Слово владельца: продажа и трата предметов — кнопки на предметах в
// инвентаре; «продали предмет с модом — ушли оба» обязано работать через
// них. Привязка мода — к ПРЕДМЕТУ (экземпляру), видимость — как у 343.
import { describe, it, expect, beforeEach } from 'vitest';
import useCharacterStore from '../../src/store/characterStore';
import { selectItemsByEquipped } from '../../src/store/selectors';

const state = () => useCharacterStore.getState();
const bagIds = (s) => selectItemsByEquipped({ items: s.items }, false).map((i) => i.weaponId);

describe('ПРИЁМОЧНЫЙ (патч 344): продажа/трата кнопками уводит моды с предметом', () => {
  let armorId;
  let modId;

  beforeEach(() => {
    useCharacterStore.setState({ items: {} });
    armorId = state().addNewItem({ weaponId: 'armor_leather_armor' });
    modId = state().addNewItem({ weaponId: 'mod_std_boiled_leather' });
  });

  it('кнопка продажи (adjustItemQuantity до нуля) — уходят оба', () => {
    state().installArmorMod({ modId, hostKey: armorId });
    expect(bagIds(state())).not.toContain('mod_std_boiled_leather');

    state().adjustItemQuantity(armorId, -1);
    expect(state().items[armorId]).toBeUndefined();
    expect(state().items[modId]).toBeUndefined();
  });

  it('трата части стека (остался не ноль) — предмет и мод на месте', () => {
    const armor = state().items[armorId];
    useCharacterStore.setState({ items: { ...state().items, [armorId]: { ...armor, quantity: 2 } } });
    state().installArmorMod({ modId, hostKey: armorId });

    state().adjustItemQuantity(armorId, -1);
    expect(state().items[armorId]).toBeDefined();
    expect(state().items[modId]).toBeDefined();
    expect(state().items[modId].installedOn).toBe(armorId);
  });

  it('выброс/трата без модов не ломается (нулевой расход освобождений)', () => {
    state().adjustItemQuantity(armorId, -1);
    expect(state().items[armorId]).toBeUndefined();
  });

  it('несуществующий itemId — no-op (кнопка по исчезнувшей строке)', () => {
    expect(() => state().adjustItemQuantity('nope', -1)).not.toThrow();
  });

  it('привязка — к ПРЕДМЕТУ: носителя-экземпляра нет, мод остаётся видимым', () => {
    const key = state().installArmorMod({ modId, hostKey: 'armor-instance-kit' });
    expect(key).toBeNull();
    expect(state().items[modId].equipped).toBe(false);
    expect(state().items[modId].installedOn).toBeUndefined();
    expect(bagIds(state())).toContain('mod_std_boiled_leather');
  });
});
