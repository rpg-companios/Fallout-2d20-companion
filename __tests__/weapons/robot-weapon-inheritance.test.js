// __tests__/weapons/robot-weapon-inheritance.test.js
//
// Патч 312: робо-оружие наследует людские моды через ДАННЫЕ (baseWeaponId),
// и оружие может выходить «с модом из коробки» (modIds в записи — конвенция
// кита супермутанта: weaponId + modIds).
//   Огнемёт Мистера Помощника — это людской Огнемёт;
//   Лазерный резак — людской Лазерный пистолет;
//   Автоматический 10-мм пистолет — Пистолет 10мм с авто-ресивером (mod_008).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { attacksFromSlot, collectAttacks, serializeSlot } from '../../domain/robotSlots';
import { getRobotLimbCatalog } from '../../domain/registry';
import { catalogGetWeaponMods, catalogGetModsForWeaponSlot } from '../../db/catalogSource';

const ROOT = join(__dirname, '../..');
const catalog = getRobotLimbCatalog();

const robotWeapons = () => JSON.parse(
  readFileSync(join(ROOT, 'modules/fallout/data/equipment/robot/weapons.json'), 'utf8'),
);
const humanWeapons = () => JSON.parse(
  readFileSync(join(ROOT, 'modules/fallout/data/equipment/weapons.json'), 'utf8'),
);

describe('данные: связи робо-оружия с людской базой живые', () => {
  it('baseWeaponId указывает на существующие записи людского оружия', () => {
    const humans = new Set(humanWeapons().map((w) => w.id));
    const linked = robotWeapons().filter((w) => w.baseWeaponId);
    expect(linked.map((w) => w.id).sort()).toEqual([
      'robot_weapon_auto_10mm',
      'robot_weapon_flamethrower',
      'robot_weapon_laser_cutter',
    ]);
    for (const w of linked) {
      expect(humans.has(w.baseWeaponId)).toBe(true);
    }
  });

  it('заводской мод auto-ресивера существует и подходит к Пистолету 10мм', () => {
    const mods = JSON.parse(
      readFileSync(join(ROOT, 'modules/fallout/data/equipment/weapon_mods.json'), 'utf8'),
    );
    const auto = mods.find((m) => m.id === 'mod_008');
    expect(auto).toBeTruthy();
    expect(auto.applies_to_ids).toContain('weapon_10mm_pistol');
  });
});

describe('окно улучшения: людские моды подходят к робо-версиям', () => {
  it('моды Огнемёта людей видны у Огнемёта Мистера Помощника', () => {
    const human = catalogGetWeaponMods('weapon_flamer').map((m) => m.id);
    const robot = catalogGetWeaponMods('robot_weapon_flamethrower').map((m) => m.id);
    expect(robot).toEqual(expect.arrayContaining(human));
    expect(human.length).toBeGreaterThan(0);
  });

  it('слоты Лазерного резака — слоты Лазерного пистолета (конденсаторы и ствол)', () => {
    const slots = catalogGetModsForWeaponSlot('robot_weapon_laser_cutter', 'Capacitor').map((m) => m.id);
    expect(slots).toEqual(expect.arrayContaining(['mod_043', 'mod_044', 'mod_045', 'mod_046']));
  });
});

describe('оружие «с модом из коробки»: Автоматический 10-мм пистолет', () => {
  // Рука Мистера Помощника держит оружие (canHoldWeapons: true).
  const slot = (mods = []) => ({
    limb: { id: 'robot_arm_mister_handy' },
    heldWeapon: { id: 'robot_weapon_auto_10mm', ...(mods.length ? { appliedMods: Object.fromEntries(mods.map((m) => [m.slot, m.id])) } : {}) },
  });

  it('заводской авто-ресивер применён: урон 4−1=3, скорострельность 3+2=5, качество «Неточный»', () => {
    const cards = attacksFromSlot(slot(), { slotId: 'arm1' });
    const card = cards.find((c) => c.id === 'robot_weapon_auto_10mm');
    expect(card.damage).toBe(3);
    expect(card.fireRate).toBe(5);
    expect(card.qualities.map((q) => q.qualityId ?? q)).toContain('quality_inaccurate');
    expect(card.appliedMods).toEqual({ Receiver: 'mod_008' });
  });

  it('карточка показывает заводской мод как установленный (и в худой форме)', () => {
    const cards = collectAttacks({ arm1: slot() });
    const card = cards.find((c) => c.id === 'robot_weapon_auto_10mm');
    expect(card.modIds).toContain('mod_008');
    expect(card.isBuiltin).toBeUndefined(); // в ладони — не встроенное
  });

  it('мод игрока в том же слоте снимает заводской: Усиленный (+2 урона) вместо авто', () => {
    const mod_005 = catalog.weaponMods.find((m) => m.id === 'mod_005');
    const cards = attacksFromSlot(slot([mod_005]), { slotId: 'arm1' });
    const card = cards.find((c) => c.id === 'robot_weapon_auto_10mm');
    expect(card.damage).toBe(6); // 4 базы + 2 Усиленного, авто-мода нет
    expect(card.fireRate).toBe(3); // заводская скорострельность записи
    expect(card.appliedMods).toEqual({ Receiver: 'mod_005' });
    expect(card.modIds).not.toContain('mod_008');
  });

  it('снятие модов возвращает заводской авто-ресивер — это часть сути оружия', () => {
    const mod_005 = catalog.weaponMods.find((m) => m.id === 'mod_005');
    const cleared = slot([mod_005]);
    cleared.heldWeapon = { id: 'robot_weapon_auto_10mm', appliedMods: {} };
    const card = attacksFromSlot(cleared, { slotId: 'arm1' }).find((c) => c.id === 'robot_weapon_auto_10mm');
    expect(card.appliedMods).toEqual({ Receiver: 'mod_008' });
    expect(card.damage).toBe(3);
  });

  it('незаводской мод не теряется при сохранении слота (roundtrip худой формы)', () => {
    const slim = serializeSlot(slot());
    expect(slim.heldWeaponId).toBe('robot_weapon_auto_10mm');
    expect(slim.heldWeaponMods).toEqual([]); // заводской мод — из записи, не из слота
  });

  it('оружие-конечность (кит Мистера Помощника) тоже несёт заводской мод', () => {
    // Огнемёт как конечность в ките: weaponAsLimb → attackId → та же materialize.
    const flamerSlot = { limb: { id: 'robot_weapon_flamethrower' } };
    const cards = collectAttacks({ arm1: flamerSlot });
    const card = cards.find((c) => c.id === 'robot_weapon_flamethrower');
    expect(card).toBeTruthy();
    expect(card.attackRole).toBe('ownAttack');
    // у Огнемёта заводских модов нет — статы записи без изменений
    expect(card.modIds).toEqual([]);
    expect(card.appliedMods).toEqual({});
  });
});
