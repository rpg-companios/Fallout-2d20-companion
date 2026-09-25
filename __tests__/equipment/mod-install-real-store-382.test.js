// ПРИЁМОЧНЫЙ (патч 382): доказательство на РЕАЛЬНОМ СТОРЕ — установка мода
// на надетое оружие работает от начала до конца (жалоба владельца: «модель
// простая — id в appliedMods + флажок предмету; какого чёрта нельзя ставить?»).
// Модель и не менялась; сломан был поиск предмета (патч 380 его починил).
// Тест гоняет ТОЧНУЮ цепочку кнопки «Применить» из WeaponsAndArmorScreen:
//   карточка → modifiedWeapon (модалка) → resolveStoreItemIdFromItems →
//   installWeaponModFlag + updateItem(weaponModPatchToStore) → новая карточка.
// Сценарий с ловушкой: броня надета ПЕРВОЙ (в живом сторе она раньше оружия).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import useCharacterStore from '../../src/store/characterStore';
import {
  resolveStoreItemIdFromItems,
  storeItemToWeaponDisplay,
  weaponModPatchToStore,
  selectItemsByEquipped,
} from '../../src/store/selectors';
import { resolveWeaponWithAppliedMods } from '../../domain/resolveItem';
import { classifyModWritePlan, modIdList } from '../../src/engine/items/weaponMods';
import { diffModInstallPlan } from '../../domain/modsEquip';
import { getEquipmentCatalog } from '../../i18n/equipmentCatalog';

const state = () => useCharacterStore.getState();
const catalog = getEquipmentCatalog('ru-RU');

beforeEach(() => {
  state().resetCharacterStore();
});

afterEach(async () => {
  state().resetCharacterStore();
  await useCharacterStore.persist.clearStorage();
});

/** Надеть броню, оружие; положить мод в сумку — как нормализует стор. */
const seedScenario = () => {
  useCharacterStore.setState((prev) => ({
    items: {
      ...(prev.items || {}),
      armor1: { id: 'armor1', instanceId: 'armor1', itemType: 'armor', equipped: true },
      w1: {
        id: 'w1', instanceId: 'w1', weaponId: 'weapon_10mm_pistol',
        itemType: 'weapon', equipped: true, appliedMods: {},
      },
      m1: { id: 'm1', weaponId: 'mod_powerful', itemType: 'weaponMod', equipped: false },
    },
  }));
};

/** Точная цепочка экрана: карточка → «Применить» → стор → новая карточка. */
const applyModThroughScreenPath = (appliedMods) => {
  // 1) карточка на экране (equippedWeaponsForDisplay → findLocalizedWeapon)
  const weaponItem = Object.values(state().items).find((i) => i.weaponId === 'weapon_10mm_pistol');
  const card = resolveWeaponWithAppliedMods(storeItemToWeaponDisplay(weaponItem), catalog);

  // 2) модалка вернула изменённый экземпляр
  const modifiedWeapon = resolveWeaponWithAppliedMods({ ...card, appliedMods }, catalog);

  // 3) handleApplyModification: классификация места записи + дифф флагов
  const itemId = resolveStoreItemIdFromItems(state().items, selectedRef(card));
  const plan = classifyModWritePlan(
    { storeItemId: itemId || null, uniqueId: card.uniqueId || null, weaponId: card.weaponId || card.id || null },
    {},
  );
  const flagDiff = diffModInstallPlan(
    modIdList(weaponItem),
    modIdList({ appliedMods }),
  );
  flagDiff.uninstall.forEach((id) => state().uninstallArmorMod({ modId: id, hostKey: itemId }));
  flagDiff.install.forEach((id) => state().installArmorMod({ modId: id, hostKey: itemId }));

  // 4) запись appliedMods в предмет + возврат для новой карточки
  if (plan?.kind === 'storeItem') {
    state().updateItem(plan.itemId, weaponModPatchToStore(modifiedWeapon));
  }
  return { itemId, plan };
};

// ref-контекст экрана: поля с КАРТОЧКИ (как в handleApplyModification)
const selectedRef = (card) => card;

describe('патч 382: установка мода на оружие — реальный стор, цепочка кнопки', () => {
  it('«Улучшенный ресивер» встанал: урон 4→6, имя с префиксом, броня не тронута', () => {
    seedScenario();
    const { itemId, plan } = applyModThroughScreenPath({ Receiver: 'mod_powerful' });

    expect(plan?.kind).toBe('storeItem');
    expect(itemId).toBe('w1'); // СВОЙ предмет, не броня

    const items = state().items;
    expect(items.w1.appliedMods).toEqual({ Receiver: 'mod_powerful' });
    expect(items.armor1.appliedMods).toBeUndefined(); // броня чистая

    // карточка после перерисовки (стор → карточка)
    const cardAfter = resolveWeaponWithAppliedMods(storeItemToWeaponDisplay(items.w1), catalog);
    expect(cardAfter.damage).toBe(6);
    // имя по правилу владельца: [имя мода][базовое имя] — мод ВИДЕН на карточке
    expect(cardAfter.name).toBe('Усиленный 10-мм пистолет');
    expect(cardAfter.appliedMods).toEqual({ Receiver: 'mod_powerful' });
  });

  it('мод-предмет скрыт из сумки (equipped+installedOn), замена возвращает старый', () => {
    seedScenario();
    applyModThroughScreenPath({ Receiver: 'mod_powerful' });

    // флаг у мод-предмета: не виден в инвентаре
    expect(state().items.m1.equipped).toBe(true);
    expect(state().items.m1.installedOn).toBe('w1');
    const bag = selectItemsByEquipped(state(), false);
    expect(bag.some((i) => i.weaponId === 'mod_powerful')).toBe(false);

    // замена на «Жёсткий» (mod_hardened): прежний мод вернулся в сумку
    const weaponItem = Object.values(state().items).find((i) => i.weaponId === 'weapon_10mm_pistol');
    const flagDiff = diffModInstallPlan(
      modIdList(weaponItem),
      modIdList({ appliedMods: { Receiver: 'mod_hardened' } }),
    );
    flagDiff.uninstall.forEach((id) => state().uninstallArmorMod({ modId: id, hostKey: 'w1' }));
    flagDiff.install.forEach((id) => state().installArmorMod({ modId: id, hostKey: 'w1' }));
    state().updateItem('w1', { appliedMods: { Receiver: 'mod_hardened' } });

    expect(state().items.m1.equipped).toBe(false);
    expect(state().items.m1.installedOn).toBeUndefined();
    expect(selectItemsByEquipped(state(), false).some((i) => i.weaponId === 'mod_powerful')).toBe(true);
  });

  it('оружие без брони на персонаже — та же цепочка (у кулаков план equippedWeapon)', () => {
    useCharacterStore.setState((prev) => ({
      items: {
        ...(prev.items || {}),
        w1: {
          id: 'w1', instanceId: 'w1', weaponId: 'weapon_10mm_pistol',
          itemType: 'weapon', equipped: true, appliedMods: {},
        },
      },
    }));
    const { plan } = applyModThroughScreenPath({ Receiver: 'mod_powerful' });
    expect(plan?.kind).toBe('storeItem');
    expect(state().items.w1.appliedMods).toEqual({ Receiver: 'mod_powerful' });
  });
});
