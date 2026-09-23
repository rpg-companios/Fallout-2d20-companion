// ПРИЁМОЧНЫЙ (патч 343)
// Слово владельца: при установке мод получает флаг «экипирован» и привязывается
// к предмету брони, на который встал. «Продали предмет с модом — ушли оба».
// Экипированный мод невидим в инвентаре. Снятие/замена — мод снова виден.
import { describe, it, expect, beforeEach } from 'vitest';
import useCharacterStore from '../../src/store/characterStore';
import { selectItemsByEquipped } from '../../src/store/selectors';

const grant = (state, weaponId, extra = {}) => {
  const { addNewItem } = state;
  const instanceId = addNewItem({ weaponId, ...extra });
  return instanceId;
};

const bagIds = (state) => selectItemsByEquipped({ items: state.items }, false)
  .map((item) => item.weaponId);

describe('ПРИЁМОЧНЫЙ (патч 343): мод брони — экипирован, привязан, невидим', () => {
  let armorId;
  let modId;

  beforeEach(() => {
    useCharacterStore.setState({ items: {} });
    armorId = grant(useCharacterStore.getState(), 'armor_leather_armor');
    modId = grant(useCharacterStore.getState(), 'mod_std_boiled_leather');
  });

  it('установка: мод получает equipped+installedOn и исчезает из сумки', () => {
    const key = useCharacterStore.getState().installArmorMod({ modId, hostKey: armorId });
    expect(key).toBeTruthy();

    const mod = useCharacterStore.getState().items[key];
    expect(mod.equipped).toBe(true);
    expect(mod.installedOn).toBe(armorId);

    // невидим в сумке (тот же селектор, что строит список инвентаря)
    expect(bagIds(useCharacterStore.getState())).not.toContain('mod_std_boiled_leather');
  });

  it('снятие: флаг и привязка теряются, мод снова виден', () => {
    const key = useCharacterStore.getState().installArmorMod({ modId, hostKey: armorId });
    useCharacterStore.getState().uninstallArmorMod({ modId, hostKey: armorId });

    const mod = useCharacterStore.getState().items[key];
    expect(mod.equipped).toBe(false);
    expect(mod.installedOn).toBeUndefined();
    expect(bagIds(useCharacterStore.getState())).toContain('mod_std_boiled_leather');
  });

  it('замена: прежний мод освобождается при установке другого', () => {
    const secondId = grant(useCharacterStore.getState(), 'mod_std_hardened_leather');
    useCharacterStore.getState().installArmorMod({ modId, hostKey: armorId });
    useCharacterStore.getState().uninstallArmorMod({ modId, hostKey: armorId });
    useCharacterStore.getState().installArmorMod({ modId: secondId, hostKey: armorId });

    // прежний — виден, новый — скрыт
    expect(bagIds(useCharacterStore.getState())).toContain('mod_std_boiled_leather');
    expect(bagIds(useCharacterStore.getState())).not.toContain('mod_std_hardened_leather');
  });

  it('продали предмет с модом — ушли оба', () => {
    const modKey = useCharacterStore.getState().installArmorMod({ modId, hostKey: armorId });
    // единственный путь удаления предмета — расход стопки до нуля
    // (spendItemStacks — общий расходчик материалов/предметов)
    useCharacterStore.getState().spendItemStacks({ spend: [{ itemId: 'armor_leather_armor', count: 1 }] });

    expect(useCharacterStore.getState().items[armorId]).toBeUndefined();
    expect(useCharacterStore.getState().items[modKey]).toBeUndefined();
  });

  it('свободная установка (мода в сумке нет): экземпляр не трогается, ошибки нет', () => {
    const before = { ...useCharacterStore.getState().items };
    const key = useCharacterStore.getState().installArmorMod({
      modId: 'mod_std_not_owned',
      hostKey: armorId,
    });
    expect(key).toBeNull();
    expect(useCharacterStore.getState().items).toEqual(before);
  });

  it('снятие точечно: чужой hostKey не снимает чужой мод', () => {
    const host2 = grant(useCharacterStore.getState(), 'armor_leather_armor');
    useCharacterStore.getState().installArmorMod({ modId, hostKey: host2 });
    useCharacterStore.getState().uninstallArmorMod({ modId, hostKey: 'head.armor' });
    // привязка к другому носителю — мод остаётся экипированным
    expect(bagIds(useCharacterStore.getState())).not.toContain('mod_std_boiled_leather');
    useCharacterStore.getState().uninstallArmorMod({ modId, hostKey: host2 });
    expect(bagIds(useCharacterStore.getState())).toContain('mod_std_boiled_leather');
  });
});
