// __tests__/robot/robot-slot-model.test.js
//
// Этап 2: чистые функции новой модели слота (domain/robotSlots.js).
// Тесты изолированы от рабочего кода: функции пока никуда не подключены,
// каталог берётся из реестра по умолчанию.

import { describe, it, expect } from 'vitest';

import {
  LAYER_KEYS,
  normalizeSlot,
  resolveLimb,
  getSlotDef,
  slotsForLimbType,
  classifyItem,
  activeArmorLayers,
  totalDR,
  slotAcceptsArmor,
  canEquip,
  attacksFromSlot,
  collectAttacks,
  splitLimbWeapons,
  resolveHit,
  validateHitTable,
} from '../../domain/robotSlots';
import { getRobotLimbCatalog } from '../../domain/registry';
import modsCatalog from '../../modules/fallout/data/equipment/weapon_mods.json';
import bodyplans from '../../modules/fallout/data/bodyplans/bodyplans.json';

const catalog = getRobotLimbCatalog();
const limbById = (id) => catalog.limbs.find((l) => l.id === id);
const weaponLimbById = (id) => catalog.weaponAsLimb.find((l) => l.id === id);
const weaponById = (id) => catalog.weapons.find((w) => w.id === id);
const layerById = (id) => catalog.armorLayers.find((l) => l.id === id);

// Пустая рука-манипулятор Хэнди (держит оружие, бьёт манипулятором).
const handyArmSlot = () => ({ content: 'robot_arm_mister_handy' });
// Оружие вместо руки.
const flamerSlot = () => ({ content: 'robot_weapon_flamethrower' });

describe('нормализация состояния слота', () => {
  it('старый вид (limb/armor/plating/frame/heldWeapon) читается', () => {
    const old = {
      limb: { id: 'robot_arm_protectron' },
      armor: null,
      plating: { id: 'robot_plating_standard_arms' },
      frame: null,
      heldWeapon: { id: 'robot_weapon_manipulator' },
    };
    expect(normalizeSlot(old)).toEqual({
      content: { id: 'robot_arm_protectron' },
      armorLayers: {
        frame: null,
        plating: { id: 'robot_plating_standard_arms' },
        armor: null,
      },
      heldWeaponId: 'robot_weapon_manipulator',
      heldWeaponMods: [],
      installedWeapons: [],
    });
  });

  it('установленное оружие из старого вида отделяется от встроенного', () => {
    // Старый сейв: в экземпляре руки лежат и манипулятор (свой), и лазер
    // (установлен игроком). Каталог называет своим только манипулятор.
    const old = {
      limb: {
        id: 'robot_arm_securitron',
        builtinWeaponId: 'robot_weapon_manipulator',
        builtinWeapons: [
          { id: 'robot_weapon_manipulator' },
          { id: 'weapon_laser_gun', appliedMods: { Capacitor: 'mod_capacitor_x' } },
        ],
      },
    };
    const state = normalizeSlot(old);
    expect(state.installedWeapons).toEqual([
      { id: 'weapon_laser_gun', modIds: ['mod_capacitor_x'] },
    ]);
    // Собственная атака в установки не попадает.
    expect(state.installedWeapons.map((w) => w.id)).not.toContain('robot_weapon_manipulator');
  });

  it('моды оружия в ладони читаются из appliedMods', () => {
    const old = {
      limb: { id: 'robot_arm_protectron' },
      heldWeapon: { id: 'weapon_10mm_smg', appliedMods: { Receiver: 'mod_001' } },
    };
    expect(normalizeSlot(old).heldWeaponMods).toEqual(['mod_001']);
  });

  it('новый вид: оружие = база + id модов', () => {
    const next = {
      content: 'robot_arm_protectron',
      heldWeaponId: 'weapon_combat_shotgun',
      heldWeaponMods: ['mod_001'],
      installedWeapons: [{ id: 'weapon_laser_gun', modIds: [] }, 'weapon_submachine_gun'],
    };
    const state = normalizeSlot(next);
    expect(state.heldWeaponId).toBe('weapon_combat_shotgun');
    expect(state.heldWeaponMods).toEqual(['mod_001']);
    expect(state.installedWeapons).toEqual([
      { id: 'weapon_laser_gun', modIds: [] },
      { id: 'weapon_submachine_gun', modIds: [] },
    ]);
  });

  it('новый вид остаётся новым', () => {
    const next = {
      content: 'limb_or_id',
      armorLayers: { frame: null, plating: 'plating_x', armor: null },
      heldWeaponId: 'attack_x',
    };
    expect(normalizeSlot(next).content).toBe('limb_or_id');
    expect(normalizeSlot(next).armorLayers.plating).toBe('plating_x');
    expect(normalizeSlot(next).heldWeaponId).toBe('attack_x');
  });

  it('пустой слот не падает', () => {
    expect(normalizeSlot(null).content).toBeNull();
    expect(normalizeSlot(undefined).heldWeaponId).toBeNull();
    expect(normalizeSlot({}).armorLayers).toEqual({ frame: null, plating: null, armor: null });
  });
});

describe('описание слотов плана тела', () => {
  it('Хэнди: три руки и движитель, голова несъёмная', () => {
    expect(slotsForLimbType('misterHandy', 'arm')).toEqual(['arm1', 'arm2', 'arm3']);
    expect(slotsForLimbType('misterHandy', 'mover')).toEqual(['thruster']);
    expect(slotsForLimbType('misterHandy', 'head')).toEqual(['head']);
    expect(getSlotDef('misterHandy', 'arm1')).toMatchObject({
      id: 'arm1', accepts: ['arm'], capacity: 1, swappable: true,
    });
    expect(getSlotDef('misterHandy', 'head').swappable).toBe(false);
  });

  it('протектрон: руки и ноги парами, колесо у секьюритрона — движитель', () => {
    expect(slotsForLimbType('protectron', 'arm')).toEqual(['leftArm', 'rightArm']);
    expect(slotsForLimbType('protectron', 'mover')).toEqual(['leftLeg', 'rightLeg']);
    expect(slotsForLimbType('securitron', 'mover')).toEqual(['wheel']);
    expect(slotsForLimbType('robobrain', 'mover')).toEqual(['chassis']);
  });

  it('тип конечности выводится и из старого объекта', () => {
    // Старый формат: объект из robotarms.json без itemCategory.
    const legacy = { id: 'robot_arm_mister_handy', itemType: 'robotArm' };
    expect(resolveLimb(catalog, legacy)).toMatchObject({
      itemCategory: 'limb',
      limbType: 'arm',
    });
    expect(resolveLimb(catalog, 'robot_weapon_flamethrower')).toMatchObject({
      itemCategory: 'weaponAsLimb',
      limbType: 'arm',
    });
    expect(classifyItem({ id: 'x', itemType: 'robotArm' })).toBe('limb');
    expect(classifyItem({ id: 'x', layer: 'plating' })).toBe('armorLayer');
    expect(classifyItem({ id: 'x', itemType: 'weapon' })).toBe('weapon');
    expect(LAYER_KEYS).toEqual(['armor', 'frame', 'plating']);
  });
});

describe('canEquip: конечности', () => {
  it('руку — в руку, голову — в голову', () => {
    expect(canEquip({}, limbById('robot_arm_mister_handy'), {
      bodyPlan: 'misterHandy', slotId: 'arm1',
    }).allowed).toBe(true);
    expect(canEquip({}, limbById('robot_head_protectron'), {
      bodyPlan: 'protectron', slotId: 'head',
    }).allowed).toBe(true);
  });

  it('руку в слот головы — нельзя', () => {
    const { allowed, reason } = canEquip({}, limbById('robot_arm_protectron'), {
      bodyPlan: 'protectron', slotId: 'head',
    });
    expect(allowed).toBe(false);
    expect(reason).toBe('equip.error.limbTypeMismatch');
  });

  it('движитель Хэнди — в thruster, а не в ногу', () => {
    const thruster = limbById('robot_legs_mister_handy_thruster');
    expect(thruster.limbType).toBe('mover');
    expect(canEquip({}, thruster, { bodyPlan: 'misterHandy', slotId: 'thruster' }).allowed).toBe(true);
    expect(canEquip({}, thruster, { bodyPlan: 'misterHandy', slotId: 'body' }).allowed).toBe(false);
  });

  it('голову нельзя заменить (swappable: false), руку — можно', () => {
    const headSlot = { content: 'robot_head_protectron' };
    const swapHead = canEquip(headSlot, limbById('robot_head_assaultron'), {
      bodyPlan: 'protectron', slotId: 'head',
    });
    expect(swapHead.allowed).toBe(false);
    expect(swapHead.reason).toBe('equip.error.slotNotSwappable');

    const armSlot = { content: 'robot_arm_protectron' };
    expect(canEquip(armSlot, limbById('robot_arm_assaultron'), {
      bodyPlan: 'protectron', slotId: 'leftArm',
    }).allowed).toBe(true);
  });

  it('навес не ставится в слот руки — только в ладонь (патч 191)', () => {
    const { allowed, reason } = canEquip({}, weaponLimbById('robot_weapon_flamethrower'), {
      bodyPlan: 'misterHandy', slotId: 'arm2',
    });
    expect(allowed).toBe(false);
    expect(reason).toBe('equip.error.attachmentNotALimb');
  });
});

describe('canEquip: оружие в ладонь', () => {
  it('рука-манипулятор берёт оружие, если ладонь пуста', () => {
    const { allowed } = canEquip(handyArmSlot(), weaponById('robot_weapon_manipulator'), {
      bodyPlan: 'misterHandy', slotId: 'arm1',
    });
    expect(allowed).toBe(true);
  });

  it('занятая ладонь — замена по правилу, а не потеря вложенного оружия', () => {
    const busy = { content: 'robot_arm_mister_handy', heldWeaponId: 'robot_weapon_manipulator' };
    // манипулятор → навес: строгий режим запрещает (не аналогичное)
    const toAttachment = canEquip(busy, weaponById('robot_weapon_circular_saw'), {
      bodyPlan: 'misterHandy', slotId: 'arm1',
    });
    expect(toAttachment.allowed).toBe(false);
    expect(toAttachment.reason).toBe('equip.error.armPartReplaceStrict');
    // манипулятор → манипулятор: замена оружия на оружие разрешена
    const toWeapon = canEquip(busy, weaponById('robot_weapon_manipulator'), {
      bodyPlan: 'misterHandy', slotId: 'arm1',
    });
    expect(toWeapon.allowed).toBe(true);
  });

  it('оружие вместо руки ничего в ладонь не берёт', () => {
    const { allowed, reason } = canEquip(flamerSlot(), weaponById('robot_weapon_manipulator'), {
      bodyPlan: 'misterHandy', slotId: 'arm2',
    });
    expect(allowed).toBe(false);
    expect(reason).toBe('equip.error.limbCannotHoldWeapons');
  });

  it('обычная недержабельная атака (handheld: false) в ладонь не кладётся, навес — кладётся', () => {
    // Огнемёт — навес: в ладонь руки кладётся (патч 191), handheld:false
    // его не бракует — это оружие, крепящееся к руке, а не ручное.
    const flamer = canEquip(handyArmSlot(), weaponById('robot_weapon_flamethrower'), {
      bodyPlan: 'misterHandy', slotId: 'arm1',
    });
    expect(weaponById('robot_weapon_flamethrower').handheld).toBe(false);
    expect(flamer.allowed).toBe(true);
  });
});

describe('броня: только на конечность', () => {
  it('слот с оружием вместо руки броню не принимает', () => {
    const { allowed, reason } = slotAcceptsArmor(flamerSlot(), {
      bodyPlan: 'misterHandy', slotId: 'arm2',
    });
    expect(allowed).toBe(false);
    expect(reason).toBe('equip.error.slotRejectsArmor');
    expect(canEquip(flamerSlot(), layerById('robot_plating_standard_arms'), {
      bodyPlan: 'misterHandy', slotId: 'arm2',
    }).allowed).toBe(false);
  });

  it('пустой слот броню не принимает — нечего защищать', () => {
    const { allowed, reason } = slotAcceptsArmor({}, { bodyPlan: 'protectron', slotId: 'leftArm' });
    expect(allowed).toBe(false);
    expect(reason).toBe('equip.error.noLimb');
  });

  it('обшивка ложится на руку-конечность', () => {
    expect(slotAcceptsArmor(handyArmSlot(), {
      bodyPlan: 'misterHandy', slotId: 'arm1',
    }).allowed).toBe(true);
    expect(canEquip(handyArmSlot(), layerById('robot_plating_standard_arms'), {
      bodyPlan: 'misterHandy', slotId: 'arm1',
    }).allowed).toBe(true);
  });

  it('обшивка рук не идёт в слот головы (limbType не совпал)', () => {
    const { allowed, reason } = canEquip({ content: 'robot_head_protectron' },
      layerById('robot_plating_standard_arms'), { bodyPlan: 'protectron', slotId: 'head' });
    expect(allowed).toBe(false);
    expect(reason).toBe('equip.error.limbTypeMismatch');
  });

  it('обшивка конфликтует с рамой и бронёй, броня с рамой — нет', () => {
    const plating = layerById('robot_plating_standard_arms');
    const frame = layerById('robot_frame_actuated_arms');
    const armor = layerById('robot_armor_factory_arms');
    const slot = { content: 'robot_arm_protectron' };
    const opts = { bodyPlan: 'protectron', slotId: 'leftArm' };

    expect(canEquip(slot, frame, opts).allowed).toBe(true);
    expect(canEquip({ ...slot, armorLayers: { frame: frame.id } }, plating, opts).allowed).toBe(false);
    expect(canEquip({ ...slot, armorLayers: { frame: frame.id } }, armor, opts).allowed).toBe(true);
  });
});

describe('totalDR', () => {
  it('СУ слота = конечность + совместимые слои', () => {
    // Рука протектрона: 2 / 1 / 0. Обшивка рук: +2 физической.
    const slot = {
      content: 'robot_arm_protectron',
      armorLayers: { frame: null, plating: 'robot_plating_standard_arms', armor: null },
    };
    expect(totalDR(slot)).toEqual({ physical: 4, energy: 1, rad: 0 });
  });

  it('конфликтующие слои не суммируются', () => {
    const slot = {
      content: 'robot_arm_protectron',
      armorLayers: {
        frame: 'robot_frame_actuated_arms',
        plating: 'robot_plating_standard_arms',
        armor: 'robot_armor_factory_arms',
      },
    };
    expect(activeArmorLayers(slot).map((l) => l.key)).toEqual(['armor', 'frame']);
    // Рука 2/1 + броня (1/1) + рама (1/1); обшивка (2/0) отброшена конфликтом.
    expect(totalDR(slot)).toEqual({ physical: 4, energy: 3, rad: 0 });
  });

  it('оружие вместо руки своей СУ не имеет', () => {
    expect(totalDR(flamerSlot())).toEqual({ physical: 0, energy: 0, rad: 0 });
  });
});

describe('attacksFromSlot', () => {
  it('рука-манипулятор с пустой ладонью — одна атака', () => {
    const attacks = attacksFromSlot({ content: 'robot_arm_mister_handy' }, { slotId: 'arm1' });
    expect(attacks).toHaveLength(1);
    expect(attacks[0].id).toBe('robot_weapon_manipulator');
    expect(attacks[0].source).toBe('builtin');
  });

  it('рука-манипулятор, держащая оружие — две атаки', () => {
    // В ладонь кладём оружие, которое ТОЧНО держится (handheld: true).
    // Циркулярная пила — оружие вместо руки, в ладонь она не кладётся
    // (handheld: false), поэтому здесь защитный манипулятор протектрона.
    const held = weaponById('robot_weapon_protectron_manipulator');
    expect(held.handheld).toBe(true);
    const attacks = attacksFromSlot({
      content: 'robot_arm_mister_handy',
      heldWeaponId: held.id,
    }, { slotId: 'arm1' });
    // Встроенный манипулятор не занимает ладонь — атак две.
    expect(attacks).toHaveLength(2);
    expect(attacks.map((a) => a.source).sort()).toEqual(['builtin', 'held']);
    expect(attacks.map((a) => a.id).sort()).toEqual([
      'robot_weapon_manipulator',
      'robot_weapon_protectron_manipulator',
    ].sort());
  });

  it('навес в ладони считается атакой руки (патч 191)', () => {
    // Пила handheld: false, но она навес — крепится к руке и атакует из ладони.
    const attacks = attacksFromSlot({
      content: 'robot_arm_mister_handy',
      heldWeaponId: 'robot_weapon_circular_saw',
    }, { slotId: 'arm1' });
    const ids = attacks.map((w) => w.id).sort();
    expect(ids).toEqual(['robot_weapon_circular_saw', 'robot_weapon_manipulator']);
  });

  it('оружие вместо руки даёт свою атаку и не держит чужую', () => {
    const attacks = attacksFromSlot({
      content: 'robot_weapon_flamethrower',
      heldWeaponId: 'robot_weapon_manipulator',
    }, { slotId: 'arm2' });
    expect(attacks).toHaveLength(1);
    expect(attacks[0].id).toBe('robot_weapon_flamethrower');
    expect(attacks[0].source).toBe('builtin');
  });

  it('две одинаковые руки — две карточки (arm3 не теряется)', () => {
    const arm1 = attacksFromSlot({ content: 'robot_arm_mister_handy' }, { slotId: 'arm1' });
    const arm3 = attacksFromSlot({ content: 'robot_arm_mister_handy' }, { slotId: 'arm3' });
    expect(arm1).toHaveLength(1);
    expect(arm3).toHaveLength(1);
    expect(arm1[0].id).toBe(arm3[0].id);
    expect(arm1[0].instanceKey).not.toBe(arm3[0].instanceKey);
    expect(arm1[0].instanceKey).toBe('arm1:builtin:robot_weapon_manipulator');
    expect(arm3[0].instanceKey).toBe('arm3:builtin:robot_weapon_manipulator');
  });

  it('пустой слот атак не даёт', () => {
    expect(attacksFromSlot({}, { slotId: 'arm1' })).toEqual([]);
    expect(attacksFromSlot(null, { slotId: 'arm1' })).toEqual([]);
  });

  it('атака несёт боевые характеристики из weapons.json', () => {
    const [attack] = attacksFromSlot({ content: 'robot_arm_assaultron' }, { slotId: 'leftArm' });
    expect(attack.id).toBe('robot_weapon_claw');
    expect(attack.damage).toBe(3);
    expect(attack.damageType).toBe('physical');
    expect(attack.mainSkill).toBe('UNARMED');
  });

  it('человеческое оружие в ладони восстанавливается по id из общего каталога', () => {
    // Рельсотрон — человеческое оружие; в каталоге роботов его нет.
    const [held] = attacksFromSlot({
      content: 'robot_arm_protectron',
      heldWeaponId: 'weapon_railway_rifle',
    }, { slotId: 'rightArm' }).filter((a) => a.source === 'held');
    expect(held).toBeTruthy();
    expect(held.damage).toBeGreaterThan(0);
    expect(held.fireRate).toBeDefined();
    expect(held.mainSkill).toBeTruthy();
  });

  it('из одного слота бывает три атаки: манипулятор + установка + оружие в ладони', () => {
    const attacks = attacksFromSlot({
      content: 'robot_arm_securitron',
      heldWeaponId: 'weapon_combat_shotgun',
      installedWeapons: [{ id: 'weapon_laser_gun', modIds: [] }],
    }, { slotId: 'leftArm' });
    expect(attacks.map((a) => a.source)).toEqual(['held', 'builtin', 'installed']);
    expect(attacks.map((a) => a.id)).toEqual([
      'weapon_combat_shotgun',
      'robot_weapon_manipulator',
      'weapon_laser_gun',
    ]);
  });

  it('установленное оружие — встроенное: isBuiltin в карточке', () => {
    const cards = collectAttacks({
      leftArm: { content: 'robot_arm_securitron', installedWeapons: [{ id: 'weapon_laser_gun' }] },
    });
    const laser = cards.find((w) => w.id === 'weapon_laser_gun');
    expect(laser?.isBuiltin).toBe(true);
    expect(laser?.sourceSlot).toBe('leftArm');
  });

  it('моды оружия в ладони меняют характеристики карточки', () => {
    const base = attacksFromSlot({
      content: 'robot_arm_protectron',
      heldWeaponId: 'weapon_10mm_smg',
    }, { slotId: 'leftArm' }).find((a) => a.source === 'held');
    const mod = modsCatalog.find((m) => m.damageModifier && m.applies_to_ids?.includes('weapon_10mm_smg'));
    expect(mod, 'нужен мод с модификатором урона для ПП 10 мм').toBeTruthy();

    const modded = attacksFromSlot({
      content: 'robot_arm_protectron',
      heldWeaponId: 'weapon_10mm_smg',
      heldWeaponMods: [mod.id],
    }, { slotId: 'leftArm' }).find((a) => a.source === 'held');

    expect(modded.modIds).toEqual([mod.id]);
    expect(modded.appliedMods).toEqual({ [mod.slot]: mod.id });
    const delta = mod.damageModifier.op === '-' ? -mod.damageModifier.value : mod.damageModifier.value;
    expect(modded.damage).toBe(base.damage + delta);
  });
});

describe('таблица попаданий', () => {
  it('протектрон: диапазоны ведут в нужные слоты', () => {
    expect(resolveHit('protectron', 1)).toBe('head');
    expect(resolveHit('protectron', 3)).toBe('head');
    expect(resolveHit('protectron', 5)).toBe('leftArm');
    expect(resolveHit('protectron', 9)).toBe('rightArm');
    expect(resolveHit('protectron', 13)).toBe('body');
    expect(resolveHit('protectron', 17)).toBe('leftLeg');
    expect(resolveHit('protectron', 20)).toBe('rightLeg');
  });

  it('секьюритрон: колесо — движитель, диапазон 18-20', () => {
    expect(resolveHit('securitron', 18)).toBe('wheel');
    expect(resolveHit('securitron', 5)).toBe('body');
    expect(resolveHit('securitron', 13)).toBe('leftArm');
  });

  it('вне таблицы — null', () => {
    expect(resolveHit('protectron', 0)).toBeNull();
    expect(resolveHit('protectron', 21)).toBeNull();
  });

  it('мистер Хэндℹ: голова 1-2, тело 3-4, три руки и движитель', () => {
    expect(resolveHit('misterHandy', 1)).toBe('head');
    expect(resolveHit('misterHandy', 2)).toBe('head');
    expect(resolveHit('misterHandy', 3)).toBe('body');
    expect(resolveHit('misterHandy', 4)).toBe('body');
    expect(resolveHit('misterHandy', 5)).toBe('arm1');
    expect(resolveHit('misterHandy', 8)).toBe('arm1');
    expect(resolveHit('misterHandy', 9)).toBe('arm2');
    expect(resolveHit('misterHandy', 12)).toBe('arm2');
    expect(resolveHit('misterHandy', 13)).toBe('arm3');
    expect(resolveHit('misterHandy', 16)).toBe('arm3');
    expect(resolveHit('misterHandy', 17)).toBe('thruster');
    expect(resolveHit('misterHandy', 20)).toBe('thruster');
  });

  it('гуманоидные планы: голова 1-2, тело 3-8, руки 9-14, ноги 15-20', () => {
    const expectations = [
      ['humanoid', 'torso'],
      ['assaultron', 'body'],
      ['sentryBot', 'body'],
    ];
    for (const [planId, bodySlot] of expectations) {
      expect(resolveHit(planId, 1), planId).toBe('head');
      expect(resolveHit(planId, 2), planId).toBe('head');
      expect(resolveHit(planId, 5), planId).toBe(bodySlot);
      expect(resolveHit(planId, 10), planId).toBe('leftArm');
      expect(resolveHit(planId, 13), planId).toBe('rightArm');
      expect(resolveHit(planId, 16), planId).toBe('leftLeg');
      expect(resolveHit(planId, 19), planId).toBe('rightLeg');
    }
  });

  it('робомозг: шасси — движитель, диапазон 15-20', () => {
    expect(resolveHit('robobrain', 1)).toBe('head');
    expect(resolveHit('robobrain', 5)).toBe('body');
    expect(resolveHit('robobrain', 10)).toBe('leftArm');
    expect(resolveHit('robobrain', 17)).toBe('chassis');
    expect(resolveHit('robobrain', 20)).toBe('chassis');
  });

  it('у каждого плана тела таблица есть и покрывает d20 без дыр и наложений', () => {
    for (const planId of Object.keys(bodyplans)) {
      const result = validateHitTable(planId);
      expect(result.errors, `${planId}: ${result.errors.join('; ')}`).toEqual([]);
      expect(result.warnings, `${planId}: таблицы нет — ${result.warnings.join('; ')}`).toEqual([]);
      expect(result.covered, `${planId}: покрытие неполное`).toHaveLength(20);
    }
  });
});
