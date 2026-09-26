// ПРИЁМОЧНЫЙ (патч 386): «Лазерный пистолет», ВМОНТИРОВАННЫЙ В РУКУ
// штурмотрона (weapon_laser_gun, installTo:'arm') и СТАРЫЕ СЕЙВЫ.
// Слово владельца: «на нём из сейвов есть моды, но другие поставить или
// снять загруженные не получается»; «там 2 лазера» (Головной лазер —
// собственная атака, см. 385; лазерный пистолет в руке — УСТАНОВЛЕННОЕ
// оружие, этот файл).
//   • три формы старого сейва: худая (installedWeapons), старая полная
//     (limb.builtinWeapons с экземпляром), в ладони (heldWeapon);
//   • во всех трёх: окно видит моды из сейва, замена и СНЯТИЕ работают,
//     состояние переживает сейв/загрузку (на реальном сторе + слое
//     каталога модалки);
//   • «Термоядерный магазин»: боеприпас = Энергоячейка (ammo_energy_cell,
//     слово владельца 386; прежний ammo_fusion_cell не существует).
import { describe, expect, it } from 'vitest';

import useCharacterStore from '../../src/store/characterStore';
import { getEquipmentCatalog } from '../../i18n/equipmentCatalog';
import { getSlotsForWeapon, getModsForWeaponSlot, getWeaponModById } from '../../db/Database.web';
import { getBuiltinWeaponsFromSlots } from '../../domain/robotEquip';
import { classifyModWritePlan } from '../../src/engine/items/weaponMods';
import { setInstalledWeaponMods, serializeSlot } from '../../domain/robotSlots';
import catalogData from '../../modules/fallout/data/equipment/weapon_mods.json';

const state = () => useCharacterStore.getState();
const LASER = 'weapon_laser_gun';
const EXCITER = 'mod_photon_exciter';      // «Возбудитель фотонов» — из сейва
const BOOSTED = 'mod_boosted_capacitor';   // «Усиленный конденсатор» — замена

const blank = (content) => ({ content, armorLayers: { plating: null, armor: null, frame: null }, heldWeaponId: null, heldWeaponMods: [], installedWeapons: [] });

const slotsFor = (armSlot) => ({
  head: blank('robot_head_assaultron'),
  body: blank('robot_body_assaultron'),
  leftArm: armSlot,
  rightArm: blank('robot_arm_assaultron'),
  legs: blank('robot_legs_assaultron'),
});

// (a) худая форма сейва (360+)
const slim = () => slotsFor({ ...blank('robot_arm_assaultron'), installedWeapons: [{ id: LASER, modIds: [EXCITER] }] });
// (b) старая полная: экземпляр с модами внутри limb.builtinWeapons
const fullOld = () => slotsFor({
  limb: {
    id: 'robot_arm_assaultron', itemType: 'robotArm', limbType: 'arm', itemCategory: 'limb',
    builtinWeapons: [{ id: LASER, weaponId: LASER, itemType: 'weapon', appliedMods: { Capacitor: EXCITER }, modIds: [EXCITER] }],
  },
  plating: null, armor: null, frame: null,
});
// (c) лазер в ладони когтя (старая экипировка)
const held = () => slotsFor({
  limb: { id: 'robot_arm_assaultron', itemType: 'robotArm', limbType: 'arm', itemCategory: 'limb' },
  heldWeapon: { id: LASER, weaponId: LASER, itemType: 'weapon', appliedMods: { Capacitor: EXCITER }, modIds: [EXCITER] },
  plating: null, armor: null, frame: null,
});

const load = (slots) => {
  state().resetCharacterStore();
  state().loadRobotState({ bodyPlan: 'assaultron', slots, modules: [] });
};
const laserCard = () => getBuiltinWeaponsFromSlots(state().robot?.slots || {})
  .find((c) => c.weaponId === LASER);
// Запись тем же планом, что экран (handleApplyModification):
// installed → setInstalledWeaponMods; held → правка слота ладони.
const writeByPlan = (appliedMods) => {
  const card = laserCard();
  const plan = classifyModWritePlan({
    sourceSlot: card.sourceSlot, attackRole: card.attackRole, isBuiltin: card.isBuiltin,
    storeItemId: null, uniqueId: null, weaponId: card.weaponId,
  }, { slotHasHeldWeapon: false });
  expect(plan?.kind).toBe('robotSlot');
  if (plan.role === 'held') {
    const slots = state().robot.slots;
    const slot = slots[plan.slotKey];
    const next = {
      ...slots,
      [plan.slotKey]: {
        ...slot,
        heldWeapon: {
          ...slot.heldWeapon,
          appliedMods,
          modIds: Object.values(appliedMods).filter(Boolean),
        },
      },
    };
    state().setEquippedRobotSlots(next);
    return;
  }
  expect(plan.role).toBe('installed');
  const next = setInstalledWeaponMods(state().robot.slots, plan.slotKey, plan.weaponId, appliedMods);
  expect(next).not.toBeNull();
  state().setEquippedRobotSlots(next);
};
const saveAndLoad = () => {
  const slim_ = {};
  for (const [k, v] of Object.entries(state().robot.slots)) slim_[k] = serializeSlot(v);
  state().loadRobotState({ bodyPlan: 'assaultron', slots: slim_, modules: [] });
};

describe('патч 386: лазерный пистолет в руке — старые сейвы (три формы)', () => {
  for (const [name, make] of [['худая', slim], ['старая полная', fullOld], ['в ладони', held]]) {
    it(`${name}: моды из сейва видны, замена и снятие переживают сейв/загрузку`, async () => {
      load(make());

      // окно улучшений: слоты и список по id оружия, загруженный мод находится
      const slots = await getSlotsForWeapon(LASER);
      expect(slots).toContain('Capacitor');
      const mods = await getModsForWeaponSlot(LASER, 'Capacitor');
      expect(mods.map((m) => m.id)).toContain(BOOSTED);
      expect((await getWeaponModById(EXCITER))?.id).toBe(EXCITER);
      expect(laserCard().appliedMods.Capacitor).toBe(EXCITER);

      // ЗАМЕНА → сейв → загрузка:
      writeByPlan({ Capacitor: BOOSTED });
      saveAndLoad();
      expect(laserCard().appliedMods.Capacitor).toBe(BOOSTED);

      // СНЯТИЕ («Без мода») → сейв → загрузка:
      writeByPlan({});
      saveAndLoad();
      expect(laserCard().appliedMods.Capacitor).toBeUndefined();
      expect(laserCard().modIds ?? []).toEqual([]);
    });
  }

  it('«Термоядерный магазин» ведёт на Энергоячейку (ammo_energy_cell)', () => {
    const fusion = catalogData.find((m) => m.id === 'mod_fusion_mag');
    expect(fusion.ammoOverride).toBe('ammo_energy_cell');
    expect(fusion.applies_to_ids).toEqual(['weapon_alien_blaster', 'weapon_cryolator']);
  });
});
