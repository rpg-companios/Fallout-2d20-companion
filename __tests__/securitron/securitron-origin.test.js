/**
 * Ориджин «Секьюритрон» — контракты данных.
 *
 * Покрывает:
 *  - данные ориджина/трейта (иммунитеты, вес, эффекты)
 *  - план тела (слоты, дефолты, layout, таблица попаданий)
 *  - разрешение комплекта и распределение по слотам робота
 *  - переносимый вес робота (корпус + модификаторы брони)
 *  - полноту i18n ru-RU / en-EN
 */
import { describe, it, expect, vi } from 'vitest';

// db/Database в проде делегирует в db/catalogSource (каталог из JSON), но тянет
// react-native/адаптеры, которые не резолвятся в node. Мокаем сам модуль,
// делегируя в реальный catalogSource — моды/патроны/предметы берутся из данных.
vi.mock('../../db/Database', async () => {
  const catalog = await import('../../db/catalogSource');
  return {
    getWeaponById: async (id) => catalog.catalogGetWeaponById(id),
    getWeaponModById: async (id) => catalog.catalogGetWeaponModById(id),
    getAmmoById: async (id) => catalog.catalogGetAmmoById(id),
    getItemByName: async (name) => catalog.catalogGetItemByName(name),
  };
});

import originsJson from '../../data/origins/origins.json';
import traitsJson from '../../data/traits/traits.json';
import bodyPlans from '../../data/bodyplans/bodyplans.json';
import kitData from '../../data/equipmentKits/securitron.json';
import ruTraits from '../../i18n/ru-RU/data/system/traits.json';
import enTraits from '../../i18n/en-EN/data/system/traits.json';
import ruKitNames from '../../i18n/ru-RU/data/system/equipmentKits.json';
import enKitNames from '../../i18n/en-EN/data/system/equipmentKits.json';
import ruRobotHeads from '../../i18n/ru-RU/data/equipment/robot/robotheads.json';
import enRobotHeads from '../../i18n/en-EN/data/equipment/robot/robotheads.json';
import ruRobotBodies from '../../i18n/ru-RU/data/equipment/robot/robotbody.json';
import enRobotBodies from '../../i18n/en-EN/data/equipment/robot/robotbody.json';
import ruRobotArms from '../../i18n/ru-RU/data/equipment/robot/robotarms.json';
import enRobotArms from '../../i18n/en-EN/data/equipment/robot/robotarms.json';
import ruRobotLegs from '../../i18n/ru-RU/data/equipment/robot/robotlegs.json';
import enRobotLegs from '../../i18n/en-EN/data/equipment/robot/robotlegs.json';
import ruRobotItems from '../../i18n/ru-RU/data/equipment/robot/items.json';
import enRobotItems from '../../i18n/en-EN/data/equipment/robot/items.json';
import ruWaAScreen from '../../i18n/ru-RU/screens/weaponsAndArmor/screen.json';
import enWaAScreen from '../../i18n/en-EN/screens/weaponsAndArmor/screen.json';

import { resolveKitItems } from '../../domain/kitResolver';
import { initRobotSlots, getRobotSlotKeys } from '../../domain/robotEquip';
import { calculateRobotCarryWeight } from '../../domain/characterCreation';
import { getBodyPlan } from '../../domain/bodyplan';
import { getEquipmentCatalog } from '../../i18n/equipmentCatalog';
import useCharacterStore from '../../src/store/characterStore';
import { selectRobotMk2Installed } from '../../src/store/robotSlice';

/**
 * Репликация EquipmentKitModal.handleSelectKit + CharacterScreen.handleSelectKit:
 * формирование финального списка предметов и добавление в стор (equipped+locked).
 */
const simulateKitSelect = async (kitId, kitItems, bodyPlan) => {
  const resolved = await resolveKitItems({ id: kitId, items: kitItems });

  // toInventoryItems (модалка)
  const raw = [];
  resolved.items.forEach((item) => {
    if (!item) return;
    if (item.itemType === 'weapon' || item.weaponId) {
      const weapon = item._weapon || {};
      const appliedMods = {};
      (item._mods || []).forEach((mod) => { if (mod.slot && mod.id) appliedMods[mod.slot] = mod.id; });
      raw.push({
        ...weapon,
        id: weapon.id || item.weaponId,
        name: item.displayName || item.name || weapon.name,
        weaponId: weapon.id || item.weaponId,
        appliedMods,
        quantity: item.quantity || 1,
        itemType: 'weapon',
        hasMods: item.hasMods ?? false,
        builtinToArm: item.builtinToArm,
        requiresMkII: item.requiresMkII,
      });
      if (item.resolvedAmmunition) {
        raw.push({ ...item.resolvedAmmunition, quantity: item.resolvedAmmunition.quantity || 1 });
      }
      return;
    }
    raw.push({ ...item, name: item.name || item.itemId, quantity: item.quantity || 1 });
  });

  const { slots, weapons, modules, inventoryItems: robotInventory } = initRobotSlots(
    bodyPlan,
    resolved.items,
    loadRobotCatalog(),
  );

  const slotConsumedTypes = new Set([
    'robotArm', 'robotHead', 'robotBody', 'robotLeg', 'robotLegs',
    'plating', 'armor', 'robotArmor', 'frame', 'module',
  ]);
  const finalItemsOnly = raw.filter((item) => {
    if (slotConsumedTypes.has(item.itemType)) return false;
    if (item.itemType === 'weapon' && (item.replacesArm || item.selfDestruct || item.builtinToHead || item.builtinToArm)) return false;
    if (item.itemType === 'weapon' && String(item.id || item.weaponId || '').startsWith('robot_weapon_')) return false;
    return true;
  });
  const robotInvKeys = new Set(
    robotInventory.map((i) => i.weaponId || i.id || i.itemId || i.armorId || i.clothingId).filter(Boolean),
  );
  const dedupedFinalItems = finalItemsOnly.filter((item) => {
    const key = item.weaponId || item.id || item.itemId || item.armorId || item.clothingId;
    return !key || !robotInvKeys.has(key);
  });

  useCharacterStore.getState().resetCharacterStore();
  [...dedupedFinalItems, ...robotInventory].forEach((item) => {
    if (item.itemType === 'currency' || item.type === 'currency') return;
    useCharacterStore.getState().addNewItem({ ...item, equipped: true, locked: true });
  });

  return {
    storeItems: useCharacterStore.getState().items,
    slotWeapons: weapons,
    slots,
    modules,
  };
};

const ORIGIN_ID = 'securitron';
const TRAIT_ID = 'securitron-mark-i';
const KIT_ID = 'securitron_standard';
const BODY_PLAN = 'securitron';

const loadRobotCatalog = () => ({
  heads: require('../../data/equipment/robot/robotheads.json'),
  bodies: require('../../data/equipment/robot/robotbody.json'),
  arms: require('../../data/equipment/robot/robotarms.json'),
  legs: require('../../data/equipment/robot/robotlegs.json'),
  weapons: require('../../data/equipment/robot/weapons.json'),
});

const getOrigin = () => originsJson.find((o) => o.id === ORIGIN_ID);
const getTrait = () => traitsJson.find((t) => t.id === TRAIT_ID);

const getNameOf = (list, id) => list.find((x) => x.id === id)?.name;

describe('Ориджин Секьюритрон: данные', () => {
  it('ориджин: робот, свой план тела, трейт и комплект', () => {
    const origin = getOrigin();
    expect(origin).toBeDefined();
    expect(origin.characterType).toBe('robot');
    expect(origin.bodyPlan).toBe(BODY_PLAN);
    expect(origin.traitIds).toEqual([TRAIT_ID]);
    expect(origin.equipmentKitIds).toEqual([KIT_ID]);
  });

  it('трейт: иммунитеты ровно [radiation, poison] (без disease), вес 150 фикс', () => {
    const trait = getTrait();
    expect(trait).toBeDefined();
    expect(trait.originId).toBe(ORIGIN_ID);
    expect(trait.modifiers.immunities).toEqual(['radiation', 'poison']);
    expect(trait.modifiers.carryWeightFixed).toBe(150);
    expect(trait.modifiers.carryWeightStrengthMultiplier).toBe(0);
    expect(trait.modifiers.effects).toContain('no_consumables_food_rest');
    expect(trait.modifiers.effects).toContain('repair_to_heal');
    expect(trait.modifiers.effects).toContain('no_hunger_thirst_fatigue');
  });

  it('трейт переведён в обеих локалях (не ключом)', () => {
    const trait = getTrait();
    const ru = ruTraits.traits.securitron.markI;
    const en = enTraits.traits.securitron.markI;
    expect(ru.name).toBeTruthy();
    expect(ru.description).toBeTruthy();
    expect(en.name).toBeTruthy();
    expect(en.description).toBeTruthy();
    expect(ru.name).not.toBe(trait.displayNameKey);
    expect(en.name).not.toBe(trait.displayNameKey);
    // Содержательные проверки описаний
    expect(ru.description).toContain('Mk I');
    expect(ru.description).toContain('150');
    expect(en.description).toContain('Mk I');
    expect(en.description).toContain('150 lbs');
  });
});

describe('Ориджин Секьюритрон: план тела', () => {
  const plan = bodyPlans[BODY_PLAN];

  it('слоты: голова, корпус, руки, одно колесо', () => {
    expect(plan).toBeDefined();
    expect(plan.slots).toEqual(['head', 'leftArm', 'body', 'rightArm', 'wheel']);
  });

  it('дефолты указывают на существующие части (с переводом в обеих локалях)', () => {
    const defaults = plan.defaults;
    expect(defaults).toMatchObject({
      head: 'robot_head_securitron',
      body: 'robot_body_securitron',
      leftArm: 'robot_arm_securitron',
      rightArm: 'robot_arm_securitron',
      wheel: 'robot_legs_securitron',
    });
    for (const id of Object.values(defaults)) {
      const ru = getNameOf(ruRobotHeads, id) ?? getNameOf(ruRobotBodies, id)
        ?? getNameOf(ruRobotArms, id) ?? getNameOf(ruRobotLegs, id);
      const en = getNameOf(enRobotHeads, id) ?? getNameOf(enRobotBodies, id)
        ?? getNameOf(enRobotArms, id) ?? getNameOf(enRobotLegs, id);
      expect(ru, `ru name for ${id}`).toBeTruthy();
      expect(en, `en name for ${id}`).toBeTruthy();
    }
  });

  it('строение: 1-я строка голова, 2-я рука-корпус-рука, 3-я колесо', () => {
    expect(plan.layout).toEqual([
      ['head'],
      ['leftArm', 'body', 'rightArm'],
      ['wheel'],
    ]);
  });

  it('таблица попаданий d20: 1-2 голова, 3-11 корпус, 12-14 левая, 15-17 правая, 18-20 колесо', () => {
    expect(plan.hitLocations).toEqual({
      head: '1-2',
      body: '3-11',
      leftArm: '12-14',
      rightArm: '15-17',
      wheel: '18-20',
    });
  });

  it('руки умеют держать оружие; колесо — слот движения', () => {
    expect(plan.slotCapabilities.leftArm.canEquipWeapon).toBe(true);
    expect(plan.slotCapabilities.rightArm.canEquipWeapon).toBe(true);
    expect(getRobotSlotKeys(BODY_PLAN)).toEqual(plan.slots);
    expect(getBodyPlan(BODY_PLAN)).toBeDefined();
  });

  it('слот колеса локализован (robotSlot.slotNames) в обеих локалях', () => {
    expect(ruWaAScreen.robotSlot.slotNames.wheel).toBe('Колесо');
    expect(enWaAScreen.robotSlot.slotNames.wheel).toBe('Wheel');
  });

  it('новые конечности локализованы в robotLimbs обеих локалей', () => {
    for (const id of ['robot_head_securitron', 'robot_body_securitron', 'robot_arm_securitron', 'robot_legs_securitron']) {
      expect(ruWaAScreen.robotLimbs[id], `ru robotLimbs.${id}`).toBeTruthy();
      expect(enWaAScreen.robotLimbs[id], `en robotLimbs.${id}`).toBeTruthy();
    }
  });
});

describe('Ориджин Секьюритрон: комплект и слоты робота', () => {
  it('комплект есть в data и назван в обеих локалях', () => {
    expect(kitData[KIT_ID]).toBeDefined();
    expect(Array.isArray(kitData[KIT_ID].items)).toBe(true);
    expect(kitData[KIT_ID].name).toBeUndefined(); // имя — только в i18n
    expect(ruKitNames[KIT_ID].name).toBeTruthy();
    expect(enKitNames[KIT_ID].name).toBeTruthy();
  });

  it('каталог собирает комплект (name + items) без ошибок каталога', () => {
    const catalog = getEquipmentCatalog('ru-RU');
    const kit = catalog.equipmentKits[KIT_ID];
    expect(kit).toBeDefined();
    expect(typeof kit.name).toBe('string');
    expect(Array.isArray(kit.items)).toBe(true);
  });

  it('распределение: голова/корпус/колесо по слотам, ладонные оружия — в руках с модами', async () => {
    const resolved = await resolveKitItems({ id: KIT_ID, items: kitData[KIT_ID].items });
    const { slots, weapons, modules, inventoryItems } = initRobotSlots(BODY_PLAN, resolved.items, loadRobotCatalog());

    expect(slots.head.limb.id).toBe('robot_head_securitron');
    expect(slots.body.limb.id).toBe('robot_body_securitron');
    expect(slots.wheel.limb.id).toBe('robot_legs_securitron');
    expect(slots.leftArm.limb.id).toBe('robot_arm_securitron');
    expect(slots.rightArm.limb.id).toBe('robot_arm_securitron');

    // Ладонные орудия встроены ВНУТРЬ рук (limb.builtinWeapons):
    // лазер — левая, ПП — правая; ладонь (heldWeapon) свободна — манипуляторы
    // могут держать любое другое оружие.
    expect(slots.leftArm.heldWeapon).toBeNull();
    expect(slots.rightArm.heldWeapon).toBeNull();
    expect(slots.leftArm.limb.canHoldWeapons).toBe(true);
    expect(slots.leftArm.limb.weaponSlots).toBe(1);

    const leftBuiltins = slots.leftArm.limb.builtinWeapons;
    const rightBuiltins = slots.rightArm.limb.builtinWeapons;
    expect(leftBuiltins.map((w) => w.id).sort()).toEqual(['robot_weapon_manipulator', 'weapon_laser_gun']);
    expect(rightBuiltins.map((w) => w.id).sort()).toEqual(['robot_weapon_manipulator', 'weapon_submachine_gun']);

    const laser = leftBuiltins.find((w) => w.id === 'weapon_laser_gun');
    expect(laser.isBuiltin).toBe(true);
    expect(laser.locked).toBe(true);
    // Мод «Автоматический ствол» применён к статам: −1 урон, +1 скорострельность,
    // +1 дистанция (C→M), снято качество Вплотную.
    expect(laser.damage).toBe(3);           // 4 − 1
    expect(laser.fireRate).toBe(3);         // 2 + 1
    expect(laser.fire_rate).toBe(3);
    expect(laser.range).toBe('M');
    expect(laser.qualities.some((q) => q.qualityId === 'quality_close_quarters')).toBe(false);
    expect(laser.baseWeaponName).toBeTruthy();

    const smg = rightBuiltins.find((w) => w.id === 'weapon_submachine_gun');
    expect(smg.isBuiltin).toBe(true);
    expect(smg.damage).toBe(3);
    expect(smg.fireRate).toBe(3);

    // В инвентаре ладонных оружий нет (они внутри рук)
    expect(inventoryItems.some((i) => i.weaponId === 'weapon_laser_gun')).toBe(false);
    expect(inventoryItems.some((i) => i.weaponId === 'weapon_submachine_gun')).toBe(false);

    // Список атак: манипулятор@левая (дедуп по id), лазер@левая, ПП@правая — все built-in
    const cards = weapons.map((w) => `${w.id}@${w.sourceSlot}${w.isBuiltin ? '[builtin]' : ''}`).sort();
    expect(cards).toEqual([
      'robot_weapon_manipulator@leftArm[builtin]',
      'weapon_laser_gun@leftArm[builtin]',
      'weapon_submachine_gun@rightArm[builtin]',
    ]);

    // Заводская броня распределена по слотам
    expect(slots.head.armor?.id).toBe('robot_armor_factory_optics');
    expect(slots.body.armor?.id).toBe('robot_armor_factory_body');
    expect(slots.leftArm.armor?.id).toBe('robot_armor_factory_arms');
    expect(slots.rightArm.armor?.id).toBe('robot_armor_factory_arms');

    // Нерабочие оружия (ракетница + гранатомёт M79) — предметы инвентаря с флагом requiresMkII
    const mkII = inventoryItems.filter((i) => i.requiresMkII);
    expect(mkII.map((i) => i.id || i.weaponId).sort()).toEqual([
      'weapon_m79_grenade_launcher',
      'weapon_missile_launcher',
    ]);

    // Принтер — в инвентаре
    expect(inventoryItems.some((i) => (i.id || i.itemId) === 'robot_item_printer')).toBe(true);

    expect(modules).toEqual([]);
  });

  it('полный поток кита в стор: без дублей, MkII-оружия помечены, ладонные — только в слотах', async () => {
    const { storeItems, slotWeapons } = await simulateKitSelect(KIT_ID, kitData[KIT_ID].items, BODY_PLAN);

    const summary = Object.values(storeItems).map((i) => ({
      id: i.weaponId || i.id,
      qty: i.quantity,
      mods: i.appliedMods && Object.keys(i.appliedMods).length ? Object.keys(i.appliedMods).length : 0,
      mkII: Boolean(i.requiresMkII),
    }));

    const byId = (id) => summary.filter((s) => s.id === id);

    // Ладонные оружия в стор НЕ дублируются (они в слотах рук)
    expect(byId('weapon_laser_gun')).toEqual([]);
    expect(byId('weapon_submachine_gun')).toEqual([]);

    // Нерабочие оружия — по одной штуке, с флагом requiresMkII
    expect(byId('weapon_missile_launcher')).toEqual([{ id: 'weapon_missile_launcher', qty: 1, mods: 0, mkII: true }]);
    expect(byId('weapon_m79_grenade_launcher')).toEqual([{ id: 'weapon_m79_grenade_launcher', qty: 1, mods: 0, mkII: true }]);

    // Принтер — один
    expect(byId('robot_item_printer')).toEqual([{ id: 'robot_item_printer', qty: 1, mods: 0, mkII: false }]);

    // Аммуниция — по одному стеку
    expect(byId('ammo_energy_cell').length).toBe(1);
    expect(byId('ammo_45').length).toBe(1);

    // Все оружия в слотах помечены built-in: лазер, ПП и манипулятор
    expect(slotWeapons.filter((w) => !w.isBuiltin)).toEqual([]);
    expect(slotWeapons.map((w) => `${w.id}@${w.sourceSlot}`).sort()).toEqual([
      'robot_weapon_manipulator@leftArm',
      'weapon_laser_gun@leftArm',
      'weapon_submachine_gun@rightArm',
    ]);
  });

  it('аммуниция лазера — 14 + 7 CD энергоячеек, ПП — 8 + 4 CD .45', async () => {
    const resolved = await resolveKitItems({ id: KIT_ID, items: kitData[KIT_ID].items });
    const laser = resolved.items.find((i) => i.weaponId === 'weapon_laser_gun');
    const smg = resolved.items.find((i) => i.weaponId === 'weapon_submachine_gun');

    expect(laser._mods.map((m) => m.id)).toEqual(['mod_053']); // автоматический ствол
    expect(laser.resolvedAmmunition.id).toBe('ammo_energy_cell');
    // 14 + 7 CD: каждая CD даёт 0–2 (ролл боевых кубиков), итог ∈ [14, 28]
    expect(laser.resolvedAmmunition.quantity).toBeGreaterThanOrEqual(14);
    expect(laser.resolvedAmmunition.quantity).toBeLessThanOrEqual(28);

    expect(smg.resolvedAmmunition.id).toBe('ammo_45');
    expect(smg.resolvedAmmunition.quantity).toBeGreaterThanOrEqual(8);
    expect(smg.resolvedAmmunition.quantity).toBeLessThanOrEqual(16);
  });
});

describe('Ориджин Секьюритрон: переносимый вес', () => {
  it('база — 150 от корпуса (не 225 протектрона), модификаторы только от брони', async () => {
    const resolved = await resolveKitItems({ id: KIT_ID, items: kitData[KIT_ID].items });
    const { slots } = initRobotSlots(BODY_PLAN, resolved.items, loadRobotCatalog());
    const trait = getTrait();

    expect(slots.body.limb.carryWeight).toBe(150);

    // База без брони: 150 (корпус), STR не влияет (множитель 0)
    const withoutArmor = { ...slots, body: { ...slots.body, armor: null }, head: { ...slots.head, armor: null }, leftArm: { ...slots.leftArm, armor: null }, rightArm: { ...slots.rightArm, armor: null } };
    expect(calculateRobotCarryWeight(withoutArmor, trait)).toBe(150);

    // С заводской бронёй: 150 + модификаторы брони (корпус +20, оптика +10, руки +10+10)
    const withArmor = calculateRobotCarryWeight(slots, trait);
    const armorMods = 20 + 10 + 10 + 10;
    expect(withArmor).toBe(150 + armorMods);
  });

  it('принтер — робо-предмет с именем в обеих локалях', () => {
    expect(getNameOf(ruRobotItems, 'robot_item_printer')).toBe('Принтер');
    expect(getNameOf(enRobotItems, 'robot_item_printer')).toBe('Printer');
  });
});

describe('Ориджин Секьюритрон: драйвер ОС Mk II', () => {
  const DRIVER_ID = 'robot_item_mk2_driver';

  it('драйвер — робо-предмет: уникальный, только для секьюритрона, с переводом', () => {
    const driver = require('../../data/equipment/robotparts.json').robotItems.find((i) => i.id === DRIVER_ID);
    expect(driver).toBeDefined();
    expect(driver.itemType).toBe('misc');
    expect(driver.unique).toBe(true);
    expect(driver.requiresOriginId).toBe('securitron');
    expect(getNameOf(ruRobotItems, DRIVER_ID)).toBe('Драйвер ОС Mk II');
    expect(getNameOf(enRobotItems, DRIVER_ID)).toBe('Mk II OS Driver');
  });

  it('применяется только к секьюритрону, потребляет предмет, повторно нельзя', () => {
    const store = useCharacterStore.getState();
    store.resetCharacterStore();
    store.initRobot('securitron');
    store.addNewItem({ weaponId: DRIVER_ID, itemType: 'misc', quantity: 1, name: 'Драйвер ОС Mk II' });

    const driverItem = Object.values(useCharacterStore.getState().items)[0];
    expect(selectRobotMk2Installed(useCharacterStore.getState())).toBe(false);

    const res = useCharacterStore.getState().applyMk2Driver(driverItem.id);
    expect(res).toEqual({ ok: true });
    expect(selectRobotMk2Installed(useCharacterStore.getState())).toBe(true);
    // Предмет израсходован
    expect(Object.keys(useCharacterStore.getState().items)).toHaveLength(0);

    // Повторное применение невозможно
    const again = useCharacterStore.getState().applyMk2Driver(driverItem.id);
    expect(again.ok).toBe(false);
    expect(again.reason).toBe('mk2.alreadyInstalled');
  });

  it('не применяется к другим роботам', () => {
    const store = useCharacterStore.getState();
    store.resetCharacterStore();
    store.initRobot('protectron');
    store.addNewItem({ weaponId: DRIVER_ID, itemType: 'misc', quantity: 1 });

    const driverItem = Object.values(useCharacterStore.getState().items)[0];
    const res = useCharacterStore.getState().applyMk2Driver(driverItem.id);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('mk2.requiresSecuritron');
    expect(selectRobotMk2Installed(useCharacterStore.getState())).toBe(false);
    // Предмет не израсходован
    expect(Object.keys(useCharacterStore.getState().items)).toHaveLength(1);
  });

  it('флаг mk2Installed персистится вместе с robot-срезом (partialize)', () => {
    const persistOptions = useCharacterStore.persist?.getOptions?.();
    expect(persistOptions?.partialize).toBeDefined();
    const partial = persistOptions.partialize(useCharacterStore.getState());
    expect(partial.robot).toHaveProperty('mk2Installed', false);
    expect(partial.robot.bodyPlan).toBe('protectron');
  });
});
