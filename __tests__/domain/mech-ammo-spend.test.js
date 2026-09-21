import { describe, it, expect } from 'vitest';
import { buildMechAmmoSpend, mechAmmoSpendForWeapon } from '../../domain/mechAmmoSpend';
import { deserializeSlot } from '../../domain/robotSlots';
import { SETTING } from '../../modules/fallout/index.js';

const MK_VI = 'robot_weapon_mod_assaultron_head_laser_capacitor_mk_vi';
const LASER = 'robot_weapon_assaultron_head_laser';

describe('универсальный механизм списания зарядов (296)', () => {
  it('оружие без особых условий: один заряд за выстрел', () => {
    const plan = buildMechAmmoSpend({ qualities: [{ qualityId: 'quality_two-handed' }] });
    expect(plan.fixed).toBe(1);
    expect(plan.asks).toEqual([]);
    expect(plan.totalFor()).toBe(1);
  });

  it('пожиратель патронов: безусловное списание без запросов', () => {
    const plan = buildMechAmmoSpend({ qualities: [{ qualityId: 'quality_ammo-hungry_x', value: 10 }] });
    expect(plan.fixed).toBe(10);
    expect(plan.asks).toEqual([]);
    expect(plan.totalFor()).toBe(10);
  });

  it('пожиратель без значения: один заряд (как до патча)', () => {
    const plan = buildMechAmmoSpend({ qualities: [{ qualityId: 'quality_ammo-hungry_x' }] });
    expect(plan.fixed).toBe(1);
  });

  it('заводная рукоятка: запрос с потолком, списывается утверждённое', () => {
    const plan = buildMechAmmoSpend({
      qualities: [{ qualityId: 'quality_crank_x', value: 4 }],
      available: 10,
    });
    expect(plan.fixed).toBe(0);
    expect(plan.asks).toEqual([{ source: 'crank', max: 4, maxAvailable: 4 }]);
    expect(plan.totalFor([2])).toBe(2);
    expect(plan.totalFor([4])).toBe(4);
  });

  it('рукоятка при нехватке зарядов: потолок обрезан доступным', () => {
    const plan = buildMechAmmoSpend({
      qualities: [{ qualityId: 'quality_crank_x', value: 4 }],
      available: 2,
    });
    expect(plan.asks[0].maxAvailable).toBe(2);
    // ответ выше доступного зажимается
    expect(plan.totalFor([9])).toBe(2);
  });

  it('конденсатор робо-оружия: ammoPerAttack становится запросом', () => {
    const plan = buildMechAmmoSpend({ mods: [{ id: MK_VI, ammoPerAttack: 6 }], available: 99 });
    expect(plan.asks).toEqual([{ source: 'ammoPerAttack', max: 6, maxAvailable: 6, modId: MK_VI }]);
    expect(plan.totalFor([6])).toBe(6);
    expect(plan.totalFor([1])).toBe(1);
  });

  it('пожиратель + запрос: безусловная часть плюс утверждённое', () => {
    const plan = buildMechAmmoSpend({
      qualities: [
        { qualityId: 'quality_ammo-hungry_x', value: 2 },
        { qualityId: 'quality_crank_x', value: 3 },
      ],
      available: 10,
    });
    expect(plan.fixed).toBe(2);
    expect(plan.asks.length).toBe(1);
    expect(plan.totalFor([3])).toBe(5);
  });

  it('моды без ammoPerAttack запросов не дают', () => {
    const plan = buildMechAmmoSpend({ mods: [{ id: 'mod_047', damageModifier: { op: '+', value: 1 } }] });
    expect(plan.asks).toEqual([]);
    expect(plan.fixed).toBe(1);
  });

  it('ноль зарядов доступно: потолок запроса 0', () => {
    const plan = buildMechAmmoSpend({ qualities: [{ qualityId: 'quality_crank_x', value: 4 }], available: 0 });
    expect(plan.asks[0].maxAvailable).toBe(0);
  });
});

describe('план списания для оружия экрана (296)', () => {
  it('Головной лазер с Mk VI из восстановления слота: запрос до 6', () => {
    const saved = {
      content: 'robot_arm_assaultron',
      armorLayers: { frame: null, plating: null, armor: null },
      heldWeaponId: LASER,
      heldWeaponMods: [MK_VI],
      installedWeapons: [],
    };
    const onScreen = deserializeSlot(saved);
    const plan = mechAmmoSpendForWeapon(onScreen.heldWeapon, { available: 12 });
    expect(plan.asks).toEqual([{ source: 'ammoPerAttack', max: 6, maxAvailable: 6, modId: MK_VI }]);
    expect(plan.totalFor([6])).toBe(6);
  });

  it('лазерный мушкет с 4-оборотным конденсатором: рукоятка до 4, без конденсаторного запроса', () => {
    const musket = SETTING.data.equipment.weapons.find((w) => w.id === 'weapon_laser_musket');
    // так выглядит оружие после мода: качество crank_x добавлено модом mod_050
    const plan = mechAmmoSpendForWeapon(
      { ...musket, qualities: [...(musket.qualities || []), { qualityId: 'quality_crank_x', value: 4 }] },
      { available: 5 },
    );
    expect(plan.asks).toEqual([{ source: 'crank', max: 4, maxAvailable: 4 }]);
    expect(plan.fixed).toBe(0);
  });

  it('мушкет без модов: обычный выстрел, один заряд', () => {
    const musket = SETTING.data.equipment.weapons.find((w) => w.id === 'weapon_laser_musket');
    const plan = mechAmmoSpendForWeapon(musket, { available: 5 });
    expect(plan.fixed).toBe(1);
    expect(plan.asks).toEqual([]);
  });
});
