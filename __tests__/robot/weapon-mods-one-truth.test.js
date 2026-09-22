// __tests__/robot/weapon-mods-one-truth.test.js
//
// Патч 311: единая правда модов оружия.
//   — форма правды (список id; карта «слот → id» выводится) — движок,
//     src/engine/items/weaponMods.ts;
//   — план записи (куда пишется выбор окна модификации) — движок;
//   — собственная атака конечности принимает моды и переживает сохранение
//     (раньше окно их предлагало, а место в сейве не было предусмотрено);
//   — мёртвая карта наследования робо-оружия удалена из кода (id эпохи
//     старой базы не существуют в данных).

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { modIdList, modIdMap, classifyModWritePlan } from '../../src/engine/items/weaponMods';
import {
  collectAttacks,
  attacksFromSlot,
  serializeSlot,
  deserializeSlot,
  setOwnWeaponMods,
  setInstalledWeaponMods,
} from '../../domain/robotSlots';
import { getRobotLimbCatalog } from '../../domain/registry';

const ROOT = join(__dirname, '../..');
const catalog = getRobotLimbCatalog();
const MK3 = 'robot_weapon_mod_assaultron_head_laser_capacitor_mk_iii';

// Голова Штурмотрона с Головным лазером (слот робота в живой форме стора).
const assaultronHeadSlot = () => ({ limb: { id: 'robot_head_assaultron_laser' } });
const resolveMod = (id) => catalog.weaponMods.find((m) => m.id === id) || null;

describe('движок: единая форма правды модов', () => {
  it('appliedMods (карта) — истина экрана; пустая карта означает «модов нет»', () => {
    expect(modIdList({ appliedMods: { Capacitor: MK3 } })).toEqual([MK3]);
    expect(modIdList({ modIds: [MK3], appliedMods: {} })).toEqual([]);
  });

  it('modIds (список) — форма хранения; мусор отфильтровывается', () => {
    expect(modIdList({ modIds: [MK3, null, ''] })).toEqual([MK3]);
    expect(modIdList(undefined)).toEqual([]);
    expect(modIdList('нет')).toEqual([]);
  });

  it('modIdMap: мод знает свой слот; мод без слота не теряется', () => {
    expect(modIdMap([MK3], resolveMod)).toEqual({ Capacitor: MK3 });
    expect(modIdMap(['mod_without_slot'], () => null)).toEqual({ mod_without_slot: 'mod_without_slot' });
  });
});

describe('движок: план записи выбора модов', () => {
  it('ладонь робота — по роли из карточки', () => {
    expect(classifyModWritePlan(
      { sourceSlot: 'arm1', attackRole: 'held', weaponId: 'w1' },
      { slotHasHeldWeapon: true },
    )).toEqual({ kind: 'robotSlot', slotKey: 'arm1', role: 'held', weaponId: 'w1' });
  });

  it('установленное в конечность и собственная атака различаются по роли', () => {
    expect(classifyModWritePlan({ sourceSlot: 'head', attackRole: 'installed' }, {})?.role).toBe('installed');
    expect(classifyModWritePlan({ sourceSlot: 'head', attackRole: 'ownAttack' }, {})?.role).toBe('ownAttack');
  });

  it('наследие: карточка без роли — встроенное считается установленным, ладонь по занятости слота', () => {
    expect(classifyModWritePlan({ sourceSlot: 'arm1', isBuiltin: true }, {})?.role).toBe('installed');
    expect(classifyModWritePlan({ sourceSlot: 'arm1' }, { slotHasHeldWeapon: true })?.role).toBe('held');
    expect(classifyModWritePlan({ sourceSlot: 'arm1' }, {})).toBeNull();
  });

  it('инвентарь и надетое оружие человека; неопознанное — null', () => {
    expect(classifyModWritePlan({ storeItemId: 'item_1' }, {}))
      .toEqual({ kind: 'storeItem', itemId: 'item_1' });
    expect(classifyModWritePlan({ uniqueId: 'u1' }, {}))
      .toEqual({ kind: 'equippedWeapon', uniqueId: 'u1' });
    expect(classifyModWritePlan({}, {})).toBeNull();
  });
});

describe('собственная атака конечности принимает моды и переживает сохранение', () => {
  it('моды пишутся на конечность, карточка Головного лазера считает урон с конденсатором', () => {
    const slots = { head: assaultronHeadSlot() };
    const before = attacksFromSlot(slots.head, { slotId: 'head' });
    expect(before[0].damage).toBe(5);

    const next = setOwnWeaponMods(slots, 'head', { Capacitor: MK3 });
    expect(next.head.limb.ownWeaponMods).toEqual([MK3]);
    // исходные слоты не тронуты
    expect(slots.head.limb.ownWeaponMods).toBeUndefined();

    const card = attacksFromSlot(next.head, { slotId: 'head' })[0];
    expect(card.modIds).toEqual([MK3]);
    expect(card.appliedMods).toEqual({ Capacitor: MK3 });
    expect(card.damage).toBe(6); // 5 базы + 1 конденсатора Mk III
  });

  it('снятие мода возвращает базовый урон', () => {
    let slots = { head: assaultronHeadSlot() };
    slots = setOwnWeaponMods(slots, 'head', { Capacitor: MK3 });
    slots = setOwnWeaponMods(slots, 'head', {});
    expect(slots.head.limb.ownWeaponMods).toEqual([]);
    expect(attacksFromSlot(slots.head, { slotId: 'head' })[0].damage).toBe(5);
  });

  it('худая форма: serialize пишет ownWeaponMods, deserialize восстанавливает карточку', () => {
    let slots = { head: assaultronHeadSlot() };
    slots = setOwnWeaponMods(slots, 'head', { Capacitor: MK3 });

    const slim = serializeSlot(slots.head);
    expect(slim.ownWeaponMods).toEqual([MK3]);
    // без модов поле в худую форму не пишется — форма прежняя
    const slimClean = serializeSlot(assaultronHeadSlot());
    expect('ownWeaponMods' in slimClean).toBe(false);

    const restored = deserializeSlot(slim);
    expect(restored.limb.ownWeaponMods).toEqual([MK3]);
    const ownEntry = restored.limb.builtinWeapons.find((w) => w.isBuiltin);
    expect(ownEntry.appliedMods).toEqual({ Capacitor: MK3 });
    expect(attacksFromSlot(restored, { slotId: 'head' })[0].damage).toBe(6);
  });

  it('карточки collectAttacks несут роль в слоте (для плана записи)', () => {
    let slots = { head: assaultronHeadSlot() };
    slots = setOwnWeaponMods(slots, 'head', { Capacitor: MK3 });
    const cards = collectAttacks(slots);
    const own = cards.find((c) => c.id === 'robot_weapon_assaultron_head_laser');
    expect(own.attackRole).toBe('ownAttack');
    expect(own.isBuiltin).toBe(true);
  });

  it('у установленного оружия и ладони роли тоже размечены', () => {
    // Установленное оружие живёт в записи конечности (как после комплекта
    // или восстановления сейва — deserializeSlot строит builtinWeapons).
    let slots = {
      head: assaultronHeadSlot(),
      arm1: { limb: { id: 'robot_arm_assaultron', builtinWeapons: [{ id: 'robot_weapon_flamethrower' }] } },
    };
    slots = setOwnWeaponMods(slots, 'head', { Capacitor: MK3 });
    const installedNext = setInstalledWeaponMods(slots, 'arm1', 'robot_weapon_flamethrower', {});
    expect(installedNext).not.toBeNull();
    const cards = collectAttacks(installedNext);
    const installed = cards.find((c) => c.id === 'robot_weapon_flamethrower' && c.attackRole);
    expect(installed?.attackRole).toBe('installed');
  });
});

describe('данные: наследование робо-оружия — только через данные', () => {
  it('мёртвой карты в коде больше нет: id weapon_### нигде не зашиты', () => {
    const src = readFileSync(join(ROOT, 'db/catalogSource.js'), 'utf8');
    expect(src).not.toMatch(/ROBOT_WEAPON_BASE_MAP/);
    expect(src).not.toMatch(/weapon_022|weapon_018|weapon_002/);
  });

  it('id вида weapon_### не существуют в данных — карта была мёртвой', () => {
    const weapons = JSON.parse(readFileSync(join(ROOT, 'modules/fallout/data/equipment/weapons.json'), 'utf8'));
    expect(weapons.some((w) => /^weapon_\d+$/.test(w.id || ''))).toBe(false);
  });

  it('файл-перечень слотов робо-модов удалён (знание — в описаниях самих модов)', () => {
    expect(existsSync(join(ROOT, 'modules/fallout/data/equipment/robot/weapon_mod_slots.json'))).toBe(false);
  });
});
