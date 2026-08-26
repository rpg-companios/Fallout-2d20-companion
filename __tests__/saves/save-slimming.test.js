// __tests__/saves/save-slimming.test.js
// Юнит-тесты «ужимателя/восстановителя» тела сейва (domain/saveSlimming.js).
//
// Модуль чистый и не тянет modules/fallout, поэтому тестируется на
// синтетическом каталоге. Проверяем контракт «худого» сейва:
//   - на экспорте вырезаются каталожные поля, остаются поля состояния;
//   - на импорте каталожные поля восстанавливаются, поля состояния не теряются;
//   - стабы/кастом без каталожной записи не теряют данные;
//   - round-trip и идемпотентность.
import { describe, it, expect } from 'vitest';
import {
  SAVE_STATE_FIELDS,
  slimItem,
  restoreItem,
  slimSaveData,
  restoreSaveData,
} from '../../domain/saveSlimming';

// ── Синтетический каталог ────────────────────────────────────────────────
const CATALOG = {
  'weapon_combat_shotgun': {
    id: 'weapon_combat_shotgun',
    itemType: 'weapon',
    name: 'Боевой дробовик',
    damage: 5,
    fireRate: 2,
    range: 'C',
    damageType: 'physical',
    cost: 87,
    rarity: 2,
    weight: '11',
    ammoId: 'ammo_shotgun_shell',
    weaponType: 'Light',
    imageName: 'Combat Shotgun',
    qualities: [{ qualityId: 'quality_two-handed' }],
  },
  'ammo_shotgun_shell': {
    id: 'ammo_shotgun_shell',
    itemType: 'ammo',
    type: 'ammo',
    name: 'Патроны для дробовика',
    cost: 3,
    rarity: 1,
  },
};

const getEntry = (id, itemType) => CATALOG[id] || null;

// Мини-резолвер, повторяющий контракт resolveItem:
//   база из каталога + состояние инстанса; имя из каталога; нет записи → как есть.
const resolve = (instance) => {
  if (!instance || typeof instance !== 'object') return instance;
  const id = instance.weaponId || instance.id;
  const base = CATALOG[id];
  if (!base) return instance;
  return { ...base, ...instance, name: base.name };
};

const makeWeapon = () => ({
  id: 'weapon_combat_shotgun',
  instanceId: 'weapon_combat_shotgun',
  weaponId: 'weapon_combat_shotgun',
  name: 'Боевой дробовик',
  itemType: 'weapon',
  equipped: false,
  locked: false,
  requiresMkII: false,
  quantity: 1,
  stackKey: 'weapon_combat_shotgun',
  appliedMods: {},
  damage: 5,
  fireRate: 2,
  range: 'C',
  damageType: 'physical',
  cost: 87,
  rarity: 2,
  weight: '11',
  ammoId: 'ammo_shotgun_shell',
  qualities: [{ qualityId: 'quality_two-handed' }],
  imageName: 'Combat Shotgun',
  durabilityTracked: false,
  isEquipped: false,
  uniqueId: 'inv-stack-weapon_combat_shotgun',
  sourceSlot: 'rightArm',
});

const makeAmmo = () => ({
  id: 'ammo_shotgun_shell',
  instanceId: 'ammo_shotgun_shell',
  weaponId: 'ammo_shotgun_shell',
  name: 'Патроны для дробовика',
  itemType: 'ammo',
  equipped: false,
  locked: false,
  quantity: 1000,
  stackKey: 'ammo_shotgun_shell',
  appliedMods: {},
  cost: 3,
  rarity: 1,
  durabilityTracked: false,
});

const makeCustom = () => ({
  id: 'trinkets_stub_2',
  instanceId: 'trinkets_stub_2',
  weaponId: 'trinkets_stub_2',
  name: 'Заглючивший голодиск',
  itemType: 'misc',
  equipped: true,
  locked: true,
  quantity: 1,
  stackKey: 'trinkets_stub_2',
  appliedMods: {},
  cost: 0,
  rarity: 0,
  weight: 0.5,
  durabilityTracked: false,
});

describe('slimItem', () => {
  it('вырезает каталожные поля, оставляя поля состояния', () => {
    const slim = slimItem(makeWeapon(), CATALOG['weapon_combat_shotgun']);
    // состояние остаётся
    expect(slim.id).toBe('weapon_combat_shotgun');
    expect(slim.weaponId).toBe('weapon_combat_shotgun');
    expect(slim.instanceId).toBe('weapon_combat_shotgun');
    expect(slim.itemType).toBe('weapon');
    expect(slim.quantity).toBe(1);
    expect(slim.equipped).toBe(false);
    expect(slim.locked).toBe(false);
    expect(slim.requiresMkII).toBe(false);
    expect(slim.appliedMods).toEqual({});
    expect(slim.stackKey).toBe('weapon_combat_shotgun');
    expect(slim.durabilityTracked).toBe(false);
    expect(slim.isEquipped).toBe(false);
    expect(slim.uniqueId).toBe('inv-stack-weapon_combat_shotgun');
    expect(slim.sourceSlot).toBe('rightArm');
    // каталожные поля вырезаны
    expect('name' in slim).toBe(false);
    expect('cost' in slim).toBe(false);
    expect('weight' in slim).toBe(false);
    expect('rarity' in slim).toBe(false);
    expect('damage' in slim).toBe(false);
    expect('fireRate' in slim).toBe(false);
    expect('range' in slim).toBe(false);
    expect('ammoId' in slim).toBe(false);
    expect('qualities' in slim).toBe(false);
    expect('imageName' in slim).toBe(false);
  });

  it('не трогает пункт без каталожной записи (кастом/стаб)', () => {
    const custom = makeCustom();
    const slim = slimItem(custom, null);
    expect(slim).toEqual(custom);
  });

  it('сохраняет fallback-поля, которых нет в каталоге', () => {
    const item = { ...makeAmmo(), proprietaryField: 'x' };
    // аммо в каталоге есть, но proprietaryField каталог не знает
    const slim = slimItem(item, CATALOG.ammo_shotgun_shell);
    expect(slim.proprietaryField).toBe('x');
    expect('name' in slim).toBe(false);
  });
});

describe('restoreItem', () => {
  it('восстанавливает каталожные поля и сохраняет инстансные', () => {
    const slim = slimItem(makeWeapon(), CATALOG['weapon_combat_shotgun']);
    const restored = restoreItem(slim, resolve);
    expect(restored.name).toBe('Боевой дробовик');
    expect(restored.cost).toBe(87);
    expect(restored.weight).toBe('11');
    expect(restored.rarity).toBe(2);
    expect(restored.damage).toBe(5);
    expect(restored.instanceId).toBe('weapon_combat_shotgun');
    expect(restored.requiresMkII).toBe(false);
    expect(restored.quantity).toBe(1);
    expect(restored.uniqueId).toBe('inv-stack-weapon_combat_shotgun');
  });

  it('не портит форму без каталога (кастом)', () => {
    const restored = restoreItem(makeCustom(), resolve);
    expect(restored).toEqual(makeCustom());
  });
});

describe('slimSaveData / restoreSaveData (round-trip)', () => {
  it('ужимает все containers и восстанавливает их обратно', () => {
    const data = {
      schemaVersion: 19,
      equipment: {
        name: 'Комплект',
        weight: 3,
        price: 3335,
        items: [makeWeapon(), makeAmmo(), makeCustom()],
      },
      equippedWeapons: [makeWeapon()],
      equippedArmor: {
        head: { armor: null, clothing: makeCustom() },
        body: { armor: makeWeapon(), clothing: null },
        leftArm: null,
        rightArm: null,
        leftLeg: null,
        rightLeg: null,
      },
      equippedPowerArmor: {
        frame: makeWeapon(),
        pieces: { head: makeWeapon(), body: null, leftArm: null, rightArm: null, leftLeg: null, rightLeg: null },
      },
      equippedRobotSlots: {
        rightArm: { heldWeapon: makeWeapon(), limb: { id: 'robot_arm_smoke' } },
        leftArm: null,
      },
    };

    const slim = slimSaveData(data, { getEntry });
    // каталогные поля удалены в items
    expect('name' in slim.equipment.items[0]).toBe(false);
    expect('cost' in slim.equipment.items[1]).toBe(false);
    // стаб без каталога не тронут
    expect(slim.equipment.items[2]).toEqual(makeCustom());
    // equippedArmor обработаны: каталогный armor ужат, кастомная clothing — нет
    expect('name' in slim.equippedArmor.body.armor).toBe(false);
    expect(slim.equippedArmor.head.clothing.name).toBe('Заглючивший голодиск');
    // equippedPowerArmor frame/пиксели обработаны
    expect('name' in slim.equippedPowerArmor.frame).toBe(false);
    // robot heldWeapon обработано
    expect('name' in slim.equippedRobotSlots.rightArm.heldWeapon).toBe(false);

    // restore возвращает каталогные поля
    const restored = restoreSaveData(slim, { resolve });
    expect(restored.equipment.items[0].name).toBe('Боевой дробовик');
    expect(restored.equipment.items[0].cost).toBe(87);
    expect(restored.equipment.items[0].requiresMkII).toBe(false);
    expect(restored.equipment.items[1].name).toBe('Патроны для дробовика');
    // стаб вернулся как был
    expect(restored.equipment.items[2]).toEqual(makeCustom());
    expect(restored.equippedWeapons[0].name).toBe('Боевой дробовик');
    expect(restored.equippedPowerArmor.frame.cost).toBe(87);
    expect(restored.equippedRobotSlots.rightArm.heldWeapon.cost).toBe(87);
  });

  it('идемпотентна: slim(slim(x)) === slim(x) и restore(restore(x)) стабилен', () => {
    const data = { equipment: { items: [makeWeapon()] }, equippedWeapons: [] };
    const once = slimSaveData(data, { getEntry });
    const twice = slimSaveData(once, { getEntry });
    expect(twice).toEqual(once);

    const restored = restoreSaveData(once, { resolve });
    const restoredAgain = restoreSaveData(restored, { resolve });
    expect(restoredAgain).toEqual(restored);
  });

  it('не ломает отсутствующие контейнеры', () => {
    const data = { schemaVersion: 19, caps: 123 };
    const slim = slimSaveData(data, { getEntry });
    const restored = restoreSaveData(slim, { resolve });
    expect(slim.caps).toBe(123);
    expect(restored.caps).toBe(123);
  });
});

describe('SAVE_STATE_FIELDS', () => {
  it('содержит все ключевые поля состояния', () => {
    for (const key of ['id', 'instanceId', 'weaponId', 'itemType', 'quantity', 'equipped', 'locked', 'appliedMods', 'stackKey', 'charges', 'hpCurrent', 'durability', 'sourceSlot', 'isBuiltin', 'isEquipped', 'requiresMkII']) {
      expect(SAVE_STATE_FIELDS.has(key)).toBe(true);
    }
  });
});
