// __tests__/robot/mister-handy.test.js
//
// ACCEPTANCE-тест переработки слотовой модели роботов (этап 0 плана,
// см. docs/architecture/robot-slot-refactoring.md).
//
// Мистер Хэнди выбран не случайно: это единственный план тела, который ломает
// все три старые модели слотов одновременно —
//   * три руки arm1/arm2/arm3 (ни одна не называется leftArm/rightArm);
//   * движитель называется thruster (не leftLeg/rightLeg);
//   * голову зовут head, но это «оптика» (Optics) для брони.
//
// Acceptance-критерий рефакторинга: зелёный файл означает, что этапы 1–4
// выполнены. Идёт через существующие точки входа (initRobotSlots →
// getBuiltinWeaponsFromSlots), а не через новые чистые функции, — так он
// проверяет именно то, что видит игрок.
//
// Часть проверок зелёная уже сейчас — это регрессионные страховки: они должны
// остаться зелёными на всех этапах.

import { describe, it, expect } from 'vitest';

import kits from '../../modules/fallout/data/equipmentKits/index.js';
import limbs from '../../modules/fallout/data/equipment/robot/limbs.json';
import weaponAsLimb from '../../modules/fallout/data/equipment/robot/weaponAsLimb.json';
import robotWeapons from '../../modules/fallout/data/equipment/robot/weapons.json';
import platingFile from '../../modules/fallout/data/equipment/robot/armor_plating.json';
import framesFile from '../../modules/fallout/data/equipment/robot/frames.json';
import {
  initRobotSlots,
  getBuiltinWeaponsFromSlots,
  findFreeWeaponHand,
} from '../../domain/robotEquip';

// ---------------------------------------------------------------------------
// Сборка предметов кита: то же, что делает kitResolver, но синхронно и без БД
// ---------------------------------------------------------------------------

const PLATING = platingFile.plating || [];
const FRAMES = framesFile.frames || [];

const robotCatalog = {
  limbs,
  weaponAsLimb,
  weapons: robotWeapons,
  plating: PLATING,
  frames: FRAMES,
};

const CATALOG_BY_ID = new Map(
  [...limbs, ...weaponAsLimb, ...robotWeapons, ...PLATING, ...FRAMES]
    .map((entry) => [entry.id, entry]),
);

/** Разворачивает комплект в список предметов для initRobotSlots. */
const resolveKit = (kitId, { choiceIndex = 0 } = {}) => {
  const kit = kits[kitId];
  if (!kit) throw new Error(`нет комплекта ${kitId}`);

  const pushEntry = (out, entry) => {
    const id = entry.itemId || entry.weaponId || entry.armorId;
    if (!id) return;
    const source = CATALOG_BY_ID.get(id);
    if (!source) return;
    out.push({ ...source, ...entry, itemType: entry.itemType });
  };

  const out = [];
  for (const entry of kit.items) {
    if (entry.type === 'choice') {
      // Выбор игрока в тесте детерминирован: берём вариант choiceIndex.
      const chosen = entry.items?.[choiceIndex];
      if (!chosen) continue;
      if (chosen.type === 'fixed') pushEntry(out, chosen);
      continue;
    }
    pushEntry(out, entry);
  }
  return out;
};

/** Защитный слой (обшивка) указанного типа конечности — как запись из каталога. */
const platingFor = (limbType) => {
  const found = PLATING.find((entry) => entry.limbType === limbType);
  if (!found) throw new Error(`нет обшивки для типа конечности ${limbType}`);
  return { ...found, itemType: 'plating' };
};

/** Атаки, которые слот отдаёт в список оружия. */
const attacksOfSlot = (slots, slotKey) =>
  getBuiltinWeaponsFromSlots(slots).filter((w) => w.sourceSlot === slotKey);

// Пустой Хэнди = базовая модель из bodyPlan.defaults: три руки-манипулятора,
// корпус, оптика и реактивная тяга.
const emptyHandy = () => initRobotSlots('misterHandy', [], robotCatalog);

describe('Мистер Хэнди — acceptance-критерий новой модели слотов', () => {
  // -------------------------------------------------------------------------
  // Регрессионные страховки (зелёные сейчас, должны остаться зелёными)
  // -------------------------------------------------------------------------

  it('конечности берутся из единого каталога, а не из старых файлов', () => {
    // Каталог конечностей один: limbs.json + weaponAsLimb.json. Старых ключей
    // (heads/bodies/arms/legs) движок больше не знает — данные импортируются
    // в его вызове, скрытых источников нет.
    const { slots } = emptyHandy();
    for (const key of Object.keys(slots)) {
      expect(slots[key].limb, `слот ${key} остался пустым`).toBeTruthy();
    }
    expect(slots.thruster.limb?.limbType).toBe('mover');
    expect(slots.arm1.limb?.limbType).toBe('arm');

    // Каталога нет — конечности не берутся ниоткуда: фолбэков в движке нет.
    const bare = initRobotSlots('misterHandy', [], {});
    for (const key of Object.keys(bare.slots)) {
      expect(bare.slots[key].limb, `слот ${key} заполнился без каталога`).toBeNull();
    }
  });

  it('три слота рук и движитель заполняются из комплекта, arm3 не теряется', () => {
    const { slots } = initRobotSlots(
      'misterHandy',
      resolveKit('mister_handy_assistant'),
      robotCatalog,
    );

    expect(Object.keys(slots)).toEqual(['head', 'body', 'arm1', 'arm2', 'arm3', 'thruster']);
    // Патч 191: навесы крепятся К рукам — во всех трёх слотах руки-манипуляторы,
    // огнемёт и пила — в ладонях.
    expect(slots.arm1.limb?.id).toBe('robot_arm_mister_handy');
    expect(slots.arm1.heldWeapon?.id).toBe('robot_weapon_flamethrower');
    expect(slots.arm2.limb?.id).toBe('robot_arm_mister_handy');
    expect(slots.arm2.heldWeapon?.id).toBe('robot_weapon_circular_saw');
    expect(slots.arm3.limb?.id).toBe('robot_arm_mister_handy');
    // Движитель: thruster, а не leftLeg/rightLeg.
    expect(slots.thruster.limb?.id).toBe('robot_legs_mister_handy_thruster');
  });

  it('все три руки доступны для оружия (arm3 не пропускается при выборе)', () => {
    const { slots } = emptyHandy();

    // Ищем свободную руку three раза подряд, помечая предыдущие занятыми —
    // так же, как это делает инвентарь при экипировке оружия.
    const occupied = [];
    const found = [];
    for (let i = 0; i < 3; i += 1) {
      const hand = findFreeWeaponHand(slots, occupied);
      if (!hand) break;
      found.push(hand[0]);
      occupied.push(hand[0]);
    }

    expect(found).toEqual(['arm1', 'arm2', 'arm3']);
  });

  it('обшивка локации «Thruster» ложится на слот движителя', () => {
    const { slots } = initRobotSlots(
      'misterHandy',
      [platingFor('mover')],
      robotCatalog,
    );

    expect(slots.thruster.plating?.id).toBeTruthy();
    expect(slots.body.plating).toBeFalsy();
  });

  it('рука-манипулятор с ПУСТОЙ ладонью даёт одну атаку', () => {
    const { slots } = emptyHandy();

    expect(attacksOfSlot(slots, 'arm1').map((w) => w.id)).toEqual([
      'robot_weapon_manipulator',
    ]);
  });

  it('три одинаковые руки-манипулятора: обшивка «Arms» — по одной на руку', () => {
    const { slots } = initRobotSlots(
      'misterHandy',
      [platingFor('arm'), platingFor('arm'), platingFor('arm')],
      robotCatalog,
    );

    // 1 предмет = 1 слот: три обшивки должны лечь на три РАЗНЫЕ руки,
    // а не все три в первый подходящий слот.
    expect(slots.arm1.plating?.id).toBeTruthy();
    expect(slots.arm2.plating?.id).toBeTruthy();
    expect(slots.arm3.plating?.id).toBeTruthy();
    expect(slots.thruster.plating).toBeFalsy();
    expect(slots.head.plating).toBeFalsy();
  });

  // -------------------------------------------------------------------------
  // Критерии готовности (падают до рефакторинга)
  // -------------------------------------------------------------------------

  it('рука-манипулятор, держащая оружие, даёт две атаки', () => {
    const { slots: baseSlots } = emptyHandy();
    const slots = {
      ...baseSlots,
      arm1: {
        ...baseSlots.arm1,
        heldWeapon: { id: 'weapon_10mm_pistol', itemType: 'weapon', name: '10mm pistol' },
      },
    };

    // Встроенный манипулятор не занимает ладонь, поэтому атак две:
    // вложенный пистолет + встроенный манипулятор.
    const attacks = attacksOfSlot(slots, 'arm1').map((w) => w.id);
    expect(attacks).toHaveLength(2);
    expect(attacks).toContain('weapon_10mm_pistol');
    expect(attacks).toContain('robot_weapon_manipulator');
  });

  it('arm3 не теряется: каждая рука-манипулятор даёт собственную атаку', () => {
    // Комплект «Няня»: arm1 — рука-манипулятор, arm2 — огнемёт (навес в ладони,
    // патч 191), arm3 — рука-манипулятор (первый вариант выбора).
    const { slots } = initRobotSlots(
      'misterHandy',
      resolveKit('mister_handy_nanny'),
      robotCatalog,
    );

    expect(slots.arm1.limb?.id).toBe('robot_arm_mister_handy');
    expect(slots.arm3.limb?.id).toBe('robot_arm_mister_handy');

    // Четыре источника атак: манипулятор arm1 + огнемёт в его ладони (навес
    // не глушит собственную атаку руки), манипуляторы arm2 и arm3.
    // Дедуп по id оружия второй манипулятор не съедает.
    expect(attacksOfSlot(slots, 'arm1')).toHaveLength(2);
    expect(attacksOfSlot(slots, 'arm2')).toHaveLength(1);
    expect(attacksOfSlot(slots, 'arm3')).toHaveLength(1);
    expect(getBuiltinWeaponsFromSlots(slots)).toHaveLength(4);
  });

  it('рука с навесом принимает обшивку: броня — на любую конечность (патч 191)', () => {
    // Комплект «Помощник»: во всех трёх слотах — руки-манипуляторы; огнемёт
    // и пила — навесы в ладонях, а не «оружие вместо руки».
    const { slots } = initRobotSlots(
      'misterHandy',
      [
        ...resolveKit('mister_handy_assistant'),
        platingFor('arm'),
        platingFor('arm'),
        platingFor('arm'),
      ],
      robotCatalog,
    );

    // Обшивка ложится на каждую руку: навес в ладони ей не мешает.
    expect(slots.arm1.plating?.id).toBeTruthy();
    expect(slots.arm2.plating?.id).toBeTruthy();
    expect(slots.arm3.plating?.id).toBeTruthy();
  });

});
