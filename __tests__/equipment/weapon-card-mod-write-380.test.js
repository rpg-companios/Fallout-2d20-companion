// ПРИЁМОЧНЫЙ (патч 380): моды на надетом оружии человека — запись в СВОЙ
// предмет стора. Жалоба владельца: «моды не ставятся в карточку оружия,
// в предпросмотре модалки — да». Причина: локализованная карточка несёт
// ключ предмета в instanceId, а поиск вёлcя по uniqueId/id; фолбэк
// («undefined === undefined» у любого предмета без uniqueId) возвращал
// ПЕРВЫЙ надетый предмет (броню) — мод писался не в оружие.
//   • карточка (порядок стора: броня первой, оружие вторым) → ключ оружия,
//     не брони;
//   • полный конвейер: применили мод в модалке → patch к предмету →
//     карточка показывает +2 урона («Улучшенный» ПП-ресивер).
import { describe, expect, it } from 'vitest';

import { getEquipmentCatalog } from '../../i18n/equipmentCatalog';
import {
  resolveStoreItemIdFromItems,
  storeItemToWeaponDisplay,
  weaponModPatchToStore,
} from '../../src/store/selectors';
import { resolveWeaponWithAppliedMods } from '../../domain/resolveItem';

const catalog = getEquipmentCatalog('ru-RU');

const armorItem = {
  id: 'inst-armor-1',
  instanceId: 'inst-armor-1',
  itemType: 'armor',
  equipped: true,
  name: 'Кожаная броня',
};

const weaponItem = {
  id: 'inst-10mm-1',
  instanceId: 'inst-10mm-1',
  weaponId: 'weapon_10mm_pistol',
  itemType: 'weapon',
  equipped: true,
  appliedMods: {},
};

// Порядок вставки как в живом сторе: броня надета раньше оружия.
const items = {
  [armorItem.id]: armorItem,
  [weaponItem.id]: weaponItem,
};

describe('патч 380: ключ предмета по карточке оружия', () => {
  it('карточка надетого оружия → ключ ОРУЖИЯ, даже если броня в сторе раньше', () => {
    const display = resolveWeaponWithAppliedMods(storeItemToWeaponDisplay(weaponItem), catalog);
    expect(display.instanceId).toBe('inst-10mm-1');
    expect(resolveStoreItemIdFromItems(items, display)).toBe('inst-10mm-1');
  });

  it('прежний фолбэк ловил первый надетый предмет (регрессия задокументирована)', () => {
    // Старая логика (до 380) на той же паре предметов:
    const legacyFind = Object.values(items).find(
      (item) => item.equipped && (
        item.uniqueId === undefined // weapon.uniqueId === undefined
        || item.id === undefined
      ),
    )?.id;
    expect(legacyFind).toBe('inst-armor-1'); // вот куда писался мод до фикса
  });

  it('полный конвейер: мод из модалки попадает в предмет и в карточку', () => {
    // 1) В модалке применили «Улучшенный ресивер» (+2 урона, слот Receiver):
    const display = resolveWeaponWithAppliedMods(storeItemToWeaponDisplay(weaponItem), catalog);
    const modifiedWeapon = resolveWeaponWithAppliedMods(
      { ...display, appliedMods: { Receiver: 'mod_powerful' } },
      catalog,
    );
    expect(modifiedWeapon.damage).toBe(6); // 4 базы + 2 мода (предпросмотр модалки)

    // 2) Экран пишет патч в СВОЙ предмет (ключ из карточки):
    const itemId = resolveStoreItemIdFromItems(items, modifiedWeapon);
    expect(itemId).toBe('inst-10mm-1');
    const patch = weaponModPatchToStore(modifiedWeapon);
    const nextItems = { ...items, [itemId]: { ...items[itemId], ...patch } };

    // 3) Карточка на экране перечитала стор — урон с модом:
    const cardAfter = resolveWeaponWithAppliedMods(
      storeItemToWeaponDisplay(nextItems[itemId]),
      catalog,
    );
    expect(cardAfter.damage).toBe(6);
    expect(cardAfter.appliedMods).toEqual({ Receiver: 'mod_powerful' });
  });

  it('виртуальное оружие без предмета в сторе → undefined (план equippedWeapon)', () => {
    expect(resolveStoreItemIdFromItems(items, { id: 'weapon_fists', damage: 0 })).toBeUndefined();
    expect(resolveStoreItemIdFromItems(items, null)).toBeUndefined();
  });
});
