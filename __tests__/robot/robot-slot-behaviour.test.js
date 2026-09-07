// __tests__/robot/robot-slot-behaviour.test.js
//
// Поведение новой модели слотов: сбор атак, раскладка защиты, СУ, диапазоны
// попаданий, замена и съёмность конечностей, каталог кандидатов для слота.
//
// Фич-флаг снят (этап 4): модель одна, исторических веток в коде нет, поэтому
// «старая модель» здесь не проверяется — проверяется только текущее поведение.

import { describe, it, expect } from 'vitest';

import {
  initRobotSlots,
  getBuiltinWeaponsFromSlots,
  canEquipRobotArmor,
  applyLimbReplacement,
  canReplaceLimb,
  getSlotForDirection,
} from '../../domain/robotEquip';
import {
  getRobotSlotDamageResistance,
  getActiveRobotLayers,
} from '../../domain/robotDamageResistance';
import { buildRobotSlotStats } from '../../domain/robotSlotLogic';
import screenI18n from '../../modules/fallout/i18n/ru-RU/screens/weaponsAndArmor/screen.json';
import platingCatalogJson from '../../modules/fallout/data/equipment/robot/armor_plating.json';
import framesCatalogJson from '../../modules/fallout/data/equipment/robot/frames.json';
import {
  getSlotHitRange,
  resolveHit,
  slotForDirection,
  limbOptionsForSlot,
} from '../../domain/robotSlots';
import { getRobotSlotKeys } from '../../domain/robotEquip';
import { getRobotLimbCatalog } from '../../domain/registry';

import limbsCatalog from '../../modules/fallout/data/equipment/robot/limbs.json';
import bodyplans from '../../modules/fallout/data/bodyplans/bodyplans.json';
import weaponAsLimbCatalog from '../../modules/fallout/data/equipment/robot/weaponAsLimb.json';
// Модалка замены конечности пока читает каталог оборудования (старые файлы) —
// источник для неё один с движком после следующего патча.
import weaponsCatalog from '../../modules/fallout/data/equipment/robot/weapons.json';

// Единый каталог конечностей: обычные конечности + конечности-оружие.
const allLimbs = [...limbsCatalog, ...weaponAsLimbCatalog];

const robotCatalog = {
  limbs: limbsCatalog,
  weaponAsLimb: weaponAsLimbCatalog,
  weapons: weaponsCatalog,
};

const PLATING = platingCatalogJson.plating || platingCatalogJson;
const FRAMES = framesCatalogJson.frames || framesCatalogJson;

const byId = (list, id) => list.find((entry) => entry.id === id);
const platingFor = (limbType) => {
  const found = PLATING.find((p) => p.limbType === limbType);
  if (!found) throw new Error(`нет обшивки для типа конечности ${limbType}`);
  return { ...found, itemType: 'plating' };
};
const frameFor = (limbType) => {
  const found = FRAMES.find((f) => f.limbType === limbType);
  if (!found) throw new Error(`нет рамы для типа конечности ${limbType}`);
  return { ...found, itemType: 'frame' };
};
const kit = (...ids) => ids.map((id) => ({ ...byId(allLimbs, id) ?? byId(allLimbs, id), itemType: 'robotArm' }));

// Комплект «Няня»: две одинаковые руки-манипулятора и огнемёт между ними.
const handyNanny = () => initRobotSlots('misterHandy', [
  { ...byId(allLimbs, 'robot_arm_mister_handy'), itemType: 'robotArm' },
  { ...byId(allLimbs, 'robot_weapon_flamethrower'), itemType: 'robotArm' },
  { ...byId(allLimbs, 'robot_arm_mister_handy'), itemType: 'robotArm' },
], robotCatalog);

describe('сбор атак', () => {
  it('каждая рука даёт свою карточку — arm3 не теряется', () => {
    const { slots } = handyNanny();
    const weapons = getBuiltinWeaponsFromSlots(slots);

    expect(weapons).toHaveLength(3);
    const manipulators = weapons.filter((w) => w.id === 'robot_weapon_manipulator');
    expect(manipulators).toHaveLength(2);
    expect(manipulators.map((w) => w.sourceSlot).sort()).toEqual(['arm1', 'arm3']);
  });

  it('запись сохраняет форму, которую ждут экраны и сейв', () => {
    const { slots } = handyNanny();
    const [attack] = getBuiltinWeaponsFromSlots(slots);

    expect(attack).toMatchObject({
      id: 'robot_weapon_manipulator',
      weaponId: 'robot_weapon_manipulator',
      sourceSlot: 'arm1',
      sourceLimb: 'robot_arm_mister_handy',
      isBuiltin: true,
    });
    // Служебные поля нового домена наружу не торчат.
    expect(attack.instanceKey).toBeUndefined();
    expect(attack.source).toBeUndefined();
    expect(attack.slotId).toBeUndefined();
  });

  it('оружие вместо руки свою атаку даёт, ладонь — нет', () => {
    const { slots } = handyNanny();
    // Положили пилу в ладонь слота с огнемётом: ладони у него нет.
    slots.arm2.heldWeapon = byId(weaponsCatalog, 'robot_weapon_circular_saw');
    const fromArm2 = getBuiltinWeaponsFromSlots(slots).filter((w) => w.sourceSlot === 'arm2');
    expect(fromArm2).toHaveLength(1);
    expect(fromArm2[0].id).toBe('robot_weapon_flamethrower');
  });

  it('оружие в ладони настоящей руки считается', () => {
    const { slots } = handyNanny();
    const held = byId(weaponsCatalog, 'robot_weapon_protectron_manipulator');
    slots.arm1.heldWeapon = { ...held, name: 'Манипулятор няни', mods: [{ id: 'mod_x' }] };

    const fromArm1 = getBuiltinWeaponsFromSlots(slots).filter((w) => w.sourceSlot === 'arm1');
    expect(fromArm1).toHaveLength(2);
    // В ладони лежит КОНКРЕТНЫЙ предмет: его имя и моды важнее каталога.
    const heldCard = fromArm1.find((w) => w.sourceLimb && w.name === 'Манипулятор няни');
    expect(heldCard?.mods).toHaveLength(1);
    expect(heldCard?.isBuiltin).toBeUndefined();
  });

  it('пустые и незаполненные слоты не дают мусора', () => {
    expect(getBuiltinWeaponsFromSlots({})).toEqual([]);
    expect(getBuiltinWeaponsFromSlots(null)).toEqual([]);
    expect(getBuiltinWeaponsFromSlots({ arm1: null, arm2: {} })).toEqual([]);
  });
});

describe('регрессии', () => {
  it('лазер головы ассультрон сохраняет боевые характеристики', () => {
    const head = byId(allLimbs, 'robot_head_assaultron_laser');
    const { slots } = initRobotSlots('assaultron', [{ ...head }], robotCatalog);
    const weapons = getBuiltinWeaponsFromSlots(slots);
    const laser = weapons.find((w) => w.id === 'robot_weapon_assaultron_head_laser');

    expect(laser).toBeTruthy();
    expect(laser.damage).toBe(5);
    expect(laser.damageType).toBe('energy');
    expect(laser.mainSkill).toBe('ENERGY_WEAPONS');
    expect(laser.isBuiltin).toBe(true);
  });

  it('строительные когти: одинаковые навесы в ладонях дают две карточки', () => {
    const claw = byId(weaponsCatalog, 'robot_weapon_construction_claw');
    const { slots } = initRobotSlots('assaultron', [
      { ...claw, itemType: 'weapon', weaponId: claw.id, slot: 'left' },
      { ...claw, itemType: 'weapon', weaponId: claw.id, slot: 'right' },
    ], robotCatalog);

    // Патч 191: навес крепится к руке — в слоте стандартная рука, навес в ладони.
    expect(slots.leftArm.limb?.id).toBe('robot_arm_assaultron');
    expect(slots.rightArm.limb?.id).toBe('robot_arm_assaultron');
    const claws = getBuiltinWeaponsFromSlots(slots).filter((w) => w.id === 'robot_weapon_construction_claw');
    expect(claws).toHaveLength(2);
    expect(claws.map((w) => w.sourceSlot).sort()).toEqual(['leftArm', 'rightArm']);
    expect(claws[0].damage).toBe(4);
  });

  it('протектрон: встроенного оружия нет, ладонь считается', () => {
    const { slots } = initRobotSlots('protectron', [], robotCatalog);
    expect(getBuiltinWeaponsFromSlots(slots)).toEqual([]);

    slots.leftArm.heldWeapon = byId(weaponsCatalog, 'robot_weapon_protectron_manipulator');
    const weapons = getBuiltinWeaponsFromSlots(slots);
    expect(weapons).toHaveLength(1);
    expect(weapons[0].sourceSlot).toBe('leftArm');
  });

  it('каталог конечностей доступен из реестра', () => {
    const catalog = getRobotLimbCatalog();
    expect(catalog.limbs.length).toBeGreaterThan(0);
    expect(catalog.weaponAsLimb.length).toBeGreaterThan(0);
    expect(catalog.armorLayers.length).toBeGreaterThan(0);
  });
});

describe('защита: раскладка по слотам', () => {
  // Комплект «Помощник»: arm1 — рука-манипулятор, arm2 — огнемёт,
  // arm3 — циркулярная пила (обе — оружие вместо руки).
  const handyAssistant = () => [
    { ...byId(allLimbs, 'robot_arm_mister_handy'), itemType: 'robotArm' },
    { ...byId(allLimbs, 'robot_weapon_flamethrower'), itemType: 'robotArm' },
    { ...byId(allLimbs, 'robot_weapon_circular_saw'), itemType: 'robotArm' },
  ];

  it('обшивка ложится только на настоящую конечность', () => {
    const { slots, inventoryItems } = initRobotSlots('misterHandy', [
      ...handyAssistant(),
      platingFor('arm'),
      platingFor('arm'),
      platingFor('arm'),
    ], robotCatalog);

    expect(slots.arm1.plating?.id).toBeTruthy();
    expect(slots.arm2.plating).toBeFalsy();
    expect(slots.arm3.plating).toBeFalsy();
    // Лишние обшивки не пропадают — уходят в инвентарь.
    expect(inventoryItems.filter((i) => i.itemType === 'plating')).toHaveLength(2);
  });

  it('обшивка «Thruster» идёт в слот движителя', () => {
    const { slots } = initRobotSlots('misterHandy', [platingFor('mover')], robotCatalog);
    expect(slots.thruster.plating?.id).toBeTruthy();
    expect(slots.body.plating).toBeFalsy();
  });

  it('три обшивки «Arms» — по одной на руку', () => {
    const { slots } = initRobotSlots('misterHandy', [
      platingFor('arm'),
      platingFor('arm'),
      platingFor('arm'),
    ], robotCatalog);
    expect(slots.arm1.plating?.id).toBeTruthy();
    expect(slots.arm2.plating?.id).toBeTruthy();
    expect(slots.arm3.plating?.id).toBeTruthy();
  });

  it('Хэнди без конечности защиты не держит', () => {
    const { slots } = initRobotSlots('misterHandy', [], robotCatalog);
    // Руки автозаполнены — защиту принимают; у движителя конечность есть.
    expect(slots.thruster.limb?.id).toBeTruthy();
    expect(slots.arm1.limb?.id).toBeTruthy();
  });
});

describe('canEquipRobotArmor', () => {
  const handySlots = () => {
    const { slots } = initRobotSlots('misterHandy', [], robotCatalog);
    slots.arm2.limb = { ...byId(allLimbs, 'robot_weapon_flamethrower'), itemType: 'robotArm' };
    return slots;
  };

  it('оружие вместо руки обшивку не принимает', () => {
    const slots = handySlots();
    const { allowed, reason } = canEquipRobotArmor(platingFor('arm'), 'arm2', 'plating', slots);
    expect(allowed).toBe(false);
    expect(reason).toBe('equip.error.slotRejectsArmor');
    // А настоящая рука — принимает.
    expect(canEquipRobotArmor(platingFor('arm'), 'arm1', 'plating', slots).allowed).toBe(true);
  });

  it('пустой слот защиты не принимает', () => {
    const slots = handySlots();
    slots.arm3.limb = null;
    const { allowed, reason } = canEquipRobotArmor(platingFor('arm'), 'arm3', 'plating', slots);
    expect(allowed).toBe(false);
    expect(reason).toBe('equip.error.noLimb');
  });

  it('конфликт слоёв ловится в обоих моделях', () => {
    // Обшивка несовместима с рамой и бронёй (incompatibleLayers самой
    // обшивки) — проверяем ровно то направление, которое задано данными.
        const slots = handySlots();
    slots.arm1.frame = frameFor('arm');
    const { allowed, reason } = canEquipRobotArmor(platingFor('arm'), 'arm1', 'plating', slots);
    expect(allowed).toBe(false);
    expect(reason).toBe('equip.error.armorLayerIncompatible');
  });
});

describe('СУ слота: чтение состояния', () => {
  // Старый вид состояния: объекты в полях limb / plating / frame / armor.
  const oldShapeSlot = () => ({
    limb: { id: 'robot_arm_protectron', physicalDR: 2, energyDR: 1, radDR: 0, canHoldWeapons: true },
    plating: platingFor('arm'),
    frame: null,
    armor: null,
    heldWeapon: null,
  });

  // Новый вид: content + armorLayers с идентификаторами.
  const newShapeSlot = () => ({
    content: 'robot_arm_protectron',
    armorLayers: { frame: null, plating: 'robot_plating_standard_arms', armor: null },
    heldWeaponId: null,
  });

  it('старый вид состояния читается (объекты в layer-полях)', () => {
        // Рука протектрона 2/1 + обшивка рук 2/0.
    expect(getRobotSlotDamageResistance(oldShapeSlot()))
      .toEqual({ physical: 4, energy: 1, rad: 0 });
  });

  it('новый вид состояния (content + armorLayers по id) читается', () => {
    // Рука протектрона 2/1 + обшивка рук 2/0, записанные идентификаторами.
    expect(getRobotSlotDamageResistance(newShapeSlot()))
      .toEqual({ physical: 4, energy: 1, rad: 0 });
    expect(getActiveRobotLayers(newShapeSlot()).map((l) => l.key)).toEqual(['plating']);
  });

  it('оружие вместо руки СУ от надетой защиты не получает', () => {
    // Битое состояние старого сейва: на огнемёт надели обшивку.
    const brokenSlot = () => ({
      limb: { id: 'robot_weapon_flamethrower', itemType: 'robotArm' },
      plating: platingFor('arm'),
      frame: null,
      armor: null,
      heldWeapon: null,
    });

    // Обшивка на оружии — мусор старого сейва: вклада не даёт.
    expect(getRobotSlotDamageResistance(brokenSlot()))
      .toEqual({ physical: 0, energy: 0, rad: 0 });
  });

  it('своя СУ конечности-оружия считается, а слои — нет', () => {
    // Правило владельца: конечность-оружие может иметь собственную защиту
    // (если она проставлена в данных руками), но слоёв защиты не имеет.
    const armedWeapon = () => ({
      limb: {
        id: 'robot_weapon_flamethrower',
        itemType: 'robotArm',
        physicalDR: 3,
        energyDR: 2,
        radDR: 1,
      },
      plating: platingFor('arm'), // битое состояние старого сейва
      frame: null,
      armor: null,
      heldWeapon: null,
    });

    // Своя защита есть, вклад обшивки не считается.
    expect(getRobotSlotDamageResistance(armedWeapon()))
      .toEqual({ physical: 3, energy: 2, rad: 1 });

    // В каталоге у оружия вместо руки полей СУ нет — значит и защиты нет.
    expect(getRobotSlotDamageResistance({
      limb: { id: 'robot_weapon_flamethrower', itemType: 'robotArm' },
    })).toEqual({ physical: 0, energy: 0, rad: 0 });
  });

  it('пустой слот защиты не несёт', () => {
        expect(getRobotSlotDamageResistance({})).toEqual({ physical: 0, energy: 0, rad: 0 });
    expect(getRobotSlotDamageResistance(null)).toEqual({ physical: 0, energy: 0, rad: 0 });
  });
});

describe('диапазоны попаданий в экране', () => {
  it('getSlotHitRange — обратная сторона resolveHit', () => {
    expect(getSlotHitRange('protectron', 'leftArm')).toEqual({ from: 4, to: 7 });
    expect(getSlotHitRange('securitron', 'wheel')).toEqual({ from: 18, to: 20 });
    expect(getSlotHitRange('protectron', 'нетТакогоСлота')).toBeNull();
    expect(getSlotHitRange('misterHandy', 'arm1')).toEqual({ from: 5, to: 8 });
    expect(getSlotHitRange('misterHandy', 'thruster')).toEqual({ from: 17, to: 20 });
  });

  it('для каждого броска 1..20 таблица ведёт в слот, который его содержит', () => {
    for (const planId of Object.keys(bodyplans)) {
      for (let roll = 1; roll <= 20; roll += 1) {
        const slotId = resolveHit(planId, roll);
        expect(slotId, `${planId}: бросок ${roll} не попал ни в один слот`).toBeTruthy();
        const range = getSlotHitRange(planId, slotId);
        expect(roll).toBeGreaterThanOrEqual(range.from);
        expect(roll).toBeLessThanOrEqual(range.to);
      }
    }
  });

  it('экран показывает диапазон из плана тела, а не из статики людей', () => {
    const t = (key) => key.split('.').reduce((acc, part) => acc?.[part], screenI18n) ?? key;
    const subtitle = (planId, slotKey) => buildRobotSlotStats(slotKey, { limb: null }, {
      t, bodyPlan: planId,
    }).slotSubtitle;

    // Протектрон: у людей leftArm — 9-11, у протектрона по плану — 4-7.
    expect(subtitle('protectron', 'leftArm')).toBe('4-7');
    expect(subtitle('protectron', 'head')).toBe('1-3');

    // Секьюритрон: колесо 18-20 и так, и так — планы не противоречат.
    expect(subtitle('securitron', 'wheel')).toBe('18-20');

    // Хэнди: по плану arm1 — 5-8 и тело 3-4, статика людей давала бы 9-11 и 3-8.
    expect(subtitle('misterHandy', 'arm1')).toBe('5-8');
    expect(subtitle('misterHandy', 'body')).toBe('3-4');
    // Штурмотрон гуманоидного вида — диапазоны как у людей.
    expect(subtitle('assaultron', 'leftArm')).toBe('9-11');
  });

  it('у всех планов таблица есть — статики людей больше нет', () => {
    // Раньше защиту подписывали общей статикой из i18n: у планов без hitTable
    // диапазона не было вовсе. Теблица попаданий есть у каждого плана.
    expect(resolveHit('misterHandy', 10)).toBe('arm2');
    for (const planId of Object.keys(bodyplans)) {
      for (const slotId of getRobotSlotKeys(planId)) {
        expect(getSlotHitRange(planId, slotId), `${planId}/${slotId}: нет диапазона`).toBeTruthy();
      }
    }
  });
});

describe('замена конечностей', () => {
  // Протектрон: обе руки держат ОДИН И ТОТ ЖЕ объект конечности — ровно
  // тот случай, который раньше считался парой конечностей.
  const pairedProtectron = () => {
    const { slots } = initRobotSlots('protectron', [], robotCatalog);
    slots.rightArm.limb = slots.leftArm.limb;
    return slots;
  };

  it('замена меняет ровно один слот', () => {
    const slots = pairedProtectron();
    const replacement = { ...byId(allLimbs, 'robot_arm_assaultron'), itemType: 'robotArm' };
    const { slots: next } = applyLimbReplacement(slots, 'leftArm', replacement, weaponsCatalog);

    expect(next.leftArm.limb?.id).toBe('robot_arm_assaultron');
    // Сосед остался при своей конечности: пар в модели нет.
    expect(next.rightArm.limb?.id).toBe(slots.rightArm.limb?.id);
  });

  it('Хэнди: замена arm3 не трогает arm1 и arm2', () => {
        const { slots } = initRobotSlots('misterHandy', [
      { ...byId(allLimbs, 'robot_arm_mister_handy'), itemType: 'robotArm' },
      { ...byId(allLimbs, 'robot_weapon_flamethrower'), itemType: 'robotArm' },
      { ...byId(allLimbs, 'robot_arm_mister_handy'), itemType: 'robotArm' },
    ], robotCatalog);
    const before1 = slots.arm1.limb?.id;
    const before2 = slots.arm2.limb?.id;

    const { slots: next } = applyLimbReplacement(
      slots,
      'arm3',
      { ...byId(allLimbs, 'robot_weapon_circular_saw'), itemType: 'robotArm' },
      weaponsCatalog,
    );

    expect(next.arm3.limb?.id).toBe('robot_weapon_circular_saw');
    expect(next.arm1.limb?.id).toBe(before1);
    expect(next.arm2.limb?.id).toBe(before2);
  });

  it('защита снимается, если вместо руки ставится оружие', () => {
    const prepare = () => {
      const { slots } = initRobotSlots('protectron', [], robotCatalog);
      slots.leftArm.plating = platingFor('arm');
      return slots;
    };

    const next = applyLimbReplacement(
      prepare(),
      'leftArm',
      { ...byId(allLimbs, 'robot_weapon_flamethrower'), itemType: 'robotArm' },
      weaponsCatalog,
    ).slots;
    expect(next.leftArm.limb?.id).toBe('robot_weapon_flamethrower');
    expect(next.leftArm.plating).toBeFalsy();
    expect(next.leftArm.armor).toBeFalsy();
    expect(next.leftArm.frame).toBeFalsy();
    // У соседней руки защита не тронута.
    expect(next.rightArm.plating).toBeFalsy();
  });

  it('ладонь: недержащая конечность оружие не удерживает', () => {
        const { slots } = initRobotSlots('protectron', [], robotCatalog);
    slots.leftArm.heldWeapon = byId(weaponsCatalog, 'robot_weapon_protectron_manipulator');

    const { slots: next } = applyLimbReplacement(
      slots,
      'leftArm',
      { ...byId(allLimbs, 'robot_weapon_flamethrower'), itemType: 'robotArm' },
      weaponsCatalog,
    );
    expect(next.leftArm.heldWeapon).toBeFalsy();
  });
});

describe('съёмность слота (swappable)', () => {
  const character = { origin: { bodyPlan: 'misterHandy' } };
  // Голова, совместимая с планом Хэнди (иначе проверка упадёт на плане,
  // а не на съёмности).
  const newHead = {
    ...byId(allLimbs, 'robot_head_mister_handy_eye_stalk'),
    itemType: 'robotHead',
  };

  it('голова не снимается', () => {
    const { allowed, reason } = canReplaceLimb('head', newHead, character);
    expect(allowed).toBe(false);
    expect(reason).toBe('equip.error.slotNotSwappable');
    // Руку менять можно.
    expect(canReplaceLimb('arm1', { ...byId(allLimbs, 'robot_arm_assaultron') }, character).allowed)
      .toBe(true);
  });
});

describe('сторона комплекта: порядок, а не имя слота', () => {
  it('Хэнди: left→arm1, right→arm2, center→arm3', () => {
        expect(getSlotForDirection('misterHandy', 'left')).toBe('arm1');
    expect(getSlotForDirection('misterHandy', 'right')).toBe('arm2');
    expect(getSlotForDirection('misterHandy', 'center')).toBe('arm3');
  });

  it('протектрон: left→leftArm, right→rightArm, центра нет', () => {
        expect(getSlotForDirection('protectron', 'left')).toBe('leftArm');
    expect(getSlotForDirection('protectron', 'right')).toBe('rightArm');
    expect(getSlotForDirection('protectron', 'center')).toBeNull();
  });

  it('слот движителя ищется по типу, а не по имени', () => {
    expect(slotForDirection('misterHandy', 'left', 'mover')).toBe('thruster');
    expect(slotForDirection('securitron', 'left', 'mover')).toBe('wheel');
    expect(slotForDirection('robobrain', 'left', 'mover')).toBe('chassis');
    expect(slotForDirection('protectron', 'left', 'mover')).toBe('leftLeg');
  });

  it('комплект со сторонами раскладывается одинаково в обеих моделях', () => {
    const kitItems = () => [
      { ...byId(allLimbs, 'robot_arm_mister_handy'), itemType: 'robotArm', slot: 'left' },
      { ...byId(allLimbs, 'robot_weapon_flamethrower'), itemType: 'robotArm', slot: 'right' },
    ];
        const { slots } = initRobotSlots('misterHandy', kitItems(), robotCatalog);
    expect(slots.arm1.limb?.id).toBe('robot_arm_mister_handy');
    expect(slots.arm2.limb?.id).toBe('robot_weapon_flamethrower');
  });
});

describe('каталог конечностей для слота', () => {
  // Каталог оборудования для модалки замены конечности: он строится из того же
  // единого каталога, что и движок, и разложен по limbType (см. i18n/equipmentCatalog.js).
  const withItemType = (list, itemType) => list.map((limb) => ({ ...limb, itemType }));
  const runtimeCatalog = {
    robotArms: withItemType(allLimbs.filter((l) => l.limbType === 'arm'), 'robotArm'),
    robotHeads: withItemType(allLimbs.filter((l) => l.limbType === 'head'), 'robotHead'),
    robotBody: withItemType(allLimbs.filter((l) => l.limbType === 'body'), 'robotBody'),
    robotLegs: withItemType(allLimbs.filter((l) => l.limbType === 'mover'), 'robotLeg'),
  };
  const ids = (list) => list.map((l) => l.id).sort();

  it('слот руки предлагает только руки (навесы — не конечности, патч 191)', () => {
    const options = limbOptionsForSlot(runtimeCatalog, 'misterHandy', 'arm1');
    expect(options.length).toBeGreaterThan(0);
    // Все кандидаты — конечности типа arm; навесы (weaponAsLimb) в пикер
    // замены руки не попадают: они крепятся к руке, а не заменяют её.
    for (const limb of options) {
      expect(limb.itemType).toBe('robotArm');
      expect(weaponAsLimbCatalog.some((w) => w.id === limb.id)).toBe(false);
    }
    // Головы, корпуса и движители в список руки не попадают.
    expect(ids(options)).not.toContain('robot_head_protectron');
    expect(ids(options)).not.toContain('robot_body_protectron');
    expect(ids(options)).not.toContain('robot_legs_mister_handy_thruster');
  });

  it('слот движителя предлагает движители, а не ноги по имени', () => {
    const options = limbOptionsForSlot(runtimeCatalog, 'misterHandy', 'thruster');
    expect(options.every((l) => l.itemType === 'robotLegs' || l.itemType === 'robotLeg')).toBe(true);
    expect(ids(options)).toContain('robot_legs_mister_handy_thruster');
  });

  it('слот головы предлагает головы', () => {
    const options = limbOptionsForSlot(runtimeCatalog, 'protectron', 'head');
    expect(options.length).toBeGreaterThan(0);
    expect(options.every((l) => l.itemType === 'robotHead')).toBe(true);
  });

  it('для привычных слотов набор совпадает с каталогом нужного типа', () => {
    const options = (slot, plan) => ids(limbOptionsForSlot(runtimeCatalog, plan, slot));
    // Для рук ожидание — каталог рук БЕЗ навесов: навес не конечность.
    const catalog = (slot) => ids(slot === 'head' ? runtimeCatalog.robotHeads
      : slot === 'body' ? runtimeCatalog.robotBody
        : slot.toLowerCase().includes('arm')
          ? runtimeCatalog.robotArms.filter((l) => !weaponAsLimbCatalog.some((w) => w.id === l.id))
          : runtimeCatalog.robotLegs);

    expect(options('leftArm', 'protectron')).toEqual(catalog('leftArm'));
    expect(options('head', 'protectron')).toEqual(catalog('head'));
    expect(options('body', 'protectron')).toEqual(catalog('body'));
    expect(options('leftLeg', 'protectron')).toEqual(catalog('leftLeg'));
    expect(options('arm3', 'misterHandy')).toEqual(catalog('arm3'));
  });
});
