// __tests__/robot/robot-arm-attachment-mode.test.js
//
// Новая модель навесов (arm attachments, патч 191):
//   1. Навес — оружие, крепящееся К руке: занимает ладонь (heldWeapon),
//      а не слот конечности. Без руки его получить нельзя.
//   2. Замена — «аналогичное на аналогичное» в строгом режиме настройки
//      robotArmPartsStrictReplace (по умолчанию включён): навес меняется
//      навесом, оружие — оружием. Выключена — что угодно.
//   3. Все конечности (включая руки) принимают слои защиты.
//   4. Сборка комплекта: навес без руки получает стандартную руку плана
//      тела и крепится уже к ней.
//   5. Миграция v21→v22: навес, стоявший вместо руки, пересаживается в
//      ладонь стандартной руки плана.

import { describe, it, expect } from 'vitest';
import limbsFile from '../../modules/fallout/data/equipment/robot/limbs.json';
import weaponAsLimbFile from '../../modules/fallout/data/equipment/robot/weaponAsLimb.json';
import moduleSettings from '../../modules/fallout/settings.json';
import ruSettings from '../../modules/fallout/i18n/ru-RU/data/system/settings.json';
import enSettings from '../../modules/fallout/i18n/en-EN/data/system/settings.json';
import { CURRENT_SCHEMA_VERSION } from '../../src/store/saveSchema';
import { migrateRobotArmAttachments } from '../../src/store/migrations';
import {
  isArmAttachment,
  canReplaceArmWeapon,
  canEquip,
  limbOptionsForSlot,
} from '../../domain/robotSlots';
import { initRobotSlots } from '../../domain/robotEquip';
import { getRobotLimbCatalog } from '../../domain/registry';

const LIMBS = limbsFile;
const WEAPONS_AS_LIMB = weaponAsLimbFile;

const armById = (id) => LIMBS.find((l) => l.id === id);
const attachmentById = (id) => WEAPONS_AS_LIMB.find((l) => l.id === id);

const ROBOT_CATALOG = {
  limbs: LIMBS,
  weaponAsLimb: WEAPONS_AS_LIMB,
  weapons: [],
  generalWeapons: [],
  weaponMods: [],
};

const makeSlot = ({ limb = null, heldWeapon = null } = {}) => ({ limb, heldWeapon });

describe('патч 191: навес — оружие на руке, а не конечность', () => {
  // ------------------------------------------------------------------ isArmAttachment
  it('isArmAttachment: узнаёт навес по записи каталога и по id-предмету', () => {
    expect(isArmAttachment(attachmentById('robot_weapon_circular_saw'), ROBOT_CATALOG)).toBe(true);
    expect(isArmAttachment({ id: 'robot_weapon_drill' }, ROBOT_CATALOG)).toBe(true);
    expect(isArmAttachment({ weaponId: 'robot_weapon_drill' }, ROBOT_CATALOG)).toBe(true);
    expect(isArmAttachment(armById('robot_arm_mister_handy'), ROBOT_CATALOG)).toBe(false);
    expect(isArmAttachment({ id: 'weapon_10mm_pistol' }, ROBOT_CATALOG)).toBe(false);
    expect(isArmAttachment(null, ROBOT_CATALOG)).toBe(false);
  });

  // ------------------------------------------------------------------ canEquip
  it('навес ставится в ладонь руки, но не без руки', () => {
    const misterHandy = armById('robot_arm_mister_handy');
    const saw = attachmentById('robot_weapon_circular_saw');

    const withArm = canEquip(
      makeSlot({ limb: misterHandy }),
      { id: saw.id, weaponId: saw.id },
      { bodyPlan: 'misterHandy', slotId: 'arm1', catalog: ROBOT_CATALOG }
    );
    expect(withArm.allowed).toBe(true);

    const noArm = canEquip(
      makeSlot({ limb: null }),
      { id: saw.id, weaponId: saw.id },
      { bodyPlan: 'misterHandy', slotId: 'arm1', catalog: ROBOT_CATALOG }
    );
    expect(noArm.allowed).toBe(false);
  });

  it('строгая замена: навес меняется только на навес, оружие — только на оружие', () => {
    const misterHandy = armById('robot_arm_mister_handy');
    const saw = attachmentById('robot_weapon_circular_saw');
    const drill = attachmentById('robot_weapon_drill');
    const pistol = { id: 'weapon_10mm_pistol', itemType: 'weapon', weight: 2 };

    // навес → навес: можно
    expect(canEquip(
      makeSlot({ limb: misterHandy, heldWeapon: { id: saw.id } }),
      { id: drill.id, weaponId: drill.id },
      { bodyPlan: 'misterHandy', slotId: 'arm1', catalog: ROBOT_CATALOG, armPartsStrict: true }
    ).allowed).toBe(true);

    // навес → обычное оружие: нельзя (строгий режим)
    const strictDeny = canEquip(
      makeSlot({ limb: misterHandy, heldWeapon: { id: saw.id } }),
      pistol,
      { bodyPlan: 'misterHandy', slotId: 'arm1', catalog: ROBOT_CATALOG, armPartsStrict: true }
    );
    expect(strictDeny.allowed).toBe(false);
    expect(strictDeny.reason).toBe('equip.error.armPartReplaceStrict');

    // навес → обычное оружие: можно при выключенной настройке
    expect(canEquip(
      makeSlot({ limb: misterHandy, heldWeapon: { id: saw.id } }),
      pistol,
      { bodyPlan: 'misterHandy', slotId: 'arm1', catalog: ROBOT_CATALOG, armPartsStrict: false }
    ).allowed).toBe(true);

    // оружие → навес: нельзя в строгом, можно в свободном
    expect(canEquip(
      makeSlot({ limb: misterHandy, heldWeapon: pistol }),
      { id: drill.id, weaponId: drill.id },
      { bodyPlan: 'misterHandy', slotId: 'arm1', catalog: ROBOT_CATALOG, armPartsStrict: true }
    ).allowed).toBe(false);
    expect(canEquip(
      makeSlot({ limb: misterHandy, heldWeapon: pistol }),
      { id: drill.id, weaponId: drill.id },
      { bodyPlan: 'misterHandy', slotId: 'arm1', catalog: ROBOT_CATALOG, armPartsStrict: false }
    ).allowed).toBe(true);
  });

  it('навес нельзя установить как конечность — только в ладонь руки', () => {
    const saw = attachmentById('robot_weapon_circular_saw');
    const check = canEquip(
      makeSlot({ limb: null }),
      saw,
      { bodyPlan: 'misterHandy', slotId: 'arm1', catalog: ROBOT_CATALOG }
    );
    expect(check.allowed).toBe(false);
    expect(check.reason).toBe('equip.error.attachmentNotALimb');
  });

  it('canReplaceArmWeapon: свободный режим разрешает любую замену', () => {
    const saw = attachmentById('robot_weapon_circular_saw');
    expect(canReplaceArmWeapon({ id: saw.id }, { id: 'weapon_10mm_pistol' }, { strict: false }).allowed).toBe(true);
    expect(canReplaceArmWeapon({ id: saw.id }, { id: 'robot_weapon_drill' }, { strict: true }).allowed).toBe(true);
    expect(canReplaceArmWeapon({ id: saw.id }, { id: 'weapon_10mm_pistol' }, { strict: true }).reason)
      .toBe('equip.error.armPartReplaceStrict');
  });

  // ------------------------------------------------------------------ пикер конечностей
  it('в пикер замены руки навесы не попадают', () => {
    const runtimeCatalog = {
      robotArms: [
        ...LIMBS.filter((l) => l.limbType === 'arm'),
        ...WEAPONS_AS_LIMB,
      ],
      robotHeads: [],
      robotBody: [],
      robotLegs: [],
    };
    const options = limbOptionsForSlot(runtimeCatalog, 'misterHandy', 'arm1');
    const optionIds = options.map((entry) => entry.id);
    // руки — есть, навесы — нет
    expect(optionIds).toContain('robot_arm_mister_handy');
    for (const attachment of WEAPONS_AS_LIMB) {
      expect(optionIds).not.toContain(attachment.id);
    }
  });

  // ------------------------------------------------------------------ броня
  it('рука с навесом в ладони принимает слои защиты', () => {
    const misterHandy = armById('robot_arm_mister_handy');
    const saw = attachmentById('robot_weapon_circular_saw');
    const plating = {
      layer: 'plating',
      limbType: 'arm',
      incompatibleLayers: ['armor', 'frame'],
      damageResistance: { physical: 2, energy: 0 },
    };
    const check = canEquip(
      makeSlot({ limb: misterHandy, heldWeapon: { id: saw.id } }),
      plating,
      { bodyPlan: 'misterHandy', slotId: 'arm1', catalog: ROBOT_CATALOG }
    );
    expect(check.allowed).toBe(true);
  });

  // ------------------------------------------------------------------ сборка комплекта
  it('сборка комплекта: навес без руки получает стандартную руку плана и крепится к ней', () => {
    const resolvedKitItems = [
      { itemType: 'weapon', id: 'robot_weapon_circular_saw', weaponId: 'robot_weapon_circular_saw', name: 'Пила' },
    ];
    const result = initRobotSlots('misterHandy', resolvedKitItems, ROBOT_CATALOG);
    const slot = result.slots.arm1 ?? Object.values(result.slots)[0];
    // рука — стандартная рука мистера-помощника, не навес
    expect(slot.limb?.id ?? slot.limb).toBe('robot_arm_mister_handy');
    // навес — в ладони
    const heldId = slot.heldWeapon?.id ?? slot.heldWeapon?.weaponId;
    expect(heldId).toBe('robot_weapon_circular_saw');
  });

  // ------------------------------------------------------------------ миграция v21→v22
  it('миграция v22: навес вместо руки пересаживается в стандартную руку плана', () => {
    const state = {
      origin: { bodyPlan: 'misterHandy' },
      equippedRobotSlots: {
        arm1: {
          limb: { id: 'robot_weapon_circular_saw', itemType: 'robotArm', canHoldWeapons: false },
          heldWeapon: null,
        },
        arm2: { limb: { id: 'robot_arm_mister_handy' }, heldWeapon: null },
      },
    };
    const migrated = migrateRobotArmAttachments(state);
    expect(migrated.equippedRobotSlots.arm1.limb).toEqual({ id: 'robot_arm_mister_handy' });
    expect(migrated.equippedRobotSlots.arm1.heldWeapon).toMatchObject({
      id: 'robot_weapon_circular_saw',
      weaponId: 'robot_weapon_circular_saw',
      itemType: 'weapon',
    });
    // незатронутый слот не меняется
    expect(migrated.equippedRobotSlots.arm2).toBe(state.equippedRobotSlots.arm2);
    // идемпотентность
    expect(migrateRobotArmAttachments(migrated)).toBe(migrated);
  });

  it('миграция v22 понимает «худой» вид слота (id навеса строкой)', () => {
    const state = {
      origin: { bodyPlan: 'protectron' },
      equippedRobotSlots: {
        leftArm: { limb: 'robot_weapon_drill', heldWeapon: null },
      },
    };
    const migrated = migrateRobotArmAttachments(state);
    expect(migrated.equippedRobotSlots.leftArm.limb).toEqual({ id: 'robot_arm_protectron' });
    expect(migrated.equippedRobotSlots.leftArm.heldWeapon).toMatchObject({ id: 'robot_weapon_drill' });
  });

  it('версия схемы — 23 (v22 навесы, v23 выживание)', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(23);
  });

  // ------------------------------------------------------------------ настройка
  it('настройка объявлена: раздел robots, по умолчанию строгая замена', () => {
    const setting = moduleSettings.find((s) => s.id === 'robotArmPartsStrictReplace');
    expect(setting).toBeTruthy();
    expect(setting.type).toBe('boolean');
    expect(setting.sectionKey).toBe('robots');
    expect(setting.controlSurface).toBe('settings');
    expect(setting.defaultValue).toBe(true);
  });

  it('строки настройки есть в ru и en i18n', () => {
    for (const dict of [ruSettings, enSettings]) {
      expect(typeof dict.robots).toBe('string');
      expect(typeof dict.robotArmsStrictTitle).toBe('string');
      expect(typeof dict.robotArmsStrictDescription).toBe('string');
    }
  });

  // ------------------------------------------------------------------ каталог
  it('навесы не числятся конечностями в едином каталоге', () => {
    const catalog = getRobotLimbCatalog();
    for (const attachment of WEAPONS_AS_LIMB) {
      expect(LIMBS.some((l) => l.id === attachment.id)).toBe(false);
      expect(isArmAttachment({ id: attachment.id }, catalog)).toBe(true);
    }
  });
});
