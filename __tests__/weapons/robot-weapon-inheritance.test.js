// __tests__/weapons/robot-weapon-inheritance.test.js
//
// Патчи 312+314: робо-оружие, которое людское, — это ПОЛНЫЙ ВАРИАНТ людского
// (trueItemId, как «Опасная бритва» у бритвы-переключателя). Слово владельца:
// «иначе это была бы отдельная запись с отдельным id и отдельными
// характеристиками».
//   Огнемёт Мистера Помощника = людской Огнемёт;
//   Лазерный резак = людской Лазерный пистолет;
//   Автоматический 10-мм пистолет = Пистолет 10мм с авто-ресивером (mod_008)
//   из коробки (конвенция кита супермутанта: weaponId + modIds).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { attacksFromSlot, collectAttacks, serializeSlot } from '../../domain/robotSlots';
import { getRobotLimbCatalog } from '../../domain/registry';
import { catalogGetWeaponMods, catalogGetModsForWeaponSlot, catalogGetWeaponById } from '../../db/catalogSource';
import { getEquipmentCatalog } from '../../i18n/equipmentCatalog';

const ROOT = join(__dirname, '../..');
const catalog = getRobotLimbCatalog();

const robotWeapons = () => JSON.parse(
  readFileSync(join(ROOT, 'modules/fallout/data/equipment/robot/weapons.json'), 'utf8'),
);
const humanWeapons = () => JSON.parse(
  readFileSync(join(ROOT, 'modules/fallout/data/equipment/weapons.json'), 'utf8'),
);

const VARIANTS = [
  ['robot_weapon_flamethrower', 'weapon_flamer'],
  ['robot_weapon_laser_cutter', 'weapon_laser_gun'],
  ['robot_weapon_auto_10mm', 'weapon_10mm_pistol'],
];

// Поля боёвки и экономики: у варианта их быть НЕ должно — только от базы.
const COMBAT_FIELDS = [
  'damage', 'damageType', 'fireRate', 'range', 'mainAttr', 'mainSkill',
  'weight', 'cost', 'rarity', 'ammoId', 'qualities', 'effects',
];

describe('данные: вариант = личность робо-записи, характеристики от базы', () => {
  it('trueItemId указывает на существующие записи людского оружия', () => {
    const humans = new Set(humanWeapons().map((w) => w.id));
    const linked = robotWeapons().filter((w) => w.trueItemId);
    expect(linked.map((w) => w.id).sort()).toEqual(VARIANTS.map(([r]) => r).sort());
    for (const w of linked) {
      expect(humans.has(w.trueItemId)).toBe(true);
    }
  });

  it('у варианта нет собственных характеристик — иначе это отдельное оружие', () => {
    for (const w of robotWeapons().filter((x) => x.trueItemId)) {
      for (const field of COMBAT_FIELDS) {
        expect(`${w.id}.${field}`).toBe(`${w.id}.${field}`); // читаемо при падении
        expect(w[field]).toBeUndefined();
      }
    }
  });

  it('в коде нет зашитых связей: номерные id старой базы нигде не объявлены', () => {
    const src = readFileSync(join(ROOT, 'db/catalogSource.js'), 'utf8');
    expect(src).not.toMatch(/ROBOT_WEAPON_BASE_MAP/);
    expect(src).not.toMatch(/weapon_\d{3}/);
    const weapons = JSON.parse(readFileSync(join(ROOT, 'modules/fallout/data/equipment/weapons.json'), 'utf8'));
    expect(weapons.some((w) => /^weapon_\d+$/.test(w.id || ''))).toBe(false);
  });
});

describe('каталог: развёрнутый вариант несёт статы базы и своё имя', () => {
  const catalogRu = getEquipmentCatalog('ru-RU');
  const byId = (id) => catalogRu.weapons.find((w) => w.id === id);

  it('Огнемёт робота = Огнемёт людей по бою; имя робо-записи сохранено', () => {
    const robot = byId('robot_weapon_flamethrower');
    const human = byId('weapon_flamer');
    expect(robot.damage).toBe(human.damage);
    expect(robot.fireRate).toBe(human.fireRate);
    expect(robot.ammoId).toBe(human.ammoId);
    expect(robot.damageType).toEqual(human.damageType);
    expect(robot.name).toBe('Огнемёт');
    expect(robot.isRobotWeapon).toBe(true);
    expect(robot.trueItemId).toBe('weapon_flamer');
  });

  it('Лазерный резак: скорострельность базы (2, была 1), имя своё', () => {
    const robot = byId('robot_weapon_laser_cutter');
    const human = byId('weapon_laser_gun');
    expect(robot.fireRate).toBe(human.fireRate);
    expect(robot.fireRate).toBe(2);
    expect(robot.name).toBe('Лазерный резак');
    expect(robot.effects).toEqual(human.effects);
  });

  it('строки экранного каталога (окно улучшения) тоже считают от базы', () => {
    const row = catalogGetWeaponById('robot_weapon_flamethrower');
    expect(Number(row.damage)).toBe(3);
    expect(Number(row.fireRate)).toBe(4);
  });
});

describe('окно улучшения: людские моды подходят к робо-версиям', () => {
  it('моды Огнемёта людей видны у Огнемёта Мистера Помощника', () => {
    const human = catalogGetWeaponMods('weapon_flamer').map((m) => m.id);
    const robot = catalogGetWeaponMods('robot_weapon_flamethrower').map((m) => m.id);
    expect(robot).toEqual(expect.arrayContaining(human));
    expect(human.length).toBeGreaterThan(0);
  });

  it('слоты Лазерного резака — слоты Лазерного пистолета (конденсаторы)', () => {
    const slots = catalogGetModsForWeaponSlot('robot_weapon_laser_cutter', 'Capacitor').map((m) => m.id);
    expect(slots).toEqual(expect.arrayContaining(['mod_beta_wave_tuner', 'mod_boosted_capacitor', 'mod_photon_exciter', 'mod_photon_agitator']));
  });
});

describe('оружие «с модом из коробки»: Автоматический 10-мм пистолет', () => {
  // Рука Мистера Помощника держит оружие (canHoldWeapons: true).
  const slot = (mods = []) => ({
    limb: { id: 'robot_arm_mister_handy' },
    heldWeapon: { id: 'robot_weapon_auto_10mm', ...(mods.length ? { appliedMods: Object.fromEntries(mods.map((m) => [m.slot, m.id])) } : {}) },
  });

  it('заводской авто-ресивер применён: урон 4−1=3, скорострельность 2+2=4, качество «Неточный»', () => {
    const cards = attacksFromSlot(slot(), { slotId: 'arm1' });
    const card = cards.find((c) => c.id === 'robot_weapon_auto_10mm');
    expect(card.damage).toBe(3);
    expect(card.fireRate).toBe(4);
    expect(card.qualities.map((q) => q.qualityId ?? q)).toContain('quality_inaccurate');
    expect(card.appliedMods).toEqual({ Receiver: 'mod_automatic' });
  });

  it('карточка показывает заводской мод как установленный', () => {
    const cards = collectAttacks({ arm1: slot() });
    const card = cards.find((c) => c.id === 'robot_weapon_auto_10mm');
    expect(card.modIds).toContain('mod_automatic');
    expect(card.isBuiltin).toBeUndefined(); // в ладони — не встроенное
  });

  it('мод игрока в том же слоте снимает заводской: Усиленный (+2 урона) вместо авто', () => {
    const mod_005 = catalog.weaponMods.find((m) => m.id === 'mod_powerful');
    const cards = attacksFromSlot(slot([mod_005]), { slotId: 'arm1' });
    const card = cards.find((c) => c.id === 'robot_weapon_auto_10mm');
    expect(card.damage).toBe(6); // 4 базы + 2 Усиленного, авто-мода нет
    expect(card.fireRate).toBe(2); // базовая скорострельность Пистолета 10мм
    expect(card.appliedMods).toEqual({ Receiver: 'mod_powerful' });
    expect(card.modIds).not.toContain('mod_automatic');
  });

  it('снятие модов возвращает заводской авто-ресивер — это часть сути оружия', () => {
    const mod_005 = catalog.weaponMods.find((m) => m.id === 'mod_powerful');
    const cleared = slot([mod_005]);
    cleared.heldWeapon = { id: 'robot_weapon_auto_10mm', appliedMods: {} };
    const card = attacksFromSlot(cleared, { slotId: 'arm1' }).find((c) => c.id === 'robot_weapon_auto_10mm');
    expect(card.appliedMods).toEqual({ Receiver: 'mod_automatic' });
    expect(card.damage).toBe(3);
  });

  it('худая форма сейва: заводской мод — из записи, слот пуст', () => {
    const slim = serializeSlot(slot());
    expect(slim.heldWeaponId).toBe('robot_weapon_auto_10mm');
    expect(slim.heldWeaponMods).toEqual([]);
  });

  it('оружие-конечность (кит Мистера Помощника) бьёт как людской Огнемёт', () => {
    const flamerSlot = { limb: { id: 'robot_weapon_flamethrower' } };
    const cards = collectAttacks({ arm1: flamerSlot });
    const card = cards.find((c) => c.id === 'robot_weapon_flamethrower');
    expect(card).toBeTruthy();
    expect(card.attackRole).toBe('ownAttack');
    // статы от людской базы (у старой робо-записи скорострельность была 2)
    expect(card.fireRate).toBe(4);
    expect(card.modIds).toEqual([]);
  });
});
