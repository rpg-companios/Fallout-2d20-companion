// __tests__/robot/robot-armor-catalog-book.test.js
//
// Каталог защитных слоёв сверен с таблицей из книги (референс владельца).
// Строка таблицы: [шаблон, тип конечности, ФЗ, ЭЗ, грузоподъёмность, цена, требование].
//
// Локации в книге: Оптика (head), Корпус (body), Руки (arm), Двигатель (mover).
// Универсальные обшивки («Все») размножены по локациям — это решение каталога,
// чтобы фильтр по типу конечности работал как есть.
import { describe, it, expect } from 'vitest';

import platingFile from '../../modules/fallout/data/equipment/robot/armor_plating.json';
import framesFile from '../../modules/fallout/data/equipment/robot/frames.json';
import armorFile from '../../modules/fallout/data/equipment/robot/armor.json';
import weaponAsLimbFile from '../../modules/fallout/data/equipment/robot/weaponAsLimb.json';
import weaponsFile from '../../modules/fallout/data/equipment/robot/weapons.json';

const ARMORER = (rank) => `Armorer ${rank}`;

// ── Обшивка: 6 типов × 4 локации ────────────────────────────────────────────
const plating = (template, phys, energy, carry, cost, perk) => ([
  [template, 'head', phys, energy, carry.head, cost.head, perk],
  [template, 'body', phys, energy, carry.body, cost.body, perk],
  [template, 'arm', phys, energy, carry.arm, cost.arm, perk],
  [template, 'mover', phys, energy, carry.mover, cost.mover, perk],
]);

const LOCATION_10_20 = { head: -10, body: -20, arm: -10, mover: -10 };
// Обшивка Мистера Храбреца в книге одна на все локации — модификатор везде -10.
const ALL_NEG_10 = { head: -10, body: -10, arm: -10, mover: -10 };
const COST_10_20 = { head: 10, body: 20, arm: 10, mover: 10 };
const COST_15_30 = { head: 15, body: 30, arm: 15, mover: 15 };

const BOOK_PLATING = [
  ...plating('robot_plating_standard', 2, 0,
    { head: 0, body: 0, arm: 0, mover: 0 }, { head: 0, body: 0, arm: 0, mover: 0 }, null),
  ...plating('robot_plating_mister_gutsy', 2, 2, ALL_NEG_10,
    { head: 0, body: 0, arm: 0, mover: 0 }, null),
  ...plating('robot_plating_primal', 2, 0, LOCATION_10_20, COST_10_20, null),
  ...plating('robot_plating_serrated', 2, 0, LOCATION_10_20, COST_15_30, ARMORER(1)),
  ...plating('robot_plating_noxious', 2, 0, LOCATION_10_20, COST_15_30, ARMORER(1)),
  ...plating('robot_plating_toxic', 2, 0, LOCATION_10_20, COST_15_30, ARMORER(3)),
];

// ── Ра́мы: 3 типа × 4 локации ───────────────────────────────────────────────
const BOOK_FRAMES = [
  ...plating('robot_frame_actuated', 1, 1,
    { head: 10, body: 20, arm: 10, mover: 10 }, { head: 15, body: 30, arm: 15, mover: 15 }, null),
  ...plating('robot_frame_voltaic', 2, 2,
    { head: 10, body: 20, arm: 10, mover: 10 }, { head: 20, body: 40, arm: 20, mover: 20 }, ARMORER(2)),
  ...plating('robot_frame_hydraulic', 3, 3,
    { head: 5, body: 10, arm: 5, mover: 5 }, { head: 30, body: 60, arm: 30, mover: 30 }, ARMORER(3)),
];

// ── Броня: «Заводская броня» на все четыре локации + складская на корпус ────
const BOOK_ARMOR = [
  ['robot_armor_factory', 'head', 1, 1, 0, 10, null],
  ['robot_armor_factory', 'body', 1, 1, 0, 20, null],
  ['robot_armor_factory', 'arm', 1, 1, 0, 10, null],
  ['robot_armor_factory', 'mover', 1, 1, 0, 10, null],
  ['robot_armor_factory_storage', 'body', 1, 1, 20, 25, ARMORER(1)],
];

// ── Навесы на руки (ARM ATTACHMENTS): сложность, перки, навык ───────────────
const BOOK_ATTACHMENTS = [
  ['robot_weapon_circular_saw', 3, ['Blacksmith 1'], 'REPAIR'],
  ['robot_weapon_construction_claw', 3, ['Blacksmith 1'], 'REPAIR'],
  ['robot_weapon_cryojet', 4, ['Robotics Expert 1', 'Science! 1'], 'SCIENCE'],
  ['robot_weapon_drill', 3, ['Blacksmith 2'], 'REPAIR'],
  ['robot_weapon_vice_grip', 4, ['Blacksmith 3'], 'REPAIR'],
];

// Навесы из таблицы ARM ATTACHMENTS — единственные, у кого есть требования
// установки (сложность, перки, навык). Всё остальное оружие на руке — из
// комплекта: учитывается само оружие (цена, раритет), отдельной строки в
// таблице у него нет.
const INSTALL_FIELDS = ['installComplexity', 'installPerksRequired', 'installSkill'];

const row = (entry) => {
  const dr = entry.damageResistance || {};
  return [
    entry.templateId,
    entry.limbType,
    dr.physical,
    dr.energy,
    entry.carryWeightModifier,
    entry.cost,
    entry.perkRequired ?? null,
  ];
};

const sortRows = (rows) => [...rows].sort((a, b) => String(a).localeCompare(String(b)));

describe('каталог защитных слоёв сверен с книгой', () => {
  it('обшивка: 24 записи, все цифры по таблице', () => {
    const rows = platingFile.plating.map(row);
    expect(rows).toHaveLength(24);
    expect(sortRows(rows)).toEqual(sortRows(BOOK_PLATING));
  });

  it('ра́мы: 12 записей, все цифры по таблице', () => {
    const rows = framesFile.frames.map(row);
    expect(sortRows(rows)).toEqual(sortRows(BOOK_FRAMES));
  });

  it('броня: 5 записей, все цифры по таблице', () => {
    const rows = armorFile.armor.map(row);
    expect(sortRows(rows)).toEqual(sortRows(BOOK_ARMOR));
  });

  it('навесы на руки: сложность, перки и навык по таблице', () => {
    const entries = weaponAsLimbFile.weaponAsLimb || weaponAsLimbFile;
    for (const [id, complexity, perks, skill] of BOOK_ATTACHMENTS) {
      const entry = entries.find((candidate) => candidate.id === id);
      expect(entry, `${id} должен быть в каталоге`).toBeTruthy();
      expect([entry.id, entry.installComplexity, entry.installPerksRequired, entry.installSkill])
        .toEqual([id, complexity, perks, skill]);
    }
  });

  it('требования установки — только у пяти навесов из таблицы', () => {
    const entries = weaponAsLimbFile.weaponAsLimb || weaponAsLimbFile;
    const withInstall = entries
      .filter((entry) => INSTALL_FIELDS.some((field) => field in entry))
      .map((entry) => entry.id);
    expect(withInstall.sort()).toEqual(BOOK_ATTACHMENTS.map(([id]) => id).sort());
  });

  it('Карабин Теслы — оружие, а не навес из таблицы: требований установки нет', () => {
    // Для робомозга он навес на руку (выбор комплекта), но в таблице ARM
    // ATTACHMENTS его нет: требования у него были скопированы с Криоструи.
    const entries = weaponAsLimbFile.weaponAsLimb || weaponAsLimbFile;
    const tesla = entries.find((entry) => entry.id === 'robot_weapon_tesla_arm');
    expect(tesla, 'Карабин Теслы должен остаться оружием-конечностью').toBeTruthy();
    for (const field of INSTALL_FIELDS) {
      expect(field in tesla, `${field} у Карабина Теслы`).toBe(false);
    }
    // И в каталоге оружия — тоже.
    const weapon = (weaponsFile.weapons || weaponsFile).find((entry) => entry.id === 'robot_weapon_tesla_arm');
    for (const field of INSTALL_FIELDS) {
      expect(field in weapon, `${field} у Карабина Теслы в weapons.json`).toBe(false);
    }
  });
});
