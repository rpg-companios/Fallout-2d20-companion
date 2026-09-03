import { describe, it, expect } from 'vitest';
import { buildArmLimb, getBuiltinWeaponsFromSlots } from '../../domain/robotEquip';
import arms from '../../modules/fallout/data/equipment/robot/robotarms.json';

const weaponsCatalog = [
  { id: 'robot_weapon_assaultron_laser', name: 'Лазер', damage: 3 },
];

describe('моды встроенного оружия робота переживают пересборку конечности', () => {
  const armEntry = {
    id: 'robot_arm_assaultron',
    itemType: 'robotArm',
    builtinWeaponId: 'robot_weapon_assaultron_laser',
  };

  it('без сохранённого состояния оружие берётся из каталога', () => {
    const limb = buildArmLimb(armEntry, weaponsCatalog);
    expect(limb.builtinWeapons).toHaveLength(1);
    expect(limb.builtinWeapons[0].id).toBe('robot_weapon_assaultron_laser');
    expect(limb.builtinWeapons[0].isBuiltin).toBe(true);
  });

  it('БАГ: applied-моды больше не стираются каталожной заготовкой', () => {
    // Конечность уже несёт применённые моды (пришла из сейва).
    const saved = {
      ...armEntry,
      builtinWeapons: [{
        id: 'robot_weapon_assaultron_laser',
        appliedMods: { Receiver: 'mod_042' },
        isBuiltin: true,
      }],
    };
    const limb = buildArmLimb(saved, weaponsCatalog);
    expect(limb.builtinWeapons[0].appliedMods).toEqual({ Receiver: 'mod_042' });
    // Каталожные статы при этом подмешиваются.
    expect(limb.builtinWeapons[0].name).toBe('Лазер');
  });

  it('моды доезжают до карточек оружия из слотов', () => {
    const slots = {
      rightArm: {
        limb: buildArmLimb({
          ...armEntry,
          builtinWeapons: [{
            id: 'robot_weapon_assaultron_laser',
            appliedMods: { Receiver: 'mod_042' },
            isBuiltin: true,
          }],
        }, weaponsCatalog),
        heldWeapon: null,
      },
    };
    const weapons = getBuiltinWeaponsFromSlots(slots);
    expect(weapons).toHaveLength(1);
    expect(weapons[0].appliedMods).toEqual({ Receiver: 'mod_042' });
    expect(weapons[0].sourceSlot).toBe('rightArm');
  });
});

describe('совместимость рук по слотам (апгрейды Ассаультрона)', () => {
  const list = Array.isArray(arms) ? arms : Object.values(arms);

  it('в данных используется compatibleSlots со слотами вида leftArm', () => {
    const withSlots = list.filter((a) => Array.isArray(a.compatibleSlots));
    expect(withSlots.length).toBeGreaterThan(0);
    expect(withSlots.some((a) => a.compatibleSlots.includes('leftArm'))).toBe(true);
  });

  it('поля slots с именами вида "Left Arm" в данных нет', () => {
    // Старый фильтр искал именно его и потому не находил ничего.
    expect(list.some((a) => Array.isArray(a.slots))).toBe(false);
  });

  it('для руки Ассаультрона отбор по слоту даёт не весь каталог', () => {
    const forLeft = list.filter((a) => a.compatibleSlots?.includes('leftArm'));
    expect(forLeft.length).toBeGreaterThan(0);
    expect(forLeft.length).toBeLessThan(list.length);
  });
});
