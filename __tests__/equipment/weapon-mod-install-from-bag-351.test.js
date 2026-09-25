// ПРИЁМОЧНЫЙ (патч 351): моды ОРУЖИЯ — тот же закон владельца 343/344.
//   • скрафченный мод-предмет ставится на оружие: флаг «экипирован» +
//     привязка к предмету оружия (installedOn), мод невидим в сумке;
//   • снятие/замена — прежний мод снова виден;
//   • «продали оружие с модом — ушли оба» (adjustItemQuantity);
//   • дифф установки (diffModInstallPlan) — чистая функция проводки экрана;
//   • гейт «Установка модификаций» — тот же filterModsByInventory (342).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import useCharacterStore from '../../src/store/characterStore';
import { diffModInstallPlan } from '../../domain/modsEquip';
import { filterModsByInventory } from '../../domain/modsEquip';
import { modIdList } from '../../src/engine/items/weaponMods';

const state = () => useCharacterStore.getState();
const bagIds = (s) => Object.values(s.items)
  .filter((i) => !i.equipped && !i.installedOn)
  .map((i) => i.weaponId);

beforeEach(() => {
  useCharacterStore.setState({ items: {} });
});

afterEach(async () => {
  state().resetCharacterStore();
  await useCharacterStore.persist.clearStorage();
});

describe('ПРИЁМОЧНЫЙ (патч 351): мод оружия привязан к оружию', () => {
  let weaponId;
  let modId;

  beforeEach(() => {
    weaponId = state().addNewItem({ weaponId: 'weapon_10mm_pistol', itemType: 'weapon' });
    modId = state().addNewItem({ weaponId: 'mod_001', itemType: 'weaponMod' });
  });

  it('установка: мод оружия — equipped+installedOn, невидим в сумке; снятие возвращает', () => {
    const key = state().installArmorMod({ modId, hostKey: weaponId });
    expect(key).toBeTruthy();
    expect(state().items[key].equipped).toBe(true);
    expect(state().items[key].installedOn).toBe(weaponId);
    expect(bagIds(state())).not.toContain('mod_001');

    state().uninstallArmorMod({ modId, hostKey: weaponId });
    expect(bagIds(state())).toContain('mod_001');
    expect(state().items[key].installedOn).toBeUndefined();
  });

  it('продали оружие с модом — ушли оба', () => {
    state().installArmorMod({ modId, hostKey: weaponId });
    state().adjustItemQuantity(weaponId, -1);
    expect(state().items[weaponId]).toBeUndefined();
    expect(state().items[modId]).toBeUndefined();
  });

  it('форма правды modIdList: appliedMods приоритетнее modIds', () => {
    expect(modIdList({ appliedMods: { Receiver: 'mod_001' }, modIds: ['mod_002'] }))
      .toEqual(['mod_001']);
    expect(modIdList({ modIds: ['mod_002'] })).toEqual(['mod_002']);
    expect(modIdList({})).toEqual([]);
  });

  it('дифф проводки: замена слота = снятие старого + установка нового', () => {
    const plan = diffModInstallPlan(['mod_001'], ['mod_002']);
    expect(plan).toEqual({ install: ['mod_002'], uninstall: ['mod_001'] });
    expect(diffModInstallPlan([], [])).toEqual({ install: [], uninstall: [] });
  });

  it('гейт: filterModsByInventory скрывает моды не из сумки (моды оружия — те же id)', () => {
    const mods = [
      { id: 'mod_001', slot: 'Receiver' },
      { id: 'mod_004', slot: 'Barrel' },
    ];
    const owned = new Set(['mod_001']);
    expect(filterModsByInventory(mods, owned)).toEqual([{ id: 'mod_001', slot: 'Receiver' }]);
    // настройка выключена — список без изменений
    expect(filterModsByInventory(mods, null)).toEqual(mods);
  });
});
