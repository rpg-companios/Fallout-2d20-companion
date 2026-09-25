// ПРИЁМОЧНЫЙ (патч 385): «у штурмотрона в старом сейве моды встроенного
// оружия не меняются — ни снять, ни установить» (слово владельца).
//   • Головной лазер штурмотрона: окно улучшений читает моды из сейва,
//     ЗАМЕНА работает, а СНЯТИЕ возвращало загруженный мод: при пустом
//     limb.ownWeaponMods карточка падала в копию модов внутри записи
//     builtinWeapons (артефакт deserializeSlot, 360). Исправлено: единственный
//     источник модов собственной атаки — limb.ownWeaponMods (385);
//   • полный цикл: снять → сохранить → загрузить → пусто; поставить →
//     сохранить → загрузить → мод на месте и на карточке.
import { describe, expect, it } from 'vitest';

import useCharacterStore from '../../src/store/characterStore';
import { getEquipmentCatalog } from '../../i18n/equipmentCatalog';
import {
  getSlotsForWeapon,
  getModsForWeaponSlot,
  getWeaponModById,
} from '../../db/Database.web';
import { getBuiltinWeaponsFromSlots } from '../../domain/robotEquip';
import { classifyModWritePlan } from '../../src/engine/items/weaponMods';
import { setOwnWeaponMods, serializeSlot } from '../../domain/robotSlots';
import { resolveWeaponWithAppliedMods } from '../../domain/resolveItem';

const state = () => useCharacterStore.getState();
const catalog = getEquipmentCatalog('ru-RU');
const catalogRef = { weapons: catalog.weapons, weaponMods: catalog.weaponMods };
const HEAD_LASER = 'robot_weapon_assaultron_head_laser';
const MK3 = 'robot_weapon_mod_assaultron_head_laser_capacitor_mk_iii';
const MK5 = 'robot_weapon_mod_assaultron_head_laser_capacitor_mk_v';

// Старый сейв: на Головном лазере стоит Mk III (худая форма слотов)
const oldSaveSlots = () => ({
  head: {
    content: 'robot_head_assaultron_laser',
    armorLayers: { plating: null, armor: null, frame: null },
    heldWeaponId: null, heldWeaponMods: [], installedWeapons: [],
    ownWeaponMods: [MK3],
  },
  body: { content: 'robot_body_assaultron', armorLayers: { plating: null, armor: null, frame: null }, heldWeaponId: null, heldWeaponMods: [], installedWeapons: [] },
  leftArm: { content: 'robot_arm_assaultron', armorLayers: { plating: null, armor: null, frame: null }, heldWeaponId: null, heldWeaponMods: [], installedWeapons: [] },
  rightArm: { content: 'robot_arm_assaultron', armorLayers: { plating: null, armor: null, frame: null }, heldWeaponId: null, heldWeaponMods: [], installedWeapons: [] },
  legs: { content: 'robot_legs_assaultron', armorLayers: { plating: null, armor: null, frame: null }, heldWeaponId: null, heldWeaponMods: [], installedWeapons: [] },
});

const loadOldSave = () => {
  state().resetCharacterStore();
  state().loadRobotState({ bodyPlan: 'assaultron', slots: oldSaveSlots(), modules: [] });
};
const headCard = () => getBuiltinWeaponsFromSlots(state().robot?.slots || {})
  .find((c) => c.weaponId === HEAD_LASER);
const planOf = (card) => classifyModWritePlan({
  sourceSlot: card.sourceSlot, attackRole: card.attackRole, isBuiltin: card.isBuiltin,
  storeItemId: null, uniqueId: null, weaponId: card.weaponId,
}, { slotHasHeldWeapon: false });
const applyOwnMods = (appliedMods) => {
  const plan = planOf(headCard());
  const next = setOwnWeaponMods(state().robot.slots, plan.slotKey, appliedMods);
  state().setEquippedRobotSlots(next);
};

describe('патч 385: моды собственной атаки (Головной лазер) из старого сейва', () => {
  it('модалка видит моды из сейва: слот, список, засев загруженного', async () => {
    loadOldSave();
    const card = headCard();
    expect(card.appliedMods.Capacitor).toBe(MK3);

    const slots = await getSlotsForWeapon(HEAD_LASER);
    expect(slots).toContain('Capacitor');
    const mods = await getModsForWeaponSlot(HEAD_LASER, 'Capacitor');
    expect(mods.map((m) => m.id)).toContain(MK5);

    // засев выбранных (как в модалке): загруженный мод находится в каталоге
    const seeded = await getWeaponModById(card.appliedMods.Capacitor);
    expect(seeded?.id).toBe(MK3);
  });

  it('ЗАМЕНА: Mk III → Mk V, имя и урон на карточке реагируют', () => {
    loadOldSave();
    applyOwnMods({ Capacitor: MK5 });
    const card = headCard();
    expect(card.appliedMods.Capacitor).toBe(MK5);
    const resolved = resolveWeaponWithAppliedMods(card, catalogRef);
    expect(resolved.name).toContain('Mk V');
    expect(resolved.damage).toBe(8); // Mk III даёт 6
  });

  it(' СНЯТИЕ: загруженный мод снимается (регрессия 360 задокументирована)', () => {
    loadOldSave();
    applyOwnMods({}); // «Без мода» в окне улучшений
    expect(headCard().appliedMods).toEqual({});
    expect(headCard().modIds).toEqual([]);
    // и имя без приставки Mk:
    expect(resolveWeaponWithAppliedMods(headCard(), catalogRef).name).not.toContain('Mk');
  });

  it('цикл сейв/загрузка: снятие и установка переживают сохранение', () => {
    loadOldSave();
    applyOwnMods({});
    let slim = {};
    for (const [k, v] of Object.entries(state().robot.slots)) slim[k] = serializeSlot(v);
    state().loadRobotState({ bodyPlan: 'assaultron', slots: slim, modules: [] });
    expect(headCard().appliedMods.Capacitor).toBeUndefined();

    applyOwnMods({ Capacitor: MK5 });
    slim = {};
    for (const [k, v] of Object.entries(state().robot.slots)) slim[k] = serializeSlot(v);
    state().loadRobotState({ bodyPlan: 'assaultron', slots: slim, modules: [] });
    expect(headCard().appliedMods.Capacitor).toBe(MK5);
  });
});
